// =============================================================================
// Arbeitsheft-Parser (Leben-und-Dienst-Zusammenkunft, jw.org / wol.jw.org)
// =============================================================================
// Reine Funktion (kein Deno-/Node-Spezifikum), damit sie sowohl in der Supabase
// Edge Function als auch im Vitest-Test läuft. Wandelt das HTML einer
// Wochenseite in unsere Week-Struktur (nur die Zusammenkunft unter der Woche;
// das Wochenende steht nicht im Arbeitsheft → editierbare Vorlage).
//
// SPRACHUNABHÄNGIG: Die Seite gibt es in ~480 Sprachen mit identischer Struktur.
// Erkennung keyt daher ausschließlich auf **Struktur** — Farbklassen der
// Überschriften (teal/gold/maroon), das Noten-Icon, die 1./2./3.-Nummerierung
// (überall westliche Ziffern), die „(<Zahl> …)“-Zeitklammer und die **Position**
// (letzter Schätze-Punkt = Bibellesung, letzter Unser-Leben-Punkt = VBS) — NICHT
// auf deutschen/englischen Text. Der sichtbare Text (Sektions-Überschriften,
// Titel, Lieder, Schriftstellen, Rahmen) wird **wörtlich aus der Zielsprache
// übernommen**. Nur unsere eigenen Struktur-Labels (ERÖFFNUNG/ABSCHLUSS) und die
// Rollen-Schlüssel (Vorsitz/Gebet/Leiter/Leser) bleiben kanonisch deutsch — sie
// sind Logik-Schlüssel der Auto-Zuteilung bzw. werden in der App-Sprache
// angezeigt. Publikations-Kürzel (th, lmd, lff …) sind MEPS-Symbole und in jeder
// Sprache gleich.
// =============================================================================

import { cleanText } from './text.ts'

export interface ImportedSlot {
  name: string
  rolle?: string
  bereichsKey?: string
  male?: boolean // nur männlich (Schülerteil-Vortrag)
}
export interface ImportedPart {
  num?: number
  title: string
  meta?: string
  /** Dauer in Minuten — die Zahl aus der Zeitklammer, nicht ihre Schreibweise. */
  mins?: number
  names: ImportedSlot[]
}
export interface ImportedSong {
  song: string
}
export type ImportedItem = ImportedPart | ImportedSong
export interface ImportedSection {
  label: string
  farbe: string
  items: ImportedItem[]
}
export interface ImportedMeeting {
  date: string
  end: string
  sections: ImportedSection[]
  helpers: Record<string, string[]>
}
export interface ImportedWeek {
  range: string
  book: string
  current: boolean
  mid: ImportedMeeting
  we: ImportedMeeting
}

/* ---- Schrift-Helfer ------------------------------------------------------ */
//
// Die Feld-Parser unten greifen auf Zeichen zu, die je Schrift anders aussehen.
// Wer hier nur die westliche Form kennt, verliert in genau den Sprachen alles,
// die am wenigsten nachgeprüft werden. Gemessen an der Wochenseite
// 6.–12. Juli 2026 in 19 Sprachen — vorher blieb die komplette Meta-Zeile
// (Minuten, Rahmen, Quelle) leer in ar, fa, he, ur, sw, ja und cmn-hans.

/**
 * Steuerzeichen der Zweirichtungs-Darstellung: LRM, RLM, ALM und die vier
 * Isolate. Sie stehen in den arabischen, hebräischen, persischen und
 * Urdu-Ausgaben mitten im Text, damit Zahlen und Satzzeichen richtig herum
 * erscheinen. Unsichtbar — und trotzdem jedem Mustervergleich im Weg: die
 * hebräische Zeitzeile lautet wörtlich `‏(‏10 דק׳)‏`, mit einer Marke **vor**
 * der Klammer und einer weiteren gleich **dahinter**.
 *
 * Sie werden nicht aus dem Text entfernt, sondern beim Vergleichen
 * übersprungen: sie gehören zur richtigen Darstellung, und wer sie herauswirft,
 * dreht am Ende Datumsspannen um („6–12“ → „12–6“).
 *
 * Bewusst NICHT dabei: ZWNJ (U+200C). Es ist im Persischen und Urdu
 * Wortbestandteil („بات‌چیت“), kein Steuerzeichen.
 */
