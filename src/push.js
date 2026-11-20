import { supabase } from './supabase'

export const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
export const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
  window.navigator.standalone === true

/** il browser sa ricevere notifiche push? */
export function supportato() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

/** chiave pubblica VAPID: generata dall'amministratore nell'app (oppure fissata in fase di build) */
let chiave
export async function chiavePubblica() {
  if (chiave) return chiave
  if (import.meta.env.VITE_VAPID_PUBLIC_KEY) return (chiave = import.meta.env.VITE_VAPID_PUBLIC_KEY)
  const { data } = await supabase.from('impostazioni').select('valore').eq('chiave', 'vapid_public').maybeSingle()
  return (chiave = data?.valore || null)
}
export function dimenticaChiave() { chiave = undefined }

function b64ToUint8(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}
const uint8ToB64 = (u) => btoa(String.fromCharCode(...u)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

const BASE = import.meta.env.BASE_URL
const isAndroid = /android/i.test(navigator.userAgent)

/** service worker dell'app: lo registro se serve e aspetto che sia attivo (al massimo 10 secondi) */
async function registrazione() {
  let reg = await navigator.serviceWorker.getRegistration(BASE)
  if (!reg) reg = await navigator.serviceWorker.register(`${BASE}sw.js`, { scope: BASE })
  const pronto = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise((r) => setTimeout(() => r(null), 10000)),
  ])
  if (!pronto) throw new Error('Il servizio notifiche dell\'app non si è avviato. Chiudi completamente l\'app (anche dalle app recenti) e riaprila, poi riprova.')
  return pronto
}

/** stato del permesso: "granted" | "denied" | "default" | "non supportato" */
export const permesso = () => ('Notification' in window ? Notification.permission : 'non supportato')

export function comeSbloccare() {
  if (isIOS) return 'Le notifiche sono bloccate. Apri Impostazioni dell\'iPhone/iPad → Notifiche → Neuro → Consenti notifiche, poi riprova.'
  if (isAndroid) return 'Le notifiche sono bloccate. Apri Impostazioni del telefono → App → Neuro (oppure Chrome) → Notifiche → Consenti, poi riprova.'
  return 'Le notifiche sono bloccate per questo sito: abilitale dalle impostazioni del browser (icona a sinistra dell\'indirizzo), poi riprova.'
}

export async function statoAttuale() {
  if (!supportato()) return { attive: false }
  const reg = await navigator.serviceWorker.getRegistration(BASE)
  if (!reg) return { attive: false }
  const sub = await reg.pushManager.getSubscription()
  if (!sub) return { attive: false }
  const { data } = await supabase
    .from('notifiche_iscrizioni').select('reparti').eq('endpoint', sub.endpoint).maybeSingle()
  return { attive: Boolean(data), reparti: data?.reparti ?? null }
}

export async function attiva(reparti, passo = () => {}) {
  // il permesso va chiesto subito, nello stesso tocco del pulsante (Chrome/Android lo richiedono)
  if (Notification.permission === 'denied') throw new Error(comeSbloccare())
  passo('Richiesta del permesso al telefono…')
  const perm = Notification.permission === 'granted' ? 'granted' : await Promise.race([
    Notification.requestPermission(),
    new Promise((r) => setTimeout(() => r('nessuna risposta'), 15000)),
  ])
  if (perm !== 'granted') throw new Error(perm === 'denied' ? comeSbloccare()
    : 'Il telefono non ha mostrato la richiesta di permesso. ' + comeSbloccare().replace('Le notifiche sono bloccate. ', ''))
  passo('Preparazione…')
  const vapid = await chiavePubblica()
  if (!vapid) throw new Error('Le notifiche non sono ancora state configurate da un amministratore.')
  const reg = await registrazione()
  passo('Iscrizione del dispositivo…')
  let sub = await reg.pushManager.getSubscription()
  // se l'iscrizione esistente è stata fatta con una chiave diversa (chiavi rigenerate), la rifaccio
  if (sub) {
    const k = sub.options?.applicationServerKey
    if (k && uint8ToB64(new Uint8Array(k)) !== vapid) { await sub.unsubscribe(); sub = null }
  }
  if (!sub) {
    try {
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToUint8(vapid) })
    } catch (e) {
      throw new Error(`Il telefono non ha accettato l'iscrizione alle notifiche (${e.message || e}). `
        + (isAndroid ? 'Controlla che Google Play Services sia aggiornato e che Chrome non abbia restrizioni di batteria, poi riprova.' : 'Riprova tra qualche istante.'))
    }
  }
  passo('Salvataggio…')
  const j = sub.toJSON()
  // se il telefono era registrato da un altro utente, rimuovo la vecchia riga (se mia)
  await supabase.from('notifiche_iscrizioni').delete().eq('endpoint', j.endpoint)
  const { error } = await supabase.from('notifiche_iscrizioni').insert({
    endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth,
    reparti: reparti && reparti.length ? reparti : null,
  })
  if (error) throw error
}

export async function disattiva() {
  if (!supportato()) return
  const reg = await navigator.serviceWorker.getRegistration(BASE)
  const sub = await reg?.pushManager.getSubscription()
  if (sub) {
    await supabase.from('notifiche_iscrizioni').delete().eq('endpoint', sub.endpoint)
    await sub.unsubscribe()
  }
}

/** genera una nuova coppia di chiavi VAPID nel browser (la privata non lascia mai questo dispositivo se non verso il database) */
export async function generaChiavi() {
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  const jwk = await crypto.subtle.exportKey('jwk', kp.privateKey)
  const pub = uint8ToB64(new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey)))
  return { pubblica: pub, privata: jwk.d }
}
