// Supabase Edge Function: invia una notifica push quando viene creata
// una nuova attività. Viene chiamata da un "Database Webhook" su INSERT
// nella tabella public.attivita (vedi README).
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@example.com";
const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET") ?? "";

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(async (req) => {
  if (WEBHOOK_SECRET && req.headers.get("x-webhook-secret") !== WEBHOOK_SECRET) {
    return new Response("unauthorized", { status: 401 });
  }

  const body = await req.json();
  const a = body?.record;
  if (body?.type !== "INSERT" || body?.table !== "attivita" || !a) {
    return new Response("ignorato");
  }

  const [{ data: paz }, { data: rep }, { data: autore }] = await Promise.all([
    db.from("pazienti").select("nome, letti(nome)").eq("id", a.paziente_id).single(),
    db.from("reparti").select("nome").eq("id", a.reparto_id).single(),
    a.creata_da
      ? db.from("profili").select("nome").eq("id", a.creata_da).single()
      : Promise.resolve({ data: null }),
  ]);

  let testoPadre = "";
  if (a.parent_id) {
    const { data: p } = await db.from("attivita").select("testo").eq("id", a.parent_id).single();
    if (p) testoPadre = `${p.testo} › `;
  }

  const letto = (paz as any)?.letti?.nome ?? "?";
  const payload = JSON.stringify({
    title: `${a.urgente ? "🔴 " : ""}${a.guardia ? "🌙 Guardia · " : ""}${rep?.nome ?? "Reparto"} · Letto ${letto}`,
    body: `${paz?.nome ?? ""}: ${a.ora ? `ore ${a.ora} – ` : ""}${testoPadre}${a.testo}${autore?.nome ? ` (${autore.nome})` : ""}`,
    url: a.guardia ? "/?reparto=guardia" : `/?reparto=${a.reparto_id}`,
    tag: `attivita-${a.id}`,
  });

  // iscritti: tutti tranne chi ha creato l'attività, filtrati per reparto
  const { data: iscr } = await db
    .from("notifiche_iscrizioni")
    .select("id, user_id, endpoint, p256dh, auth, reparti");

  const destinatari = (iscr ?? []).filter(
    (s) => s.user_id !== a.creata_da && (!s.reparti || s.reparti.includes(a.reparto_id)),
  );

  const scadute: string[] = [];
  await Promise.all(
    destinatari.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
          { TTL: 60 * 60 * 12, urgency: a.urgente ? "high" : "normal" },
        );
      } catch (e: any) {
        if (e?.statusCode === 404 || e?.statusCode === 410) scadute.push(s.id);
        else console.error("push fallita", e?.statusCode, e?.body);
      }
    }),
  );

  if (scadute.length) await db.from("notifiche_iscrizioni").delete().in("id", scadute);

  return new Response(JSON.stringify({ inviate: destinatari.length - scadute.length }), {
    headers: { "content-type": "application/json" },
  });
});
