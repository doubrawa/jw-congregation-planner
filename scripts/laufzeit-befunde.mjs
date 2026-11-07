/**
 * **Was die Laufzeit-Messung als Befund wertet** (T167) — und die Messung
 * selbst, die in der Seite läuft.
 *
 * Die Funktionen mit `ImDokument` im Namen gehen als Quelltext in die Seite
 * (`Runtime.evaluate`). Sie dürfen nichts von außen benutzen — keinen Import,
 * keine Konstante dieses Moduls. `laufzeit-befunde.test.ts` führt sie deshalb
 * aus ihrem Quelltext heraus aus.
 */

/**
 * Bis die Seite in Sprache und Schriftstufe dasteht: `<html lang>` und `--fs`
 * gesetzt, das Startbild fort, die App gezeichnet. Gibt zurück, was nach `ms`
 * noch fehlt — leer heißt bereit.
 *
 * @param {{ sprache: string, schrift: string, ms?: number }} soll
 * @returns {Promise<string[]>}
 */
export async function bereitImDokument({ sprache, schrift, ms = 15_000 }) {
  const fehlt = () => {
    const html = document.documentElement
    const offen = []
    if (html.lang !== sprache) offen.push(`Sprache ${html.lang || '–'} statt ${sprache}`)
    const fs = getComputedStyle(html).getPropertyValue('--fs').trim()
    if (fs !== schrift) offen.push(`Schriftstufe ${fs || '–'} statt ${schrift}`)
    if (document.querySelector('.startbild')) offen.push('Startbild steht noch')
    if (!document.getElementById('root')?.firstElementChild) offen.push('#root ist leer')
    return offen
  }
  const ende = performance.now() + ms
  let offen = fehlt()
  while (offen.length && performance.now() < ende) {
    await new Promise((ok) => setTimeout(ok, 50))
    offen = fehlt()
  }
  return offen
}

/** Schriften geladen, zwei Bilder gezeichnet — danach stehen die Maße fest. */
export async function ruhigImDokument() {
  await document.fonts.ready
  for (let i = 0; i < 2; i++) {
    await new Promise((ok) => {
      requestAnimationFrame(() => ok(undefined))
      setTimeout(ok, 500)
    })
  }
}

/**
 * **Die Gegenprobe:** je Befundart eine Störung (`GEGENPROBE_ARTEN`). Erkennt
 * die Messung eine davon nicht, misst sie nichts — dann ist der Lauf rot.
 * Ohne sie sähe eine Messung, die still kaputtgeht, aus wie eine App ohne
 * Befund.
 */
export function stoerungImDokument() {
  console.error('GEGENPROBE: Konsole')
  setTimeout(() => {
    throw new Error('GEGENPROBE: Ausnahme')
  })
  // Ein Bild, das nicht kommt: Der Dev-Server beantwortet jeden unbekannten
  // Pfad mit der Seite selbst (200), also ein Port, an dem niemand lauscht.
  new Image().src = 'http://127.0.0.1:1/gegenprobe.png'
  document.body.insertAdjacentHTML(
    'beforeend',
    '<div class="err-box">GEGENPROBE</div>' +
      '<div style="width:3000px;height:4px">GEGENPROBE undefined</div>' +
      '<div style="overflow-x:auto;width:120px"><div style="width:600px;height:4px"></div></div>',
  )
}

/**
 * **Die Messung.** Waagerecht: Ist die Seite breiter als das Fenster? Rollt ein
 * Bereich, der nicht rollen soll (keine waagerechten Rollbalken, Vorgabe des
 * Betreibers)? Ragt ein Element über den Fensterrand, ohne dass ein Vorfahr es
 * abschneidet — oder schneiden `body` und `#root` es ab, sodass es unsichtbar
 * wird? Dazu Fehlerkästen, die Menge an Text und Text, den kein Nutzer sehen
 * soll (`undefined`, ein Platzhalter wie `{name}`).
 *
 * **Nicht gemessen** wird, was über den Rand einer Karte ragt, aber im Fenster
 * bleibt — dort hilft nur ein Vorher-nachher-Vergleich der Lage.
 */