const BIDI = '\\u200e\\u200f\\u061c\\u2066-\\u2069'
/** Klammer auf/zu — westlich und vollbreit („（1 分钟）“ in den CJK-Ausgaben). */
const AUF = '\\(\\uff08'
const ZU = '\\)\\uff09'
/** Der unsichtbare Rand eines Feldes: Leerraum **oder** Zweirichtungs-Marke. */
const RAND = `[\\s${BIDI}]`

/** Führenden/abschließenden Leerraum samt Zweirichtungs-Marken abschneiden. */
function randTrim(s: string): string {
  return s.replace(new RegExp(`^${RAND}+|${RAND}+$`, 'g'), '')
}

/**
 * Wert einer Ziffernfolge, gleich in welcher Schrift („١٢“ → 12, „１２“ → 12).
 * `Number()` kennt nur westliche Ziffern und liefert sonst `NaN`.
 *
 * Die Dezimalziffern jeder Schrift liegen als Zehnerblock hintereinander im
 * Unicode; von einer Ziffer rückwärts zu zählen, bis das Zeichen davor keine
 * Ziffer mehr ist, ergibt ihren Wert. **Nur endet nicht jeder Block vor einer
 * Nicht-Ziffer:** Es gibt Sätze, die unmittelbar aneinandergrenzen — die
 * Ziffern des östlichen Pwo-Karen (U+116DA) folgen direkt auf die des Pao. Die
 * Zählung läuft dort in den Nachbarsatz und schlägt an der Zehnerbremse an.
 *
 * Deshalb zuerst die Tabelle, die die Laufzeitumgebung selbst mitbringt: `Intl`
 * führt die Zahlensysteme, und `format(1234567890)` liefert je System dessen
 * zehn Ziffern in einem Zug (die letzte ist die Null). Keine Sprachliste von
 * Hand — abgeleitet, wie im Client (`src/data/ziffern.ts`). Was `Intl` nicht
 * kennt, fällt auf die Zählung zurück.
 */
let ziffernWerte: Map<string, number> | null = null

function ziffernTabelle(): Map<string, number> {
  if (ziffernWerte) return ziffernWerte
  const map = new Map<string, number>()
  let systeme: string[] = []
  try {
    systeme = Intl.supportedValuesOf('numberingSystem')
  } catch {
    // Laufzeit ohne `supportedValuesOf` — dann bleibt es bei der Zählung.
  }
  for (const nu of systeme) {
    let ziffern: string
    try {
      ziffern = new Intl.NumberFormat(`en-u-nu-${nu}`, { useGrouping: false }).format(1234567890)
    } catch {
      continue
    }
    const zeichen = [...ziffern]
    // Genau zehn Zeichen und alle Dezimalziffern: algorithmische Systeme
    // (römisch, hebräisch) und Wortschriften (`hanidec`) fallen heraus —
    // `ZIFFERNFOLGE` fände sie ohnehin nie.
    if (zeichen.length !== 10 || !zeichen.every((c) => ZIFFER.test(c))) continue
    zeichen.forEach((c, i) => map.set(c, (i + 1) % 10))
  }
  ziffernWerte = map
  return map
}

function ziffernWert(c: string): number {
  const bekannt = ziffernTabelle().get(c)
  if (bekannt !== undefined) return bekannt
  let cp = c.codePointAt(0) ?? 0
  let n = 0
  while (n < 10 && ZIFFER.test(String.fromCodePoint(cp - 1))) {
    cp--
    n++
  }
  return n
}
function zahl(ziffern: string): number {
  let wert = 0
  for (const c of ziffern) wert = wert * 10 + ziffernWert(c)
  return wert
}
/** Eine zusammenhängende Ziffernfolge — in jeder Schrift. */
const ZIFFERNFOLGE = /\p{Nd}+/u
/**
 * Erste Zahl eines Textes, oder `undefined`. Damit werden die Minuten aus der
 * Zeitklammer gelesen — „10 min.“, „Dak. 10“, „١٠ دق“ ergeben alle 10.
 *
 * Bisher gab der Parser nur den Anzeigetext weiter, und der Client las die Zahl
 * mit `/(\d+) Min\./` daraus zurück. Das ging außerhalb des Deutschen nie gut
 * (T32).
 */
