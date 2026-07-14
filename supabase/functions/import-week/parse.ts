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

export interface ImportedSlot {
  name: string
  rolle?: string
  bereichsKey?: string
}
export interface ImportedPart {
  num?: number
  title: string
  meta?: string
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

/* ---- Text-Helfer --------------------------------------------------------- */

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&shy;/g, '') // Soft Hyphen als Entity
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&rsquo;/g, '’')
    .replace(/&lsquo;/g, '‘')
    .replace(/&ldquo;/g, '„')
    .replace(/&rdquo;/g, '“')
}

/** Tags entfernen, Entities dekodieren, Soft-Hyphens/Weichzeichen bereinigen. */
function clean(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, ' '))
    .replace(/­/g, '') // Soft Hyphen (z. B. "Versammlungs­bibelstudium")
    .replace(/​/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/* ---- Tokenizer ----------------------------------------------------------- */

type Color = 'teal' | 'gold' | 'maroon' | 'sub' | 'none'
interface Token {
  tag: string // h1|h2|h3|p
  color: Color
  music: boolean
  text: string
}

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
    const text = clean(inner)
    if (!text) continue
    tokens.push({
      tag: tag === 'li' ? 'p' : tag,
      color: colorOf(attrs),
      music: /dc-icon--music/.test(attrs) || /dc-icon--music/.test(inner),
      text,
    })
  }
  return tokens
}

/* ---- Feld-Parser (sprachunabhängig) -------------------------------------- */

/** Beginnt die Zeile mit einer Zeitklammer „(<Ziffer> …)“? (nicht Aufzählung) */
const TIME_START = /^\s*\(\s*\d/
/** Publikations-Kürzel (MEPS, in jeder Sprache gleich). */
const PUB_SYM = /\b(th|lmd|lff|lfb|wcg|bt|jr|it|bhs|cf|lvs|rr|od|kr|jy|cl|be|sjj|snnw|w\d{2}|g\d{2})\b/i

/** Inhalt der ersten Klammer (die Zeit, lokalisiert: „10 min.“ / „10 λεπτά“). */
function firstParen(text: string): string {
  return ((text.match(/\(([^)]*)\)/) || [])[1] || '').trim()
}

/** Text ohne jegliche Klammern (Schriftstelle bzw. klammerlose Quelle). */
function stripParens(text: string): string {
  return text.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim()
}

/** Quellenangabe: bevorzugt die letzte Klammer mit Publikations-Kürzel. */
function sourceOf(text: string): string {
  const parens = [...text.matchAll(/\(([^)]*)\)/g)].map((m) => m[1].trim())
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
  const after = text.replace(/^\s*\([^)]*\)/, '').trim()
  const seg = after.split(/[.。．]/)[0].trim()
  return seg && seg.length <= 32 && !/\d/.test(seg) ? seg : ''
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
      const hasTime = /\(\s*\d/.test(tok.text)
      const [a, b] = pipe(tok.text)
      if (curColor === null) {
        // vor der ersten Sektion → Eröffnung (Vorsitz + Anfangsgebet)
        const title = b ? `${stripParens(a)} · ${stripParens(b)}` : stripParens(a)
        opening = {
          title,
          meta: joinMeta(firstParen(tok.text)),
          names: [
            { name: '', rolle: 'Vorsitz', bereichsKey: 'vorsitz' },
            { name: '', rolle: 'Gebet', bereichsKey: 'gebet' },
          ],
        }
      } else if (hasPipe || hasTime) {
        // nach den Sektionen mit „|“/Zeit → Abschluss (Schlussgebet)
        const title = b ? `${stripParens(a)} · ${stripParens(b)}` : stripParens(a)
        closing = { title, meta: joinMeta(firstParen(tok.text)), names: [{ name: '', rolle: 'Gebet', bereichsKey: 'gebet' }] }
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
      const numMatch = tok.text.match(/^\s*(\d+)\.\s*/)
      if (numMatch) part.num = Number(numMatch[1])
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
      items: [closing ?? { title: 'Schlussworte · Gebet', meta: '3 Min.', names: [{ name: '', rolle: 'Gebet', bereichsKey: 'gebet' }] }],
    },
  ]

  const mid: ImportedMeeting = { date: range, end: 'Ende ca. 20:45', sections: midSections, helpers: {} }
  return { range, book, current: false, mid, we: weekendTemplate(range) }
}

/** Titel/Meta/Slots je Punkt festlegen — kennt jetzt die Position in der Sektion. */
function finalizeParts(recs: PartRec[]): void {
  const lastOf: Partial<Record<SecColor, PartRec>> = {}
  for (const rec of recs) lastOf[rec.color] = rec // letzter je Farbe

  for (const rec of recs) {
    const { part, color, raw, time } = rec
    const title = raw.replace(/^\s*\d+\.\s*/, '').trim()
    const min = firstParen(time)

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
      part.names = [{ name: '', bereichsKey: color === 'gold' ? 'schulung' : 'vortrag' }]
    }
  }
}

function fallbackOpening(): ImportedPart {
  return {
    title: 'Lied · Gebet · Einleitende Worte',
    meta: '1 Min.',
    names: [
      { name: '', rolle: 'Vorsitz', bereichsKey: 'vorsitz' },
      { name: '', rolle: 'Gebet', bereichsKey: 'gebet' },
    ],
  }
}

/** Wochenend-Vorlage (nicht im Arbeitsheft): vom Koordinator zu füllen. */
function weekendTemplate(range: string): ImportedMeeting {
  return {
    date: range,
    end: 'Ende ca. 11:45',
    sections: [
      { label: 'ERÖFFNUNG', farbe: 'neutral', items: [{ title: 'Lied · Gebet', names: [{ name: '', rolle: 'Vorsitz', bereichsKey: 'vorsitz' }, { name: '', rolle: 'Gebet', bereichsKey: 'gebet' }] }] },
      { label: 'ÖFFENTLICHER VORTRAG', farbe: 'petrol', items: [{ title: '(Vortragsthema eintragen)', meta: '30 Min.', names: [{ name: '', rolle: 'Gastredner', bereichsKey: 'vortrag' }] }] },
      { label: 'WACHTTURM-STUDIUM', farbe: 'wein', items: [{ song: 'Lied' }, { title: '(Studienartikel eintragen)', meta: '60 Min.', names: [{ name: '', rolle: 'Leiter', bereichsKey: 'studium' }, { name: '', rolle: 'Leser', bereichsKey: 'leser' }] }] },
      { label: 'ABSCHLUSS', farbe: 'neutral', items: [{ title: 'Schlussworte · Lied · Gebet', names: [{ name: '', rolle: 'Gebet', bereichsKey: 'gebet' }] }] },
    ],
    helpers: {},
  }
}
