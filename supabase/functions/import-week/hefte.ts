// =============================================================================
// Die Wochen des Arbeitshefts finden (import-week)
// =============================================================================
// Welche Wochen die laufenden Ausgaben anbieten, und wo dieselbe Woche in einer
// anderen Sprache steht. Geteilt zwischen der Function (`index.ts`, holt mit
// Prüfung und Zwischenspeicher) und `scripts/heft-pruefen.mjs`, das jede neue
// Ausgabe gegen den Parser fährt — wie geholt wird, sagt der Aufrufer
// (`Holen`). Bis zum 16.10.2026 stand das in `index.ts`, die sich nicht
// importieren lässt: Sie startet beim Laden den Server.
// =============================================================================

import { gedaechtnismahlDatum, istLeseprogramm, leseprogrammJahr, montagDerWoche } from './gedaechtnismahl.ts'
import { MONTHS } from './study.ts'
import { wochenStart } from './wochen-slug.ts'

export const BASE = 'https://www.jw.org'

/** Wer bei jw.org anfragt — klar benannt, mit Weg zum Projekt. */
export const UA = 'jw-congregation-planner/1.0 (+https://github.com/doubrawa/jw-congregation-planner)'

/** Eine Seite holen — in der Function nur von jw.org, mit Zwischenspeicher (`fetchText`). */
export type Holen = (url: string) => Promise<string>

/**
 * Eine Woche, die das Arbeitsheft anbietet.
 *
 * `url === null` heißt: **es gibt keine Seite** — die Woche des
 * Gedächtnismahls, die das Heft auslässt (siehe gedaechtnismahl.ts). `mem`
 * trägt das Datum des Mahls, sobald es in diese Woche fällt; das gilt auch für
 * Wochen, die ganz normal eine Seite haben (Mahl am Wochenende).
 */
export interface Wocheneintrag {
  start: Date
  url: string | null
  mem?: string
}

/**
 * Das Gedächtnismahl dieser Ausgabe in die Wochenliste eintragen.
 *
 * Gemessen statt geraten: Steht auf der Ausgabenseite eine
 * Bibelleseprogramm-Seite, nennt sie den Tag ausgeschrieben. Aus ihm ergibt
 * sich der Montag seiner Woche — und erst der Vergleich mit den gefundenen
 * Wochenseiten sagt, ob eine **fehlt**.
 *
 * Eine Lücke einfach an ihrem Abstand zu erkennen wäre verlockend und falsch:
 * Zwischen zwei Ausgaben klafft ebenfalls eine, wenn die folgende noch nicht
 * veröffentlicht ist — und in Jahren mit Mahl am Wochenende gibt es gar keine.
 */
async function mitGedaechtnismahl(holen: Holen, slug: string, seite: string, wochen: Wocheneintrag[]): Promise<void> {
  const re = new RegExp(`/de/bibliothek/jw-arbeitsheft/${slug}/[^"'>]*`, 'g')
  const pfad = [...seite.matchAll(re)].map((m) => m[0]).find(istLeseprogramm)
  if (!pfad) return
  const jahr = leseprogrammJahr(pfad)
  if (!jahr) return

  let mem: string | null = null
  try {
    mem = gedaechtnismahlDatum(await holen(BASE + pfad), jahr)
  } catch {
    return // Seite nicht abrufbar: dann eben ohne — der Import bricht deswegen nicht ab
  }
  if (!mem) return

  const montag = montagDerWoche(mem)
  const vorhanden = wochen.find((w) => w.start.toISOString().slice(0, 10) === montag)
  if (vorhanden) {
    vorhanden.mem = mem // Mahl am Wochenende: die Woche gibt es, sie bekommt nur den Anlass
    return
  }
  wochen.push({ start: new Date(`${montag}T00:00:00Z`), url: null, mem })
}

/** Kommende Wochen (immer aus dem deutschen Arbeitsheft), nach Startdatum. */
export async function discoverWeeks(holen: Holen, now = new Date()): Promise<Wocheneintrag[]> {
  const index = await holen(`${BASE}/de/bibliothek/jw-arbeitsheft/`)
  const periods = [...new Set([...index.matchAll(/jw-arbeitsheft\/([a-zä]+-[a-zä]+-\d{4}-mwb)\//g)].map((m) => m[1]))]
    .map((slug) => {
      const m = slug.match(/^([a-zä]+)-([a-zä]+)-(\d{4})-mwb$/)
      return m ? { slug, year: Number(m[3]), endMonth: MONTHS[m[2]] ?? 0 } : null
    })
    .filter((p): p is { slug: string; year: number; endMonth: number } => p != null)
    .filter((p) => p.year > now.getFullYear() || (p.year === now.getFullYear() && p.endMonth >= now.getMonth() + 1))
    .sort((a, b) => a.year - b.year || a.endMonth - b.endMonth)
    .slice(0, 3)

  const weeks: Wocheneintrag[] = []
  for (const p of periods) {
    const page = await holen(`${BASE}/de/bibliothek/jw-arbeitsheft/${p.slug}/`)
    const re = new RegExp(`/de/bibliothek/jw-arbeitsheft/${p.slug}/[^"'>]*Zusammenkunft-[^"'>]*`, 'g')
    for (const href of new Set([...page.matchAll(re)].map((m) => m[0]))) {
      const start = wochenStart(href)
      if (start) weeks.push({ start, url: `${BASE}${href}` })
    }
    // Danach, nicht davor: erst wenn die Seiten dieser Ausgabe stehen, ist zu
    // sehen, ob die Woche des Mahls unter ihnen fehlt.
    await mitGedaechtnismahl(holen, p.slug, page, weeks)
  }
  weeks.sort((a, b) => a.start.getTime() - b.start.getTime())
  return weeks
}

/**
 * Lokalisierte URL derselben Woche: auf der deutschen Seite trägt jede Option des
 * „Lesen in“-Umschalters `value="<code>"` und `data-url="/<code>/…"`. Liefert die
 * absolute URL für `lang` oder null, wenn die Woche in der Sprache fehlt.
 *
 * In beiden Anführungszeichen: Ab Januar 2027 schreibt jw.org Attribute teils
 * einfach angeführt (gemessen am 16.10.2026 an den Liederbuch-Links). Träfe es
 * den Umschalter, fände keine fremdsprachige Versammlung mehr ihre Woche.
 */
export function localizedUrl(germanHtml: string, lang: string): string | null {
  const code = lang.replace(/[^a-z0-9-]/gi, '')
  const re = new RegExp(`<option\\b[^>]*\\bvalue=(["'])${code}\\1[^>]*\\bdata-url=(["'])(.*?)\\2`, 'i')
  const m = germanHtml.match(re)
  if (!m) return null
  const path = (m[3] ?? '').replace(/&amp;/g, '&')
  return path.startsWith('http') ? path : BASE + path
}
