// Supabase Edge Function "admin": operazioni sugli account che richiedono
// privilegi da server (creare utenti, reimpostare password, eliminare).
// Può chiamarla solo un amministratore attivo dell'app.
import { createClient } from "npm:@supabase/supabase-js@2";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const risposta = (dati: unknown, status = 200) =>
  new Response(JSON.stringify(dati), { status, headers: { ...cors, "content-type": "application/json" } });
const errore = (msg: string, status = 400) => risposta({ errore: msg }, status);

const oggi = () => new Date().toISOString().slice(0, 10);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return errore("Metodo non consentito", 405);

  // chi sta chiamando?
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: u, error: eu } = await db.auth.getUser(token);
  if (eu || !u?.user) return errore("Accesso non valido", 401);
  const { data: me } = await db.from("profili").select("ruolo, attivo, scadenza").eq("id", u.user.id).single();
  if (!me || me.ruolo !== "admin" || !me.attivo || (me.scadenza && me.scadenza < oggi())) {
    return errore("Solo un amministratore può farlo", 403);
  }

  let b: Record<string, any>;
  try { b = await req.json(); } catch { return errore("Richiesta non valida"); }

  try {
    switch (b.azione) {
      case "crea": {
        const email = String(b.email ?? "").trim().toLowerCase();
        const nome = String(b.nome ?? "").trim();
        const password = String(b.password ?? "");
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return errore("Email non valida");
        if (password.length < 8) return errore("La password deve avere almeno 8 caratteri");
        const { data, error } = await db.auth.admin.createUser({
          email, password, email_confirm: true, user_metadata: { nome: nome || email.split("@")[0] },
        });
        if (error) {
          return errore(/already|registered|exists/i.test(error.message) ? "Esiste già un utente con questa email" : error.message);
        }
        const id = data.user.id;
        await db.from("profili").upsert({
          id, email, nome: nome || email.split("@")[0],
          ruolo: b.ruolo === "admin" ? "admin" : "medico",
          scadenza: b.scadenza || null, attivo: true,
        });
        if (b.richiesta_id) {
          await db.from("richieste_accesso")
            .update({ stato: "approvata", gestita_da: u.user.id, gestita_il: new Date().toISOString() })
            .eq("id", b.richiesta_id);
        }
        return risposta({ ok: true, id });
      }

      case "password": {
        const password = String(b.password ?? "");
        if (password.length < 8) return errore("La password deve avere almeno 8 caratteri");
        const { error } = await db.auth.admin.updateUserById(String(b.user_id), { password });
        if (error) return errore(error.message);
        return risposta({ ok: true });
      }

      case "elimina": {
        const id = String(b.user_id);
        if (id === u.user.id) return errore("Non puoi eliminare il tuo account");
        const { data: p } = await db.from("profili").select("ruolo").eq("id", id).single();
        if (p?.ruolo === "admin") {
          const { count } = await db.from("profili").select("id", { count: "exact", head: true })
            .eq("ruolo", "admin").eq("attivo", true).neq("id", id);
          if (!count) return errore("Deve restare almeno un amministratore attivo");
        }
        const { error } = await db.auth.admin.deleteUser(id);
        if (error) return errore(error.message);
        return risposta({ ok: true });
      }

      default:
        return errore("Azione sconosciuta");
    }
  } catch (e) {
    return errore(String((e as Error)?.message ?? e), 500);
  }
});
