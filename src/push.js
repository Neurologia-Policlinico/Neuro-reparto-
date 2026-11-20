import { supabase } from './supabase'

const VAPID = import.meta.env.VITE_VAPID_PUBLIC_KEY

export const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
export const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
  window.navigator.standalone === true

export function supportato() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && Boolean(VAPID)
}

function b64ToUint8(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

async function registrazione() {
  return navigator.serviceWorker.ready
}

export async function statoAttuale() {
  if (!supportato()) return { attive: false }
  const reg = await registrazione()
  const sub = await reg.pushManager.getSubscription()
  if (!sub) return { attive: false }
  const { data } = await supabase
    .from('notifiche_iscrizioni').select('reparti').eq('endpoint', sub.endpoint).maybeSingle()
  return { attive: Boolean(data), reparti: data?.reparti ?? null }
}

export async function attiva(reparti) {
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') throw new Error('Permesso notifiche negato. Abilitalo dalle impostazioni del telefono.')
  const reg = await registrazione()
  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToUint8(VAPID) })
  }
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
  const reg = await registrazione()
  const sub = await reg.pushManager.getSubscription()
  if (sub) {
    await supabase.from('notifiche_iscrizioni').delete().eq('endpoint', sub.endpoint)
    await sub.unsubscribe()
  }
}
