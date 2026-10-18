// =============================================================================
// Die Wochen des Arbeitshefts finden (import-week)
// =============================================================================
// Welche Wochen die Ausgaben anbieten — die laufenden und, bis ein Jahr zurück,
// die vergangenen —, und wo dieselbe Woche in einer anderen Sprache steht.
// Geteilt zwischen der Function (`index.ts`, holt mit
// Prüfung und Zwischenspeicher) und `scripts/heft-pruefen.mjs`, das jede neue
// Ausgabe gegen den Parser fährt — wie geholt wird, sagt der Aufrufer
// (`Holen`). Bis zum 16.10.2026 stand das in `index.ts`, die sich nicht
// importieren lässt: Sie startet beim Laden den Server.
// =============================================================================

import { gedaechtnismahlDatum, istLeseprogramm, leseprogrammJahr, montagDerWoche } from './gedaechtnismahl.ts'
import { MONTH_SLUG, MONTHS } from './study.ts'
import { wochenStart } from './wochen-slug.ts'

export const BASE = 'https://www.jw.org'

/**
 * **Wie weit die Wochensuche zurückreicht:** bis zum Montag vor einem Jahr.
 * So lange behält die App Wochen (`VERTEILUNG_WOCHEN` in
 * `src/data/aufbewahrung.ts`, T125), und so weit rechnet die Auswertung
 * (T126). Älteres liefert die Function nicht — die Datenbank räumte es in der
 * nächsten Nacht. `hefte.test.ts` hält beide Zahlen gleich.
 */
export const RUECKBLICK_WOCHEN = 52

/** Wie viele Ausgaben eine Suche liest: die, in der sie beginnt, und die zwei folgenden. */
const FENSTER = 3

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

/**
 * Die Ausgaben fortlaufend gezählt, sechs je Jahr, Januar/Februar zuerst: Die
 * folgende Ausgabe hat die folgende Zahl, auch über den Jahreswechsel.
 */
function ausgabeVon(tag: Date): number {
  return tag.getUTCFullYear() * 6 + Math.floor(tag.getUTCMonth() / 2)
}

/** Die Zahl einer Ausgabe aus ihrem Slug (`maerz-april-2026-mwb`) — `null`, wenn es keiner ist. */
function ausgabeAusSlug(slug: string): number | null {
  const m = /^[a-zä]+-([a-zä]+)-(\d{4})-mwb$/.exec(slug)
  const endMonat = m ? MONTHS[m[1] ?? ''] : undefined
  return m && endMonat ? Number(m[2]) * 6 + Math.floor((endMonat - 1) / 2) : null
}

/** Der Slug einer Ausgabe, wie jw.org ihn schreibt: `september-oktober-2025-mwb`. */
function ausgabenSlug(nr: number): string {
  const paar = nr % 6
  return `${MONTH_SLUG[2 * paar]}-${MONTH_SLUG[2 * paar + 1]}-${Math.floor(nr / 6)}-mwb`
}

/** Der Montag `RUECKBLICK_WOCHEN` Wochen vor dem Montag der Woche von `heute` — wie `aufbewahrtAb` in der App. */
function fruehesterMontag(heute: Date): Date {
  const montag = new Date(`${montagDerWoche(heute.toISOString().slice(0, 10))}T00:00:00Z`)
  montag.setUTCDate(montag.getUTCDate() - 7 * RUECKBLICK_WOCHEN)
  return montag
}

/**
 * Die Wochen des Arbeitshefts ab der Ausgabe, in der `ab` liegt — sie und die
 * zwei folgenden, immer aus dem deutschen Heft, nach Startdatum.
 *
 * **Auch zurück, bis zum Montag vor einem Jahr** (18.10.2026). Bis dahin las
 * die Suche nur die drei Ausgaben ab der laufenden, und ein Neuaufbau begann
 * ohne Geschichte: Die Auswertung (T126) hätte monatelang nichts gezeigt. Der
 * Index `/de/bibliothek/jw-arbeitsheft/` führt nur die letzten Ausgaben
 * (gemessen am 18.10.2026: acht, die älteste November/Dezember 2025). Ältere
 * stehen weiter auf jw.org, nur ohne Eintrag — `september-oktober-2025-mwb`
 * antwortet mit allen Wochenlinks. Ihren Slug baut die Suche deshalb selbst,
 * aber nur für vergangene: Eine künftige, die der Index nicht nennt, ist noch
 * nicht erschienen. Fehlt eine gebaute, fehlen nur ihre Wochen — die übrigen
 * kommen trotzdem, und `wochen-importieren.mjs` meldet die Lücke.
 *
 * `ab` ist der Tag, nach dem gesucht wird (`after` oder `start` der
 * Function). Bis zum 18.10.2026 zählte stattdessen der heutige Monat: Am
 * Sonntag, dem 1. März, fiel so die laufende Woche (ab 23. Februar) aus der
 * Suche, denn ihre Ausgabe endete im Februar.
 */
export async function discoverWeeks(holen: Holen, ab = new Date(), heute = new Date()): Promise<Wocheneintrag[]> {
  if (Number.isNaN(ab.getTime())) return [] // kein Datum — keine Woche, und dafür wird nichts geholt
  const index = await holen(`${BASE}/de/bibliothek/jw-arbeitsheft/`)
  const imIndex = new Map<number, string>()
  for (const [, slug = ''] of index.matchAll(/jw-arbeitsheft\/([a-zä]+-[a-zä]+-\d{4}-mwb)\//g)) {
    const nr = ausgabeAusSlug(slug)
    if (nr !== null) imIndex.set(nr, slug)
  }

  const frist = fruehesterMontag(heute)
  const laufende = ausgabeVon(heute)
  const erste = Math.max(ausgabeVon(ab), ausgabeVon(frist))
  const weeks: Wocheneintrag[] = []
  for (let nr = erste; nr < erste + FENSTER; nr++) {
    const gelistet = imIndex.get(nr)
    if (!gelistet && nr >= laufende) continue // noch nicht erschienen
    const slug = gelistet ?? ausgabenSlug(nr)
    const adresse = `${BASE}/de/bibliothek/jw-arbeitsheft/${slug}/`
    // Eine gelistete Ausgabe muss da sein — fehlt sie, ist das ein Fehler wie bisher.
    const page = gelistet ? await holen(adresse) : await holen(adresse).catch(() => null)
    if (page === null) continue
    const re = new RegExp(`/de/bibliothek/jw-arbeitsheft/${slug}/[^"'>]*Zusammenkunft-[^"'>]*`, 'g')
    for (const href of new Set([...page.matchAll(re)].map((m) => m[0]))) {
      const start = wochenStart(href)
      if (start) weeks.push({ start, url: `${BASE}${href}` })
    }
    // Danach, nicht davor: erst wenn die Seiten dieser Ausgabe stehen, ist zu
    // sehen, ob die Woche des Mahls unter ihnen fehlt.
    await mitGedaechtnismahl(holen, slug, page, weeks)
  }
  weeks.sort((a, b) => a.start.getTime() - b.start.getTime())
  // Die Ausgabe der Frist beginnt vor ihr — was davor liegt, liefert die Suche nicht.
  return weeks.filter((w) => w.start >= frist)
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