function ersteZahl(text: string): number | undefined {
  const treffer = ZIFFERNFOLGE.exec(text)
  return treffer ? zahl(treffer[0]) : undefined
}

/**
 * Schlusslied in den Abschluss-Titel setzen: „Schlussworte · Lied · Gebet“ +
 * „Lied 151“ → „Schlussworte · Lied 151 · Gebet“.
 *
 * Der Import setzte stattdessen ein eigenes Lied-Item davor — dann stand „Lied“
 * zweimal da: einmal als Item, einmal als Atom im Titel, das die
 * Wochenend-Vorlage ohnehin mitbringt (F11). Angezeigt sieht das Ergebnis
 * gleich aus, denn die Oberfläche trennt das Nummern-Atom vom Rest ab
 * (`splitOpeningSong`) — nur ohne Dopplung, und strukturgleich zur Eröffnung
 * und zum Abschluss unter der Woche, die beide schon so gebaut sind.
 *
 * Übernommen wird nur die **Zahl**. Die Wochenend-Vorlage steht kanonisch auf
 * Deutsch und wird erst bei der Anzeige übersetzt; ein lokalisiertes
 * „سرود ۱۵۱“ liefe durch keine Übersetzung mehr.
 */
export function mitLiedNummer(title: string, lied: string): string {
  const nr = ersteZahl(lied)
  if (nr === undefined) return title
  const atoms = title.split(' · ')
  const i = atoms.findIndex((a) => a === 'Lied' || a.startsWith('Lied '))
  if (i < 0) return title
  atoms[i] = `Lied ${nr}`
  return atoms.join(' · ')
}

/* ---- Tokenizer ----------------------------------------------------------- */

type Color = 'teal' | 'gold' | 'maroon' | 'sub' | 'none'
interface Token {
  tag: string // h1|h2|h3|p
  color: Color
  music: boolean
  text: string
}

/**
 * Woran eine Lied-Zeile zu erkennen ist (Eröffnung, Zwischenlied, Abschluss).
 *
 * Zwei Merkmale, weil eines nicht überall steht: das Noten-Symbol **oder** ein
 * Link ins Liederbuch. `pub-sjj` ist das MEPS-Kürzel von „Singt Jehova voller
 * Freude“ und damit in jeder Sprache dasselbe.
 *
 * Die chinesische Ausgabe setzt beim Schlusswort **kein** Noten-Symbol (die
 * deutsche und die japanische schon). Allein danach zu suchen hieß: die
 * Schlusszeile wurde nicht erkannt, und an ihre Stelle trat die deutsche
 * Rückfall-Vorlage — mitten in einem chinesischen Programm stand „Schlussworte ·
 * Gebet · 3 Min.“.
 */
const MUSIK = /dc-icon--music|pub-sjj/

function colorOf(attrs: string): Color {
  const cls = (attrs.match(/class="([^"]*)"/) || [])[1] || ''
  if (cls.includes('teal')) return 'teal'
  if (cls.includes('gold')) return 'gold'
  if (cls.includes('maroon') || cls.includes('red')) return 'maroon'
  if (cls.includes('textSubdued')) return 'sub'
  return 'none'
}

function tokenize(html: string): Token[] {
  const art = html.match(/<article[\s\S]*?<\/article>/)
  const body = art ? art[0] : html
  const re = /<(h[1-3]|p|li)\b([^>]*data-pid[^>]*)>([\s\S]*?)<\/\1>/g
  const tokens: Token[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(body))) {
    const [, tag, attrs, inner] = m
    const text = cleanText(inner)
    if (!text) continue
    tokens.push({
      tag: tag === 'li' ? 'p' : tag,
      color: colorOf(attrs),
      music: MUSIK.test(attrs) || MUSIK.test(inner),
      text,
    })
  }
  return tokens
}

/* ---- Feld-Parser (sprachunabhängig) -------------------------------------- */

/** Dezimalziffer **irgendeiner** Schrift — westlich, arabisch-indisch, Thai … */
const ZIFFER = /\p{Nd}/u

