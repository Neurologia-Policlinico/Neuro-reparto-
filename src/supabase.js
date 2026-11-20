import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

export const configurato = Boolean(url && key)

export const supabase = createClient(url || 'http://localhost', key || 'x', {
  auth: { persistSession: true, autoRefreshToken: true },
  realtime: { params: { eventsPerSecond: 10 } },
})

// Informazioni non segrete per il controllo della configurazione (pagina di login)
export function infoConfigurazione() {
  let progetto = '—'
  try { progetto = new URL(url).hostname.split('.')[0] } catch { /* url mancante o non valido */ }
  let tipo = 'mancante'
  if (key?.startsWith('sb_publishable_')) tipo = 'publishable ✓'
  else if (key?.startsWith('sb_secret_')) tipo = 'SECRET ✗ (sbagliata: usa la publishable)'
  else if (key?.startsWith('eyJ')) {
    try {
      const role = JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).role
      tipo = role === 'anon' ? 'anon ✓' : `${role} ✗ (sbagliata: usa la anon)`
    } catch { tipo = 'non riconosciuta ✗' }
  } else if (key) tipo = 'non riconosciuta ✗'
  return { progetto, tipo }
}
