// Scadenze, ripetizioni e giorni di ricovero.
// Tutte le funzioni accettano "adesso" per poter essere provate con date fisse.

const MIN = 60e3
const ORA = 60 * MIN

const due = (n) => String(n).padStart(2, '0')
const hhmm = (d) => `${due(d.getHours())}:${due(d.getMinutes())}`

/** "08:00, 12:00 18" -> ["08:00", "12:00", "18:00"] (ordinati, senza doppioni) */
export function leggiOrari(testo) {
  if (!testo) return []
  const out = new Set()
  for (const pezzo of String(testo).split(/[\s,;·]+/)) {
    const m = pezzo.match(/^(\d{1,2})(?:[:.](\d{2}))?$/)
    if (!m) continue
    const h = Number(m[1]), mi = Number(m[2] ?? 0)
    if (h > 23 || mi > 59) continue
    out.add(`${due(h)}:${due(mi)}`)
  }
  return [...out].sort()
}

function alleOre(giorno, orario) {
  const [h, m] = orario.split(':').map(Number)
  const d = new Date(giorno)
  d.setHours(h, m, 0, 0)
  return d
}

/** prossimo degli orari fissi dopo "adesso" (oggi o domani) */
function prossimoOrario(orari, adesso) {
  for (const giorno of [0, 1]) {
    const g = new Date(adesso)
    g.setDate(g.getDate() + giorno)
    for (const o of orari) {
      const c = alleOre(g, o)
      if (c.getTime() > adesso.getTime() + MIN) return c
    }
  }
  return null
}

/** prossimo quarto d'ora (per la prima scadenza di un'attività "ogni N ore") */
function prossimoQuarto(adesso) {
  const d = new Date(adesso)
  d.setSeconds(0, 0)
  d.setMinutes(Math.ceil((d.getMinutes() + 1) / 15) * 15)
  return d
}

/** scadenza della prossima ripetizione, quando un'attività ripetuta viene spuntata */
export function prossimaScadenza(a, adesso = new Date()) {
  if (a.ripeti_ore > 0) {
    const passo = a.ripeti_ore * ORA
    const base = a.scadenza ? new Date(a.scadenza) : adesso
    let n = new Date(base.getTime() + passo)
    if (n.getTime() <= adesso.getTime()) n = new Date(adesso.getTime() + passo) // fatta in ritardo
    return n
  }
  const orari = leggiOrari(a.ripeti_orari)
  if (orari.length) return prossimoOrario(orari, adesso)
  return null
}

/** prima scadenza di una nuova attività (da pacchetto o modulo) */
export function primaScadenza({ ripeti_ore, ripeti_orari, entro_ore }, adesso = new Date()) {
  if (entro_ore > 0) return new Date(adesso.getTime() + entro_ore * ORA)
  if (ripeti_ore > 0) return prossimoQuarto(adesso)
  const orari = leggiOrari(ripeti_orari)
  if (orari.length) return prossimoOrario(orari, adesso)
  return null
}

/** "22:00" scelto nel campo ora -> oggi alle 22, oppure domani se è già passato da più di un'ora */
export function oraInScadenza(orario, adesso = new Date()) {
  if (!/^\d{2}:\d{2}$/.test(orario || '')) return null
  let d = alleOre(adesso, orario)
  if (d.getTime() < adesso.getTime() - ORA) d = new Date(d.getTime() + 24 * ORA)
  return d
}

/** etichetta della scadenza: { testo: "14:00" | "domani 08:00" | "12/03 09:00", stato: "scaduta" | "vicina" | "" } */
export function etichettaScadenza(a, adesso = new Date()) {
  if (!a.scadenza) return a.ora ? { testo: a.ora, stato: '' } : null
  const d = new Date(a.scadenza)
  const oggi = new Date(adesso)
  const domani = new Date(adesso)
  domani.setDate(domani.getDate() + 1)
  const ieri = new Date(adesso)
  ieri.setDate(ieri.getDate() - 1)
  let testo = hhmm(d)
  if (d.toDateString() === domani.toDateString()) testo = `domani ${testo}`
  else if (d.toDateString() === ieri.toDateString()) testo = `ieri ${testo}`
  else if (d.toDateString() !== oggi.toDateString()) testo = `${due(d.getDate())}/${due(d.getMonth() + 1)} ${testo}`
  let stato = ''
  if (!a.fatta) {
    if (d.getTime() < adesso.getTime()) stato = 'scaduta'
    else if (d.getTime() - adesso.getTime() <= ORA) stato = 'vicina'
  }
  return { testo, stato }
}

export function testoRipeti(a) {
  if (a.ripeti_ore > 0) return `ogni ${a.ripeti_ore}h`
  const o = leggiOrari(a.ripeti_orari)
  if (o.length) return o.map((x) => (x.endsWith(':00') ? x.slice(0, 2) : x)).join('·')
  return ''
}

export const ripetuta = (a) => a.ripeti_ore > 0 || leggiOrari(a.ripeti_orari).length > 0

/** ISO <-> valore del campo <input type="datetime-local"> (ora locale) */
export function inInputLocale(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getFullYear()}-${due(d.getMonth() + 1)}-${due(d.getDate())}T${hhmm(d)}`
}
export function daInputLocale(v) {
  if (!v) return null
  const d = new Date(v)
  return isNaN(d) ? null : d.toISOString()
}

/** data di oggi "AAAA-MM-GG" in ora locale */
export function oggiLocale(adesso = new Date()) {
  return `${adesso.getFullYear()}-${due(adesso.getMonth() + 1)}-${due(adesso.getDate())}`
}

/** giornata di degenza: il giorno del ricovero è G1 */
export function giornoRicovero(data, adesso = new Date()) {
  if (!data) return null
  const [y, m, g] = String(data).slice(0, 10).split('-').map(Number)
  const inizio = new Date(y, m - 1, g)
  const oggi = new Date(adesso.getFullYear(), adesso.getMonth(), adesso.getDate())
  const n = Math.round((oggi - inizio) / (24 * ORA)) + 1
  return n >= 1 ? n : 1
}

// ---------- pacchetti: tempi scritti tra parentesi quadre in fondo alla riga
//   "NIHSS [ogni 6h]"   "Glicemia [08:00 12:00 18:00]"   "TC di controllo [entro 24h]"
export function leggiTempi(riga) {
  const m = riga.match(/^(.*?)\s*\[([^\]]+)\]\s*$/)
  if (!m) return { t: riga.trim() }
  const t = m[1].trim()
  const dentro = m[2].trim().toLowerCase()
  let r
  if ((r = dentro.match(/^ogni\s+(\d{1,2})\s*h(?:ore)?$/))) return { t, ripeti_ore: Number(r[1]) }
  if ((r = dentro.match(/^entro\s+(\d{1,3})\s*h(?:ore)?$/))) return { t, entro_ore: Number(r[1]) }
  const orari = leggiOrari(dentro)
  if (orari.length) return { t, ripeti_orari: orari.join(',') }
  return { t: riga.trim() } // non riconosciuto: lo lascio nel testo
}
export function scriviTempi(v) {
  if (v.ripeti_ore) return `${v.t} [ogni ${v.ripeti_ore}h]`
  if (v.entro_ore) return `${v.t} [entro ${v.entro_ore}h]`
  if (v.ripeti_orari) return `${v.t} [${leggiOrari(v.ripeti_orari).join(' ')}]`
  return v.t
}