/**
 * Beginnt die Zeile mit einer Zeitklammer? Maßgeblich ist, dass **in** der
 * ersten Klammer eine Zahl steht — nicht, dass sie damit anfängt: Swahili
 * schreibt „(Dak. 10)“, das Wort vor der Zahl. Die frühere Fassung verlangte
 * die Ziffer unmittelbar hinter der Klammer und übersah dadurch die ganze
 * Zeitzeile — mitsamt Minuten, Rahmen und Quellenangabe.
 *
 * Eine Aufzählung „(a)“ bleibt weiterhin draußen: sie enthält keine Ziffer.
 */
const TIME_START = new RegExp(`^${RAND}*[${AUF}][^${ZU}]*\\p{Nd}`, 'u')
/** Dieselbe Prüfung ohne Zeilenanfang — für Lied-/Abschlusszeilen. */
const TIME_ANY = new RegExp(`[${AUF}][^${ZU}]*\\p{Nd}`, 'u')
/** Eine Klammer samt Inhalt: einmalig, alle, und die führende. */
const PAREN_ONE = new RegExp(`[${AUF}]([^${ZU}]*)[${ZU}]`, 'u')
const PAREN_ALL = new RegExp(`[${AUF}]([^${ZU}]*)[${ZU}]`, 'gu')
const PAREN_LEAD = new RegExp(`^${RAND}*[${AUF}][^${ZU}]*[${ZU}]`, 'u')
/**
 * Satzende — der Rahmen endet daran. Neben dem westlichen Punkt und den
 * vollbreiten Formen auch Danda (Hindi/Bengali), das arabische Satzende (Urdu),
 * Verjaket (Armenisch) und der äthiopische Punkt. Ohne sie lief der Rahmen bis
 * in die Quellenangabe hinein und fiel dann durch die Ziffernprüfung — Hindi
 * hatte deshalb bei jedem Schülerteil einen leeren Rahmen.
 */
const SATZENDE = /[.。．।۔։።]/
/**
 * Nummer eines Programmpunkts: „1.“, aber auch „1．“ (chinesisch, vollbreiter
 * Punkt) und „١-‏“ (arabisch, Bindestrich statt Punkt). Ohne die Varianten blieb
 * die Zahl im Titel stehen und `num` leer.
 */
const NUMMER = new RegExp(`^${RAND}*(\\p{Nd}+)${RAND}*[.．。\\-‐‑–]${RAND}*`, 'u')
/** Publikations-Kürzel (MEPS, in jeder Sprache gleich). */
const PUB_SYM = /\b(th|lmd|lff|lfb|wcg|bt|jr|it|bhs|cf|lvs|rr|od|kr|jy|cl|be|sjj|snnw|w\d{2}|g\d{2})\b/i

/** Inhalt der ersten Klammer (die Zeit, lokalisiert: „10 min.“ / „10 λεπτά“). */
function firstParen(text: string): string {
  return randTrim((PAREN_ONE.exec(text) || [])[1] || '')
}

/** Text ohne jegliche Klammern (Schriftstelle bzw. klammerlose Quelle). */
function stripParens(text: string): string {
  return randTrim(text.replace(PAREN_ALL, ' ').replace(/\s+/g, ' '))
}

/** Quellenangabe: bevorzugt die letzte Klammer mit Publikations-Kürzel. */
function sourceOf(text: string): string {
  const parens = [...text.matchAll(PAREN_ALL)].map((m) => randTrim(m[1]))
  if (parens.length < 2) return ''
  const rest = parens.slice(1) // erste Klammer ist die Zeit
  for (let i = rest.length - 1; i >= 0; i--) if (PUB_SYM.test(rest[i])) return rest[i]
  return rest[rest.length - 1]
}

/**
 * Rahmen der Zeit-Zeile (z. B. „VON HAUS ZU HAUS“, „HOUSE TO HOUSE“). Der Rahmen
 * ist der kurze Satz direkt nach der Zeitklammer bis zum ersten Punkt — ohne
 * Ziffern (schließt Quellen/Lektionen aus), sprachunabhängig übernommen.
 */
function settingOf(text: string): string {
  const after = randTrim(text.replace(PAREN_LEAD, ''))
  const seg = randTrim(after.split(SATZENDE)[0])
  return seg && seg.length <= 32 && !ZIFFER.test(seg) ? seg : ''
}

