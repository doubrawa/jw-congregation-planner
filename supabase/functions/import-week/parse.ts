// =============================================================================
// Arbeitsheft-Parser (Leben-und-Dienst-Zusammenkunft, jw.org / wol.jw.org)
// =============================================================================
// Reine Funktion (kein Deno-/Node-Spezifikum), damit sie sowohl in der Supabase
// Edge Function als auch im Vitest-Test läuft. Wandelt das HTML einer
// Wochenseite in unsere Week-Struktur (nur die Zusammenkunft unter der Woche;
// das Wochenende steht nicht im Arbeitsheft → editierbare Vorlage).
//
// Die Erkennung keyt bewusst auf die **Farbklassen** der Überschriften
// (teal/gold/maroon) und das Noten-Icon — nicht auf den Text —, damit sie
// sprachunabhängig und gegen Textänderungen robust ist.
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

/* ---- Feld-Parser --------------------------------------------------------- */

const MIN_RE = /\((\d+)\s*Min\.?\)/
const SONG_RE = /(?:Lied|Song)\s+(\d+)/i

/** Minuten aus einer Zeit-Zeile lesen. */
function minutesOf(text: string): number | null {
  const m = MIN_RE.exec(text)
  return m ? Number(m[1]) : null
}

/** Quellenangabe (letzte Klammer mit Publikations-Kürzel) extrahieren. */
function sourceOf(text: string): string {
  const groups = text.match(/\(([^()]*)\)/g) || []
  for (let i = groups.length - 1; i >= 0; i--) {
    const inner = groups[i].slice(1, -1).trim()
    if (/\b(th|lmd|lff|lfb|wcg|bt|jr|it|w\d{2}|g\d{2}|bhs|cf)\b/i.test(inner)) {
      return inner.replace(/\s+/g, ' ').trim()
    }
  }
  return ''
}

/** Rahmen der Zeit-Zeile auf die kanonische Bezeichnung abbilden. */
function settingOf(text: string): string {
  if (/haus zu haus/i.test(text)) return 'Von Haus zu Haus'
  if (/informell/i.test(text)) return 'Informell'
  if (/öffentlichkeit/i.test(text)) return 'In der Öffentlichkeit'
  if (/besprechung/i.test(text)) return 'Besprechung'
  return ''
}

/** Bibelstelle in der Bibellesungs-Zeit-Zeile (zwischen Zeit und Quelle). */
function scriptureOf(text: string): string {
  const after = text.replace(MIN_RE, '').replace(/\([^()]*\)/g, '').trim()
  return after.replace(/\s+/g, ' ').trim()
}

function metaFrom(setting: string, minutes: number | null, source: string): string {
  const mins = minutes != null ? `${minutes} Min.` : ''
  const parts = setting ? [setting, mins] : [mins]
  if (source) parts.push(source)
  return parts.filter(Boolean).join(' · ')
}

/* ---- Section-/Slot-Zuordnung -------------------------------------------- */

const SECTION: Record<'teal' | 'gold' | 'maroon', { label: string; farbe: string }> = {
  teal: { label: 'SCHÄTZE AUS GOTTES WORT', farbe: 'petrol' },
  gold: { label: 'UNS IM DIENST VERBESSERN', farbe: 'gold' },
  maroon: { label: 'UNSER LEBEN ALS CHRIST', farbe: 'wein' },
}

function isVbs(title: string): boolean {
  return /Versammlungsbibelstudium/i.test(title)
}
function isBibellesung(title: string): boolean {
  return /Bibellesung|Bible Reading/i.test(title)
}

/** Nötige Qualifikation je Programmpunkt (für die Auto-Zuteilung). */
function bereichFor(color: 'teal' | 'gold' | 'maroon', title: string): string {
  if (color === 'gold') return 'schulung'
  if (isBibellesung(title)) return 'lesen'
  return 'vortrag' // teal-Vorträge und maroon-Besprechungen
}

/* ---- Hauptfunktion ------------------------------------------------------- */

