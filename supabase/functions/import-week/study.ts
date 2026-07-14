// =============================================================================
// Wachtturm-Studienausgabe — reine Parser (kein Deno/fetch), damit sie sowohl in
// der Edge Function als auch im Vitest-Test laufen.
// =============================================================================
// SPRACHUNABHÄNGIG wie der Arbeitsheft-Parser: Erkennung keyt auf **Struktur**
// (Synopsis-Karten, das MEPS-Liederbuch-Symbol `pub-sjj`, `<h1 data-pid>`), nicht
// auf Text. Der sichtbare Text (Titel, Lied-Nummer + Titel) bleibt wörtlich in
// der Zielsprache. Der Studienausgabe-Slug wird immer auf Deutsch angesetzt
// (verlässlicher Anker), der Wochen-Match läuft über Tag+Monat des ISO-Datums.
// =============================================================================

export const MONTHS: Record<string, number> = {
  januar: 1, februar: 2, maerz: 3, 'märz': 3, april: 4, mai: 5, juni: 6,
  juli: 7, august: 8, september: 9, oktober: 10, november: 11, dezember: 12,
}

const MONTH_SLUG = [
  'januar', 'februar', 'maerz', 'april', 'mai', 'juni',
  'juli', 'august', 'september', 'oktober', 'november', 'dezember',
]

// Unechte Leerzeichen, die beim Entfernen von Tags in CJK-Läufen entstehen,
// wieder zusammenziehen — nur Japanisch-Kana + CJK-Ideogramme (Chinesisch/
// Japanisch), KEIN Hangul (Koreanisch nutzt Wort-Leerzeichen wie Latein).
const CJK_SPACE =
  /([぀-ヿ㐀-䶿一-鿿ｦ-ﾟ])\s+(?=[぀-ヿ㐀-䶿一-鿿ｦ-ﾟ\d])|(\d)\s+(?=[぀-ヿ㐀-䶿一-鿿ｦ-ﾟ])/g

export function cleanText(html: string): string {
  return html
    .replace(/<rt\b[^>]*>[\s\S]*?<\/rt>/gi, '') // Ruby-Lesungen (Furigana/Pinyin) entfernen
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&nbsp;|&shy;|­/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .replace(CJK_SPACE, '$1$2')
    .trim()
}

/** Studienausgabe-Slugs, die die Studienwoche enthalten könnten (Monat −2/−3). */
export function studyIssueSlugs(start: Date): string[] {
  const slugs: string[] = []
  for (const off of [2, 3]) {
    const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - off, 1))
    slugs.push(`wachtturm-studienausgabe-${MONTH_SLUG[d.getUTCMonth()]}-${d.getUTCFullYear()}`)
  }
  return slugs
}

export interface StudySynopsis {
  day: number
  mon: number
  title: string
  href: string
}

/**
 * Studienartikel einer Ausgabe: pro Karte (<div class="synopsis …">) Woche
 * (contextTitle) + Titel + href (h2>a). Kartenweise, damit nicht über
 * Kartengrenzen hinweg gepaart wird — die Kopf-Karte „DER WACHTTURM“ trägt kein
 * Datum und würde sonst die erste Artikel-Überschrift abgreifen (Off-by-one).
 */
export function studySynopses(html: string): StudySynopsis[] {
  const out: StudySynopsis[] = []
  for (const card of html.split(/class="synopsis/)) {
    const ct = card.match(/contextTitle">([\s\S]*?)<\/p>/)
    const a = card.match(/<h2>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/)
    if (!ct || !a) continue
    const week = cleanText(ct[1])
    const dayMatch = week.match(/(\d{1,2})/)
    if (!dayMatch) continue
    let mon = 0
    for (const w of week.toLowerCase().match(/[a-zäöü]+/g) ?? []) {
      if (MONTHS[w]) { mon = MONTHS[w]; break }
    }
    if (!mon) continue
    out.push({ day: Number(dayMatch[1]), mon, title: cleanText(a[2]), href: a[1].replace(/&amp;/g, '&') })
  }
  return out
}

/** Lokalisierter Artikeltitel: erstes <h1> mit data-pid (Dialoge tragen keins). */
export function articleTitle(html: string): string | null {
  const m = html.match(/<h1\b[^>]*\bdata-pid=[^>]*>([\s\S]*?)<\/h1>/i)
  return m ? cleanText(m[1]) : null
}

/**
 * Lied-Referenzen des Artikels in Reihenfolge. Lied-Links tragen sprachunabhängig
 * `class="pub-sjj"` (MEPS-Symbol des Liederbuchs „Singt voller Freude“) — das
 * erste ist das Lied vor dem Studium, das letzte das Schlusslied. Bibelstellen
 * teilen sich zwar das <a><strong>-Markup, tragen aber `pub-nwt`/`target` und
 * werden so nicht erfasst. Der Text (lokalisierte Nummer + Titel) bleibt in der
 * Zielsprache.
 */
export function songs(html: string): string[] {
  const re = /<a\b[^>]*class="[^"]*\bpub-sjj\b[^"]*"[^>]*>([\s\S]*?)<\/a>\s*([^<]*)/g
  const out: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    const s = cleanText(`${m[1]} ${m[2]}`)
    if (s) out.push(s)
  }
  return out
}