/** Meta-Zeile „[Rahmen ·] Zeit [· Quelle]“ zusammensetzen. */
function joinMeta(...parts: string[]): string {
  return parts.filter(Boolean).join(' · ')
}

/* ---- Section-/Slot-Zuordnung -------------------------------------------- */

type SecColor = 'teal' | 'gold' | 'maroon'
const FARBE: Record<SecColor, string> = { teal: 'petrol', gold: 'gold', maroon: 'wein' }
/** Rückfall-Labels, falls die lokalisierte Überschrift nicht gefunden wurde. */
const FALLBACK_LABEL: Record<SecColor, string> = {
  teal: 'SCHÄTZE AUS GOTTES WORT',
  gold: 'UNS IM DIENST VERBESSERN',
  maroon: 'UNSER LEBEN ALS CHRIST',
}

/* ---- Hauptfunktion ------------------------------------------------------- */

interface PartRec {
  part: ImportedPart
  color: SecColor
  raw: string // Roh-Titel inkl. „N.“
  time: string // Roh-Zeitzeile
}

export function parseWorkbookWeek(html: string): ImportedWeek {
  const tokens = tokenize(html)
  if (tokens.length === 0) throw new Error('Kein Programm gefunden (Seitenstruktur unerwartet).')

  let range = ''
  let book = ''
  let opening: ImportedPart | null = null
  let closing: ImportedPart | null = null

  const sections: Record<SecColor, ImportedSection> = {
    teal: { label: FALLBACK_LABEL.teal, farbe: FARBE.teal, items: [] },
    gold: { label: FALLBACK_LABEL.gold, farbe: FARBE.gold, items: [] },
    maroon: { label: FALLBACK_LABEL.maroon, farbe: FARBE.maroon, items: [] },
  }
  const recs: PartRec[] = []
  let curColor: SecColor | null = null
  let curRec: PartRec | null = null

  /** Eröffnungs-/Abschluss-Zeile (Noten-Icon + „|“) in Titel + Zeit zerlegen. */
  const pipe = (text: string): [string, string] => {
    const i = text.indexOf('|')
    return i >= 0 ? [text.slice(0, i).trim(), text.slice(i + 1).trim()] : [text.trim(), '']
  }

  for (const tok of tokens) {
    // Datum (erstes h1) und Bibellese-Kapitel (erstes farbloses h2)
    if (tok.tag === 'h1') {
      range = tok.text.replace(/\s*[·|].*$/, '').replace(/-/g, '–').trim()
      continue
    }
    if (tok.tag === 'h2' && tok.color === 'none') {
      if (!book) book = tok.text
      continue
    }
    // Sektions-Überschrift (farbig) → lokalisierte Beschriftung übernehmen
    if (tok.tag === 'h2' && (tok.color === 'teal' || tok.color === 'gold' || tok.color === 'maroon')) {
      curColor = tok.color
      sections[tok.color].label = tok.text
      curRec = null
      continue
    }
    // Lied / Eröffnung / Abschluss (Noten-Icon)
    if (tok.tag === 'h3' && tok.music) {
      const hasPipe = tok.text.includes('|')
      const hasTime = TIME_ANY.test(tok.text)
      const [a, b] = pipe(tok.text)
      const zeit = firstParen(tok.text)
      if (curColor === null) {
        // vor der ersten Sektion → Eröffnung (Vorsitz + Anfangsgebet)
        const title = b ? `${stripParens(a)} · ${stripParens(b)}` : stripParens(a)
        opening = {
          title,
          meta: joinMeta(zeit),
          mins: ersteZahl(zeit),
          names: [
            { name: '', rolle: 'Vorsitz', bereichsKey: 'vorsitzMid' },
            { name: '', rolle: 'Gebet', bereichsKey: 'gebet' },
          ],
        }
      } else if (hasPipe || hasTime) {
        // nach den Sektionen mit „|“/Zeit → Abschluss (Schlussgebet)
        const title = b ? `${stripParens(a)} · ${stripParens(b)}` : stripParens(a)
        closing = { title, meta: joinMeta(zeit), mins: ersteZahl(zeit), names: [{ name: '', rolle: 'Gebet', bereichsKey: 'gebet' }] }
      } else {
        // schlichtes Lied innerhalb einer Sektion
        sections[curColor].items.push({ song: tok.text })
      }
      curRec = null
      continue
    }
    // Nummerierter Programmpunkt (farbige h3) → Roh sichern, später finalisieren
    if (tok.tag === 'h3' && curColor && (tok.color === 'teal' || tok.color === 'gold' || tok.color === 'maroon')) {
      const part: ImportedPart = { title: '', names: [] }
      const numMatch = NUMMER.exec(tok.text)
      if (numMatch) part.num = zahl(numMatch[1])
      curRec = { part, color: curColor, raw: tok.text, time: '' }
      recs.push(curRec)
      sections[curColor].items.push(part)
      continue
    }
    // Zeit-/Quelle-Zeile direkt nach einem Programmpunkt
    if (tok.tag === 'p' && curRec && !curRec.time && TIME_START.test(tok.text)) {
      curRec.time = tok.text
    }
  }

  finalizeParts(recs)

  const midSections: ImportedSection[] = [
    {
      label: 'ERÖFFNUNG',
      farbe: 'neutral',
      items: [opening ?? fallbackOpening()],
    },
    sections.teal,
    sections.gold,
    sections.maroon,
    {
      label: 'ABSCHLUSS',
      farbe: 'neutral',
      items: [closing ?? { title: 'Schlussworte · Gebet', meta: '3 Min.', mins: 3, names: [{ name: '', rolle: 'Gebet', bereichsKey: 'gebet' }] }],
    },
  ]

  const mid: ImportedMeeting = { date: range, end: 'Ende ca. 20:45', sections: midSections, helpers: {} }
  return { range, book, current: false, mid, we: weekendTemplate(range) }
}