export function messenImDokument() {
  const html = document.documentElement
  const fenster = html.clientWidth
  const MAX = 8
  const name = (/** @type {Element} */ el) => {
    const klassen = typeof el.className === 'string' ? el.className.trim().split(/\s+/).filter(Boolean).slice(0, 3) : []
    return el.tagName.toLowerCase() + (el.id ? `#${el.id}` : '') + klassen.map((k) => `.${k}`).join('')
  }
  const sichtbar = (/** @type {Element} */ el) => {
    const cs = getComputedStyle(el)
    // `inert` liegt auf den Nachbarwochen neben der sichtbaren; `aria-hidden`
    // zählt nicht — ein Zeichen, das hinausragt, sieht man trotzdem.
    return cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0' && el.getClientRects().length > 0 && !el.closest('[inert]')
  }
  const elemente = [...document.body.querySelectorAll('*')].filter((el) => !el.closest('svg, style, script, .sr-only, .sr-only-h1, .druck-bogen'))

  /** @type {{ wo: string, wert: string }[]} */
  const rollen = []
  for (const el of elemente) {
    const cs = getComputedStyle(el)
    if ((cs.overflowX === 'auto' || cs.overflowX === 'scroll') && el.scrollWidth > el.clientWidth + 1 && sichtbar(el)) {
      rollen.push({ wo: name(el), wert: `${el.scrollWidth} > ${el.clientWidth} px` })
    }
  }

  /** @type {{ wo: string, wert: string }[]} */
  const ragen = []
  /** @type {{ wo: string, wert: string }[]} */
  const abgeschnitten = []
  const erledigt = new Set()
  for (const el of elemente) {
    const b = el.getBoundingClientRect()
    if (b.width < 1 || b.height < 1 || (b.right <= fenster + 1 && b.left >= -1)) continue
    // Was in einem gemeldeten oder unsichtbaren Element liegt, zählt nicht noch einmal.
    if (erledigt.has(el.parentElement) || !sichtbar(el)) {
      erledigt.add(el)
      continue
    }
    // Schneidet ein Vorfahr innerhalb des Fensters es ab, ragt es nicht heraus.
    let vorfahr = el.parentElement
    let art = 'ragt'
    while (vorfahr && vorfahr !== html) {
      if (getComputedStyle(vorfahr).overflowX !== 'visible') {
        const vb = vorfahr.getBoundingClientRect()
        if (vb.right <= fenster + 1 && vb.left >= -1) {
          art = vorfahr === document.body || vorfahr.id === 'root' ? 'abgeschnitten' : 'innen'
          break
        }
      }
      vorfahr = vorfahr.parentElement
    }
    if (art === 'innen') continue
    erledigt.add(el)
    ;(art === 'ragt' ? ragen : abgeschnitten).push({ wo: name(el), wert: `${Math.round(b.left)}..${Math.round(b.right)} px` })
  }

  const inhalt = document.body.innerText
  const text = [...inhalt.matchAll(/\bundefined\b|\bNaN\b|\[object Object\]|Invalid Date|\{[A-Za-z_]+\}|\bnull\b/g)].map((m) =>
    inhalt.slice(Math.max(0, (m.index ?? 0) - 30), (m.index ?? 0) + 30).replace(/\s+/g, ' '),
  )

  return {
    fenster,
    seite: html.scrollWidth - fenster,
    rollen: rollen.slice(0, MAX),
    ragen: ragen.slice(0, MAX),
    abgeschnitten: abgeschnitten.slice(0, MAX),
    text: text.slice(0, MAX),
    fehlergrenzen: document.querySelectorAll('.err-box').length,
    zeichen: inhalt.trim().length,
  }
}

/** @typedef {ReturnType<typeof messenImDokument>} Messung */
/** @typedef {{ art: string, text: string }} Meldung */
/**
 * @typedef {object} Ergebnis
 * @property {import('./laufzeit-auftraege.mjs').Auftrag} auftrag
 * @property {string} [fehler] Der Lauf brach ab.
 * @property {string[]} [bereit] Was nach der Wartezeit noch fehlte.
 * @property {Meldung[]} [meldungen] Konsole, Ausnahmen, Log des Browsers.
 * @property {Messung} [messung]
 */