export function parseWorkbookWeek(html: string): ImportedWeek {
  const tokens = tokenize(html)
  if (tokens.length === 0) throw new Error('Kein Programm gefunden (Seitenstruktur unerwartet).')

  let range = ''
  let book = ''
  let opening: ImportedPart | null = null
  let closing: ImportedPart | null = null
  const sections: Record<'teal' | 'gold' | 'maroon', ImportedSection> = {
    teal: { label: SECTION.teal.label, farbe: SECTION.teal.farbe, items: [] },
    gold: { label: SECTION.gold.label, farbe: SECTION.gold.farbe, items: [] },
    maroon: { label: SECTION.maroon.label, farbe: SECTION.maroon.farbe, items: [] },
  }

  let curColor: 'teal' | 'gold' | 'maroon' | null = null
  let curPart: ImportedPart | null = null

  const finishTime = (timeText: string): void => {
    if (!curPart || !curColor) return
    const minutes = minutesOf(timeText)
    const source = sourceOf(timeText)
    if (isBibellesung(curPart.title)) {
      const scripture = scriptureOf(timeText)
      if (scripture) curPart.title = `Bibellesung · ${scripture}`
      curPart.meta = metaFrom('', minutes, source)
    } else if (isVbs(curPart.title)) {
      curPart.title = 'Versammlungsbibelstudium'
      curPart.meta = metaFrom('', minutes, source || scriptureOf(timeText)) // Quelle oft ohne Klammern
      curPart.names = [
        { name: '', rolle: 'Leiter', bereichsKey: 'studium' },
        { name: '', rolle: 'Leser', bereichsKey: 'lesen' },
      ]
    } else {
      curPart.meta = metaFrom(settingOf(timeText), minutes, source)
    }
  }

  for (const tok of tokens) {
    // Datum (h1) und Bibellese (erstes farbloses h2)
    if (tok.tag === 'h1') {
      range = tok.text.replace(/\s*[·|].*$/, '').replace(/-/g, '–').trim()
      continue
    }
    if (tok.tag === 'h2' && tok.color === 'none') {
      if (!book) book = tok.text
      continue
    }
    // Sektions-Überschriften (farbig)
    if (tok.tag === 'h2' && (tok.color === 'teal' || tok.color === 'gold' || tok.color === 'maroon')) {
      curColor = tok.color
      curPart = null
      continue
    }
    // Lieder / Eröffnung / Abschluss (Noten-Icon)
    if (tok.tag === 'h3' && tok.music) {
      const song = (SONG_RE.exec(tok.text) || [])[1]
      const songLabel = song ? `Lied ${song}` : tok.text
      if (/Einleitende Worte|Opening Comments/i.test(tok.text)) {
        opening = {
          title: `${songLabel} · Gebet · Einleitende Worte`,
          meta: metaFrom('', minutesOf(tok.text), ''),
          names: [
            { name: '', rolle: 'Vorsitz', bereichsKey: 'vorsitz' },
            { name: '', rolle: 'Gebet', bereichsKey: 'gebet' },
          ],
        }
      } else if (/Schlussworte|Concluding/i.test(tok.text)) {
        closing = {
          title: `Schlussworte · ${songLabel} · Gebet`,
          meta: metaFrom('', minutesOf(tok.text), ''),
          names: [{ name: '', rolle: 'Gebet', bereichsKey: 'gebet' }],
        }
      } else if (curColor === 'maroon') {
        sections.maroon.items.push({ song: songLabel })
      }
      curPart = null
      continue
    }
    // Nummerierter Programmpunkt (farbige h3)
    if (tok.tag === 'h3' && curColor && (tok.color === 'teal' || tok.color === 'gold' || tok.color === 'maroon')) {
      const numMatch = tok.text.match(/^(\d+)\.\s*/)
      const title = tok.text.replace(/^\d+\.\s*/, '').trim()
      curPart = {
        title,
        names: [{ name: '', bereichsKey: bereichFor(curColor, title) }],
      }
      if (numMatch) curPart.num = Number(numMatch[1])
      sections[curColor].items.push(curPart)
      continue
    }
    // Zeit-/Quelle-Zeile direkt nach einem Programmpunkt
    if (tok.tag === 'p' && curPart && curPart.meta == null && MIN_RE.test(tok.text)) {
      finishTime(tok.text)
    }
  }

  const midSections: ImportedSection[] = []
  midSections.push({
    label: 'ERÖFFNUNG',
    farbe: 'neutral',
    items: [opening ?? { title: 'Lied · Gebet · Einleitende Worte', meta: '1 Min.', names: [{ name: '', rolle: 'Vorsitz', bereichsKey: 'vorsitz' }, { name: '', rolle: 'Gebet', bereichsKey: 'gebet' }] }],
  })
  midSections.push(sections.teal, sections.gold, sections.maroon)
  midSections.push({
    label: 'ABSCHLUSS',
    farbe: 'neutral',
    items: [closing ?? { title: 'Schlussworte · Gebet', meta: '3 Min.', names: [{ name: '', rolle: 'Gebet', bereichsKey: 'gebet' }] }],
  })

  const mid: ImportedMeeting = {
    date: range,
    end: 'Ende ca. 20:45',
    sections: midSections,
    helpers: {},
  }

  return { range, book, current: false, mid, we: weekendTemplate(range) }
}

/** Wochenend-Vorlage (nicht im Arbeitsheft): vom Koordinator zu füllen. */
function weekendTemplate(range: string): ImportedMeeting {
  return {
    date: range,
    end: 'Ende ca. 11:45',
    sections: [
      { label: 'ERÖFFNUNG', farbe: 'neutral', items: [{ title: 'Lied · Gebet', names: [{ name: '', rolle: 'Vorsitz', bereichsKey: 'vorsitz' }, { name: '', rolle: 'Gebet', bereichsKey: 'gebet' }] }] },
      { label: 'ÖFFENTLICHER VORTRAG', farbe: 'petrol', items: [{ title: '(Vortragsthema eintragen)', meta: '30 Min.', names: [{ name: '', rolle: 'Gastredner', bereichsKey: 'vortrag' }] }] },
      { label: 'WACHTTURM-STUDIUM', farbe: 'wein', items: [{ song: 'Lied' }, { title: '(Studienartikel eintragen)', meta: '60 Min.', names: [{ name: '', rolle: 'Leiter', bereichsKey: 'studium' }, { name: '', rolle: 'Leser', bereichsKey: 'lesen' }] }] },
      { label: 'ABSCHLUSS', farbe: 'neutral', items: [{ title: 'Schlussworte · Lied · Gebet', names: [{ name: '', rolle: 'Gebet', bereichsKey: 'gebet' }] }] },
    ],
    helpers: {},
  }
}