// Schülerteil-Typen (deutscher Titel/Meta — die deutsche Wochenseite wird beim
// Import ohnehin geladen; für andere Sprachen erkennt die Heuristik nicht und es
// bleibt bei 1 Slot, den Partner fügt der Planer dann von Hand hinzu).
const CONVO_RE = /Gespräche beginnen|Interesse fördern|Menschen zu Jüngern machen|Jünger machen/i
const TALK_RE = /Ansprache|\bVortrag\b/i
const BELIEF_RE = /Glaubensansichten erklären/i
const SETTING_RE = /Von Haus zu Haus|Informell|In der Öffentlichkeit/i

/**
 * Personen-Slots eines Schülerteils (gold-Sektion): Gesprächsteile bekommen
 * Führer + Gesprächspartner (2), Vorträge/Ansprachen genau einen männlichen
 * Teilnehmer. „Unsere Glaubensansichten erklären" ist je nach Format Ansprache
 * (1, männlich) oder gespielte Szene (2) — erkannt an einem Predigtdienst-Rahmen
 * im Meta. Unbekannt → 1 Slot (Partner ggf. manuell).
 */
export function ministryNames(title: string, meta: string): ImportedSlot[] {
  const talk = { name: '', bereichsKey: 'schulung', male: true }
  const convo: ImportedSlot[] = [
    { name: '', bereichsKey: 'schulung' },
    { name: '', rolle: 'Gesprächspartner', bereichsKey: 'schulungPartner' },
  ]
  if (CONVO_RE.test(title)) return convo
  if (TALK_RE.test(title)) return [talk]
  if (BELIEF_RE.test(title)) return SETTING_RE.test(meta) ? convo : [talk]
  return [{ name: '', bereichsKey: 'schulung' }]
}

/**
 * Aufgabenart der Schülerteile von einer Referenzwoche (immer die deutsche — das
 * Arbeitsheft-Programm ist weltweit strukturgleich) auf eine lokalisierte Woche
 * übertragen: die Slot-Vorlagen der gold-Sektion (Führer/Partner/männlich)
 * werden positionsgenau übernommen. So bekommen auch nicht-deutsche Importe die
 * richtige Personenzahl, obwohl die Titel-Heuristik nur Deutsch versteht.
 */