/** @typedef {{ art: string, wo: string, wert?: string }} Befund */

/** Weniger Zeichen Text hat kein Bildschirm der App — die Anmeldung allein bringt über 400. */
export const MINDEST_ZEICHEN = 40

/** Die Arten in der Reihenfolge, in der der Bericht sie nennt — schwerste zuerst. */
export const ARTEN = ['abbruch', 'nicht-bereit', 'ausnahme', 'fehlergrenze', 'leer', 'konsole', 'log', 'seite', 'ragt', 'abgeschnitten', 'rollen', 'text']

/** Was die Gegenprobe stört — jede dieser Arten muss die Messung dann melden. */
export const GEGENPROBE_ARTEN = ['konsole', 'ausnahme', 'log', 'fehlergrenze', 'seite', 'ragt', 'rollen', 'text']

/**
 * Die Befunde eines Laufs. Ein Lauf ohne Befund ist eine leere Liste.
 *
 * @param {Ergebnis} e
 * @returns {Befund[]}
 */
export function befundeAus(e) {
  if (e.fehler) return [{ art: 'abbruch', wo: e.fehler }]
  /** @type {Befund[]} */
  const befunde = (e.meldungen ?? []).map((m) => ({ art: m.art, wo: m.text }))
  if (e.bereit?.length) befunde.push({ art: 'nicht-bereit', wo: e.bereit.join(', ') })
  const m = e.messung
  if (!m) return befunde
  if (m.fehlergrenzen) befunde.push({ art: 'fehlergrenze', wo: 'Fehlerkasten (.err-box)', wert: `${m.fehlergrenzen}×` })
  if (m.zeichen < MINDEST_ZEICHEN) befunde.push({ art: 'leer', wo: 'kaum Text auf dem Bildschirm', wert: `${m.zeichen} Zeichen` })
  if (m.seite > 0) befunde.push({ art: 'seite', wo: 'Seite breiter als das Fenster', wert: `+${m.seite} px` })
  for (const r of m.ragen) befunde.push({ art: 'ragt', ...r })
  for (const r of m.abgeschnitten) befunde.push({ art: 'abgeschnitten', ...r })
  for (const r of m.rollen) befunde.push({ art: 'rollen', ...r })
  for (const t of m.text) befunde.push({ art: 'text', wo: t })
  return befunde
}

/**
 * Welche Arten die Gegenprobe **nicht** gefunden hat. Leer heißt: Die Messung
 * misst.
 *
 * @param {Befund[]} befunde
 */
export function gegenprobeLuecken(befunde) {
  return GEGENPROBE_ARTEN.filter((art) => !befunde.some((b) => b.art === art))
}

/**
 * Befunde gleicher Art und Stelle zusammengefasst, je mit den Läufen, in denen
 * sie auftraten — schwerste Art zuerst, in jeder Art die häufigste Stelle.
 *
 * @param {Ergebnis[]} ergebnisse
 * @param {(e: Ergebnis) => string} lauf Wie ein Lauf im Bericht heißt.
 * @returns {{ art: string, wo: string, faelle: { lauf: string, wert?: string }[] }[]}
 */
export function zusammenfassen(ergebnisse, lauf) {
  /** @type {Map<string, { art: string, wo: string, faelle: { lauf: string, wert?: string }[] }>} */
  const gruppen = new Map()
  for (const e of ergebnisse) {
    for (const b of befundeAus(e)) {
      const schluessel = JSON.stringify([b.art, b.wo])
      if (!gruppen.has(schluessel)) gruppen.set(schluessel, { art: b.art, wo: b.wo, faelle: [] })
      gruppen.get(schluessel)?.faelle.push({ lauf: lauf(e), wert: b.wert })
    }
  }
  return [...gruppen.values()].sort((a, b) => ARTEN.indexOf(a.art) - ARTEN.indexOf(b.art) || b.faelle.length - a.faelle.length)
}
