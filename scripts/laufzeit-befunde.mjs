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
 * **Die Gegenprobe:** je Befundart eine Störung (`GEGENPROBE_ARTEN`, mit axe
 * dazu `AXE_GEGENPROBE_ARTEN`). Erkennt die Messung eine davon nicht, misst sie
 * nichts — dann ist der Lauf rot. Ohne sie sähe eine Messung, die still
 * kaputtgeht, aus wie eine App ohne Befund.
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
      '<div style="overflow-x:auto;width:120px"><div style="width:600px;height:4px"></div></div>' +
      // Kyrillisch unter dem `lang` der Seite (die Gegenprobe läuft deutsch).
      '<p>ГЕГЕНПРОБА</p>' +
      // Für axe: ein Knopf ohne Namen, Text mit zu wenig Kontrast. Der Text
      // braucht Innenabstand: Die Glyphen von Manrope ragen 1 px über die
      // Zeilenhöhe, und Text, der über seine Fläche ragt, nennt axe „nicht
      // bestimmbar" statt eines Verstoßes.
      '<button type="button"></button>' +
      '<p style="padding:4px;color:#d4d4d4;background:#fff">GEGENPROBE Kontrast</p>',
  )
}

/**
 * **Die Messung.** Waagerecht: Ist die Seite breiter als das Fenster? Rollt ein
 * Bereich, der nicht rollen soll (keine waagerechten Rollbalken, Vorgabe des
 * Betreibers)? Ragt ein Element über den Fensterrand, ohne dass ein Vorfahr es
 * abschneidet — oder schneiden `body` und `#root` es ab, sodass es unsichtbar
 * wird? Dazu Fehlerkästen, die Menge an Text, Text, den kein Nutzer sehen
 * soll (`undefined`, ein Platzhalter wie `{name}`), und Text, dessen `lang`
 * nicht zu seiner Schrift passt.
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

  // **Die Sprache der Inhalte** (WCAG 3.1.2, T173): Ein Vorleseprogramm
  // spricht jeden Text in der Sprache seines nächsten `lang`. Jeder Buchstabe
  // außerhalb der lateinischen Schrift steht deshalb in einem Element, dessen
  // `lang` dieselbe Schrift hat — arabische Oberfläche nicht im `lang="de"`
  // eines Programmpunkts, ein russisches Programm nicht ohne sein `lang`.
  // Lateinische Schrift prüft die Messung nicht: Namen und Orte der Testdaten
  // stehen in ihr, ohne eine Sprache zu haben.
  /** @type {Map<string, RegExp | null>} */
  const schriftMuster = new Map()
  // Für Chinesisch, Japanisch und Koreanisch nennt `Intl.Locale` Varianten
  // (ISO 15924), die keine Unicode-Schriften sind — ihre Bestandteile.
  /** @type {Record<string, string[]>} */
  const UNICODE_SCHRIFTEN = { Hans: ['Hani'], Hant: ['Hani'], Jpan: ['Hani', 'Hira', 'Kana'], Kore: ['Hang', 'Hani'] }
  const musterFuer = (/** @type {string} */ lang) => {
    if (!schriftMuster.has(lang)) {
      let muster = null
      try {
        const schrift = new Intl.Locale(lang).maximize().script
        if (schrift) {
          const teile = (UNICODE_SCHRIFTEN[schrift] ?? [schrift]).map((s) => `\\p{Script_Extensions=${s}}`)
          muster = new RegExp(`^(?:${teile.join('|')})$`, 'u')
        }
      } catch {
        // Ein ungültiges oder leeres `lang` hat keine Schrift — jeder fremde Buchstabe darin ist ein Befund.
      }
      schriftMuster.set(lang, muster)
    }
    return schriftMuster.get(lang) ?? null
  }
  const FREMD = /(?=\p{L})(?!\p{Script=Latin})(?!\p{Script=Common})(?!\p{Script=Inherited})./gu
  const vorgelesen = (/** @type {Element} */ el) => {
    // Die Einträge einer geschlossenen Auswahlliste haben keine Maße — vorgelesen werden sie doch.
    const kasten = el.closest('select') ?? el
    return (
      !el.closest('[aria-hidden="true"], [inert], script, style, noscript, template') &&
      kasten.getClientRects().length > 0 &&
      getComputedStyle(kasten).visibility !== 'hidden'
    )
  }
  /** @type {Map<string, { wo: string, wert: string }>} */
  const sprache = new Map()
  const sprachePruefen = (/** @type {Element} */ el, /** @type {string} */ wortlaut, /** @type {string} */ stelle, attribut = false) => {
    const fremd = wortlaut.match(FREMD)
    if (!fremd || !vorgelesen(el)) return
    const lang = el.closest('[lang]')?.getAttribute('lang') ?? ''
    const muster = musterFuer(lang)
    if (muster && fremd.every((z) => muster.test(z))) return
    // Ein Attribut lässt sich nicht teilweise auszeichnen, und einen Namen
    // liest ein Vorleseprogramm ohnehin in einer Stimme. Ein Befund ist es,
    // wenn es ganz in einer anderen Schrift steht — dann gehört `lang` an das
    // Element. Text dagegen lässt sich in Teile mit eigenem `lang` setzen.
    if (attribut && muster && (wortlaut.match(/\p{L}/gu) ?? []).some((z) => muster.test(z))) return
    const wo = `${stelle} in lang="${lang}"`
    if (!sprache.has(wo)) sprache.set(wo, { wo, wert: wortlaut.trim().replace(/\s+/g, ' ').slice(0, 40) })
  }
  const texte = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  for (let n = texte.nextNode(); n; n = texte.nextNode()) {
    if (n.parentElement) sprachePruefen(n.parentElement, n.nodeValue ?? '', name(n.parentElement))
  }
  // Was ein Vorleseprogramm statt oder neben dem Text liest.
  for (const el of document.body.querySelectorAll('[aria-label], [title], [alt], [placeholder]')) {
    for (const attribut of ['aria-label', 'title', 'alt', 'placeholder']) {
      const wert = el.getAttribute(attribut)
      if (wert) sprachePruefen(el, wert, `${name(el)}[${attribut}]`, true)
    }
  }

  return {
    fenster,
    seite: html.scrollWidth - fenster,
    rollen: rollen.slice(0, MAX),
    ragen: ragen.slice(0, MAX),
    abgeschnitten: abgeschnitten.slice(0, MAX),
    text: text.slice(0, MAX),
    sprache: [...sprache.values()].slice(0, MAX),
    fehlergrenzen: document.querySelectorAll('.err-box').length,
    zeichen: inhalt.trim().length,
  }
}

