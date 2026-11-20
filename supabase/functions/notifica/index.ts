// Supabase Edge Function "notifica": invia le notifiche push.
// Viene chiamata dai "Database Webhooks" (vedi README):
//   - tabella attivita, eventi INSERT e UPDATE
//       nuova attività            -> chi segue quel reparto (tranne chi l'ha creata)
//       attività assegnata a te   -> solo la persona assegnata
//   - tabella richieste_accesso, evento INSERT
//       nuova richiesta di accesso -> gli amministratori
// Le chiavi VAPID vengono lette dal database (generate dall'app, sezione
// Amministrazione) oppure, in alternativa, dai Secrets della funzione.
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});
const SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:notifiche@example.com";

let vapidPronte = false;
async function preparaVapid() {
  if (vapidPronte) return true;
  let pub = Deno.env.get("VAPID_PUBLIC_KEY");
  let priv = Deno.env.get("VAPID_PRIVATE_KEY");
  if (!pub || !priv) {
    const [{ data: i }, { data: s }] = await Promise.all([
      db.from("impostazioni").select("valore").eq("chiave", "vapid_public").maybeSingle(),
      db.from("segreti").select("valore").eq("chiave", "vapid_private").maybeSingle(),
    ]);
    pub = i?.valore; priv = s?.valore;
  }
  if (!pub || !priv) return false;
  webpush.setVapidDetails(SUBJECT, pub, priv);
  vapidPronte = true;
  return true;
}

const oggi = () => new Date().toISOString().slice(0, 10);
const attivo = (p: any) => p && p.attivo && (!p.scadenza || p.scadenza >= oggi());

async function invia(iscrizioni: any[], payload: string, urgente = false) {
  const scadute: string[] = [];
  await Promise.all(iscrizioni.map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload, { TTL: 60 * 60 * 12, urgency: urgente ? "high" : "normal" });
    } catch (e: any) {
      if (e?.statusCode === 404 || e?.statusCode === 410) scadute.push(s.id);
      else console.error("push fallita", e?.statusCode, e?.body);
    }
  }));
  if (scadute.length) await db.from("notifiche_iscrizioni").delete().in("id", scadute);
  return iscrizioni.length - scadute.length;
}

// iscrizioni di utenti attivi (opzionalmente solo alcuni utenti)
async function iscrizioniAttive(soloUtenti?: string[]) {
  let q = db.from("notifiche_iscrizioni").select("id, user_id, endpoint, p256dh, auth, reparti");
  if (soloUtenti) q = q.in("user_id", soloUtenti);
  const { data: iscr } = await q;
  if (!iscr?.length) return [];
  const { data: prof } = await db.from("profili").select("id, attivo, scadenza, ruolo")
    .in("id", [...new Set(iscr.map((s) => s.user_id))]);
  const ok = new Map((prof ?? []).map((p) => [p.id, p]));
  return iscr.filter((s) => attivo(ok.get(s.user_id)));
}

// ogni risposta viene anche scritta nei Logs della funzione (Supabase -> Edge Functions -> notifica -> Logs)
const json = (d: unknown) => {
  console.log("notifica:", JSON.stringify(d));
  return new Response(JSON.stringify(d), { headers: { "content-type": "application/json" } });
};

Deno.serve(async (req) => {
  let body: any;
  try { body = await req.json(); } catch { return json({ ignorato: "corpo non valido" }); }
  if (!(await preparaVapid())) return json({ ignorato: "chiavi notifiche non configurate" });

  // ----- nuova richiesta di accesso -> amministratori
  if (body?.table === "richieste_accesso" && body?.type === "INSERT") {
    const { data: r } = await db.from("richieste_accesso").select("nome, stato").eq("id", body.record?.id).maybeSingle();
    if (!r || r.stato !== "in_attesa") return json({ ignorato: true });
    const { data: admins } = await db.from("profili").select("id").eq("ruolo", "admin").eq("attivo", true);
    const iscr = await iscrizioniAttive((admins ?? []).map((a) => a.id));
    const n = await invia(iscr, JSON.stringify({
      title: "Nuova richiesta di accesso",
      body: `${r.nome} chiede di accedere all'app`,
      url: "?admin=richieste", tag: `richiesta-${body.record.id}`,
    }));
    return json({ inviate: n });
  }

  if (body?.table !== "attivita" || !body?.record?.id) return json({ ignorato: true });

  // rileggo l'attività dal database: non mi fido del contenuto della chiamata
  const { data: a } = await db.from("attivita").select("*").eq("id", body.record.id).maybeSingle();
  if (!a || a.fatta) return json({ ignorato: true });

  const nuova = body.type === "INSERT";
  const assegnata = a.assegnata_a &&
    (nuova || (body.type === "UPDATE" && body.old_record?.assegnata_a !== a.assegnata_a));
  if (!nuova && !assegnata) return json({ ignorato: true });

  const [{ data: paz }, { data: rep }, { data: autore }] = await Promise.all([
    db.from("pazienti").select("nome, letti(nome)").eq("id", a.paziente_id).single(),
    db.from("reparti").select("nome").eq("id", a.reparto_id).single(),
    a.creata_da ? db.from("profili").select("nome").eq("id", a.creata_da).single() : Promise.resolve({ data: null }),
  ]);
  let padre = "";
  if (a.parent_id) {
    const { data: p } = await db.from("attivita").select("testo").eq("id", a.parent_id).single();
    if (p) padre = `${p.testo} › `;
  }
  const letto = (paz as any)?.letti?.nome ?? "?";
  const quando = a.scadenza
    ? new Date(a.scadenza).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" })
    : a.ora;
  const testo = `${paz?.nome ?? ""}: ${quando ? `ore ${quando} – ` : ""}${padre}${a.testo}`;
  const url = a.guardia ? "?reparto=guardia" : `?reparto=${a.reparto_id}`;
  const titolo = `${a.urgente ? "🔴 " : ""}${a.guardia ? "🌙 Guardia · " : ""}${rep?.nome ?? "Reparto"} · Letto ${letto}`;

  let inviate = 0;
  let destinatari = 0;
  if (assegnata && a.assegnata_a !== a.creata_da) {
    const iscr = await iscrizioniAttive([a.assegnata_a]);
    destinatari += iscr.length;
    inviate += await invia(iscr, JSON.stringify({
      title: `👤 Assegnata a te · ${titolo}`, body: `${testo}${autore?.nome ? ` (da ${autore.nome})` : ""}`, url, tag: `assegnata-${a.id}`,
    }), a.urgente);
  }
  if (nuova) {
    const iscr = (await iscrizioniAttive()).filter((s) =>
      s.user_id !== a.creata_da && s.user_id !== a.assegnata_a && (!s.reparti || s.reparti.includes(a.reparto_id)));
    destinatari += iscr.length;
    inviate += await invia(iscr, JSON.stringify({
      title: titolo, body: `${testo}${autore?.nome ? ` (${autore.nome})` : ""}`, url, tag: `attivita-${a.id}`,
    }), a.urgente);
  }
  return json({
    attivita: a.testo, inviate, destinatari,
    nota: destinatari === 0 ? "nessun telefono iscritto a questo reparto (escluso chi ha scritto l'attività)" : undefined,
  });
});