export function applyGoldSlots(target: ImportedWeek, source: ImportedWeek): void {
  const tGold = target.mid.sections.find((s) => s.farbe === 'gold')
  const sGold = source.mid.sections.find((s) => s.farbe === 'gold')
  if (!tGold || !sGold) return
  for (let i = 0; i < tGold.items.length; i++) {
    const t = tGold.items[i]
    const s = sGold.items[i]
    if (!s || !('names' in t) || !('names' in s)) continue
    t.names = s.names.map((n) => ({ ...n }))
  }
}

/** Titel/Meta/Slots je Punkt festlegen — kennt jetzt die Position in der Sektion. */
function finalizeParts(recs: PartRec[]): void {
  const lastOf: Partial<Record<SecColor, PartRec>> = {}
  for (const rec of recs) lastOf[rec.color] = rec // letzter je Farbe

  for (const rec of recs) {
    const { part, color, raw, time } = rec
    const title = randTrim(raw.replace(NUMMER, ''))
    const min = firstParen(time)
    // Die Zahl getrennt vom Anzeigetext — sie ist in jeder Sprache dieselbe.
    part.mins = ersteZahl(min)

    if (color === 'teal' && rec === lastOf.teal) {
      // letzter Schätze-Punkt = Bibellesung. Schriftstelle anhängen.
      const scripture = stripParens(time)
      part.title = scripture ? `${title} · ${scripture}` : title
      part.meta = joinMeta(min, sourceOf(time))
      part.names = [{ name: '', bereichsKey: 'bibellesung' }]
    } else if (color === 'maroon' && rec === lastOf.maroon) {
      // letzter Unser-Leben-Punkt = Versammlungsbibelstudium (Leiter + Leser)
      part.title = title
      part.meta = joinMeta(min, sourceOf(time) || stripParens(time)) // Quelle oft klammerlos
      part.names = [
        { name: '', rolle: 'Leiter', bereichsKey: 'studium' },
        { name: '', rolle: 'Leser', bereichsKey: 'leser' },
      ]
    } else {
      part.title = title
      part.meta = joinMeta(settingOf(time), min, sourceOf(time))
      part.names =
        color === 'gold'
          ? ministryNames(title, part.meta)
          : [{ name: '', bereichsKey: 'vortrag' }]
    }
  }
}

function fallbackOpening(): ImportedPart {
  return {
    title: 'Lied · Gebet · Einleitende Worte',
    meta: '1 Min.',
    mins: 1,
    names: [
      { name: '', rolle: 'Vorsitz', bereichsKey: 'vorsitzMid' },
      { name: '', rolle: 'Gebet', bereichsKey: 'gebet' },
    ],
  }
}

/**
 * Wochenend-Vorlage (nicht im Arbeitsheft): vom Koordinator zu füllen.
 *
 * Durchweg deutsch — die App übersetzt beim Anzeigen. Exportiert, weil die
 * Gedächtnismahl-Woche dieselbe Vorlage braucht: Ihr Wochenende findet statt,
 * nur ihre Wochenseite gibt es nicht.
 */
export function weekendTemplate(range: string): ImportedMeeting {
  return {
    date: range,
    end: 'Ende ca. 11:45',
    sections: [
      { label: 'ERÖFFNUNG', farbe: 'neutral', items: [{ title: 'Lied · Gebet', names: [{ name: '', rolle: 'Vorsitz', bereichsKey: 'vorsitzWe' }, { name: '', rolle: 'Gebet', bereichsKey: 'gebet' }] }] },
      { label: 'ÖFFENTLICHER VORTRAG', farbe: 'petrol', items: [{ title: '(Vortragsthema eintragen)', meta: '30 Min.', mins: 30, names: [{ name: '', rolle: 'Gastredner', bereichsKey: 'vortrag' }] }] },
      { label: 'WACHTTURM-STUDIUM', farbe: 'wein', items: [{ song: 'Lied' }, { title: '(Studienartikel eintragen)', meta: '60 Min.', mins: 60, names: [{ name: '', rolle: 'Leiter', bereichsKey: 'studium' }, { name: '', rolle: 'Leser', bereichsKey: 'leser' }] }] },
      { label: 'ABSCHLUSS', farbe: 'neutral', items: [{ title: 'Schlussworte · Lied · Gebet', names: [{ name: '', rolle: 'Gebet', bereichsKey: 'gebet' }] }] },
    ],
    helpers: {},
  }
}