/**
 * **axe in der Seite** (T173, Schalter `--axe`): die Regeln zu den
 * Stichwörtern, nur Verstöße. Eine Ausnahme nimmt eine Stelle einer Regel
 * heraus — nie eine Regel ganz. axe selbst hat die Messung vorher in die Seite
 * geladen.
 *
 * @param {{ stichwoerter: string[], ausnahmen: { regel: string, stelle: string }[] }} optionen
 */
export async function axeImDokument({ stichwoerter, ausnahmen }) {
  const MAX = 8
  /** @type {{ violations: { id: string, impact?: string, help: string, nodes: { target: unknown[], html: string, failureSummary?: string, element?: Element }[] }[] }} */
  const ergebnis = await /** @type {any} */ (window).axe.run(document, {
    runOnly: { type: 'tag', values: stichwoerter },
    resultTypes: ['violations'],
    elementRef: true,
  })
  return ergebnis.violations.flatMap((v) => {
    const stellen = v.nodes.filter((n) => !ausnahmen.some((a) => a.regel === v.id && n.element?.closest(a.stelle)))
    if (!stellen.length) return []
    return [
      {
        regel: v.id,
        wirkung: v.impact ?? 'minor',
        hilfe: v.help,
        anzahl: stellen.length,
        stellen: stellen.slice(0, MAX).map((n) => ({
          ziel: n.target.join(' '),
          html: n.html.slice(0, 160),
          warum: (n.failureSummary ?? '').split('\n').slice(1).join(' ').trim().slice(0, 200),
        })),
      },
    ]
  })
}

