// Crea in blocco gli account dei medici a partire da un file CSV.
// Uso:
//   SUPABASE_URL=https://xxxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=eyJ... node scripts/crea-utenti.mjs medici.csv
//
// Formato medici.csv (prima riga = intestazione):
//   email,nome,password
//   mario.rossi@ospedale.it,Dr. Rossi,Provvisoria2026!
//
// ATTENZIONE: la "service role key" dà accesso completo al database.
// Usala solo dal tuo computer, non metterla mai nell'app o su GitHub.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env
const file = process.argv[2]
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !file) {
  console.error('Uso: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/crea-utenti.mjs medici.csv')
  process.exit(1)
}
const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const righe = readFileSync(file, 'utf8').split(/\r?\n/).map((r) => r.trim()).filter(Boolean)
const [, ...dati] = righe
let ok = 0
for (const r of dati) {
  const [email, nome, password] = r.split(/[;,]/).map((s) => s.trim())
  if (!email || !password) { console.warn('Riga saltata:', r); continue }
  const { error } = await db.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { nome: nome || email.split('@')[0] },
  })
  if (error) console.error(`✗ ${email}: ${error.message}`)
  else { ok++; console.log(`✓ ${email}`) }
}
console.log(`\nCreati ${ok} utenti su ${dati.length}.`)