/** @typedef {ReturnType<typeof messenImDokument>} Messung */
/** @typedef {Awaited<ReturnType<typeof axeImDokument>>[number]} AxeVerstoss */
/** @typedef {{ art: string, text: string }} Meldung */
/**
 * @typedef {object} Ergebnis
 * @property {import('./laufzeit-auftraege.mjs').Auftrag} auftrag
 * @property {string} [fehler] Der Lauf brach ab.
 * @property {string[]} [bereit] Was nach der Wartezeit noch fehlte.
 * @property {Meldung[]} [meldungen] Konsole, Ausnahmen, Log des Browsers.
 * @property {Messung} [messung]
 * @property {AxeVerstoss[]} [axe] Nur mit `--axe`.
 */
/** @typedef {{ art: string, wo: string, wert?: string }} Befund */

/** Weniger Zeichen Text hat kein Bildschirm der App — die Anmeldung allein bringt über 400. */
export const MINDEST_ZEICHEN = 40

/** Die Wirkungen, die axe einem Verstoß gibt — schwerste zuerst. */
const AXE_WIRKUNGEN = ['critical', 'serious', 'moderate', 'minor']

/** Die Arten in der Reihenfolge, in der der Bericht sie nennt — schwerste zuerst. */
export const ARTEN = [
  'abbruch',
  'nicht-bereit',
  'ausnahme',
  'fehlergrenze',
  'leer',
  'konsole',
  'log',
  'seite',
  'ragt',
  'abgeschnitten',
  'rollen',
  'text',
  'sprache',
  ...AXE_WIRKUNGEN.map((w) => `axe:${w}`),
]

/** Was die Gegenprobe stört — jede dieser Arten muss die Messung dann melden. */
export const GEGENPROBE_ARTEN = ['konsole', 'ausnahme', 'log', 'fehlergrenze', 'seite', 'ragt', 'rollen', 'text', 'sprache']

/** Dazu mit `--axe`: der Knopf ohne Namen (`button-name`) und der blasse Text (`color-contrast`). */
export const AXE_GEGENPROBE_ARTEN = ['axe:critical', 'axe:serious']

/**
 * Die Regeln, die axe anwendet: WCAG 2.2 in den Stufen A und AA — samt der
 * Trefferflächen (`target-size`) — und axes „best practice" mit der Folge der
 * Überschriften.
 */
export const AXE_STICHWOERTER = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']

/**
 * **Was bewusst bleibt** — je Regel und Stelle (ein Selektor, an dem oder in
 * dem das Element liegt) mit Begründung. Keine Regel wird ganz abgeschaltet.
 *
 * @type {{ regel: string, stelle: string, grund: string }[]}
 */
export const AXE_AUSNAHMEN = [
  {
    regel: 'label-content-name-mismatch',
    stelle: '.trolley-tagknopf',
    grund:
      'Sichtbar steht der Tag abgekürzt („Mo", „7"), vorgelesen wird er ausgeschrieben („Montag, 7. September, mit Terminen"). ' +
      'Mit der Abkürzung im Namen läse ein Vorleseprogramm den Tag doppelt; Sprachsteuerung trifft den Knopf über „Montag" oder „7".',
  },
  {
    regel: 'label-content-name-mismatch',
    stelle: '.schmale-leiste-profil',
    grund:
      'Das Kürzel im Kreis („SK") steht für den Namen wie ein Bild; vorgelesen werden Name und „Profil", ' +
      'und über „Profil" trifft ihn auch die Sprachsteuerung.',
  },
]

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
  for (const s of m.sprache) befunde.push({ art: 'sprache', ...s })
  for (const v of e.axe ?? []) {
    befunde.push({ art: `axe:${v.wirkung}`, wo: `${v.regel} — ${v.hilfe}`, wert: `${v.anzahl}× ${v.stellen[0]?.ziel ?? ''}`.trim() })
  }
  return befunde
}

/**
 * Welche Arten die Gegenprobe **nicht** gefunden hat. Leer heißt: Die Messung
 * misst.
 *
 * @param {Befund[]} befunde
 * @param {string[]} [arten] die gestörten Arten
 */
export function gegenprobeLuecken(befunde, arten = GEGENPROBE_ARTEN) {
  return arten.filter((art) => !befunde.some((b) => b.art === art))
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
