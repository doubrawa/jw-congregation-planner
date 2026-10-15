import { datumsFormat } from '../components/datum-anzeige'
import { fromIso } from '../data/meeting-dates'
import type { Lang, MeetingTab, Week } from '../data/types'
import type { Dict } from '../i18n/ui'

/**
 * **Was „den ganzen Monat drucken" heißt** (T105).
 *
 * Gedruckt wird bisher die Woche, die gerade offen ist. Für den Aushang will
 * der Planer den Monat am Stück — aber Wochen und Monate gehen nicht auf. Die
 * Regel hier: **Zum Monat gehört jede Woche, deren Montag in ihm liegt.** Die
 * Woche vom 28. September bis 4. Oktober steht also auf dem September-Blatt,
 * die vom 5. Oktober auf dem Oktober-Blatt. So kommt jede Woche auf genau
 * einen Aushang — und das Oktober-Blatt beginnt nicht mit einer Woche, die
 * schon im September hing.
 *
 * Die Woche trägt ihren Montag als `start` (T66: Eine Woche ist ihr Datum,
 * nicht ihre Nummer). Aus ihm kommt der Monat, nicht aus der Position im
 * Bestand und nicht aus der Überschrift („28. Sep – 4. Okt"), die in der
 * Sprache der Versammlung steht.
 */

/** Monat einer Woche als `JJJJ-MM` — der Monat ihres Montags. */
export function monatDerWoche(week: Pick<Week, 'start'> | undefined): string | null {
  const start = week?.start ?? ''
  return /^\d{4}-\d{2}-\d{2}$/.test(start) ? start.slice(0, 7) : null
}

/**
 * Positionen der geladenen Wochen, die zu `monat` gehören, in ihrer Reihenfolge.
 *
 * Nur, was geladen ist: Wochen vor dem Ladefenster oder noch nicht importierte
 * fehlen auf dem Blatt, statt erfunden zu werden.
 */
export function wochenDesMonats(weeks: readonly Pick<Week, 'start'>[], monat: string): number[] {
  const out: number[] = []
  weeks.forEach((w, wi) => {
    if (monatDerWoche(w) === monat) out.push(wi)
  })
  return out
}

/**
 * **Was der Kopf eines Ausdrucks als Thema nennt** — die Zusammenkunft oder
 * die Treffpunkte; stehen am Desktop beide Tage im Blatt (`useBeideTage`),
 * „Zusammenkünfte". Eine Stelle für die Woche und den Monat: Bis hierher
 * stand die Auswahl in beiden, und jede Erweiterung musste sie zweimal finden.
 */
export function druckThema(
  t: Pick<Dict, 'navZusammenkuenfte' | 'tabWe' | 'tabMid' | 'fsShort'>,
  tab: MeetingTab,
  beideTage: boolean,
): string {
  if (beideTage) return t.navZusammenkuenfte
  return tab === 'we' ? t.tabWe : tab === 'fs' ? t.fsShort : t.tabMid
}

/**
 * „September 2026" in der Sprache des Lesers — auch die Monatsüberschriften
 * der Gruppenbesuche nehmen diese eine Fassung.
 */
export function monatsName(monat: string, lang: Lang): string {
  const tag = fromIso(`${monat}-01`)
  try {
    return datumsFormat(lang, 'monatJahr').format(tag)
  } catch {
    return new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(tag)
  }
}

/**
 * „7.–13. September 2026" in der Sprache des Lesers — der Kopf des
 * Wochenbogens. Aus dem Montag der Woche (`start`) bis zum Sonntag, nicht aus
 * der Überschrift (`range`), die in der Sprache der Versammlung steht und kein
 * Jahr trägt. Ohne gültiges Datum bleibt `ersatz`.
 */
export function wochenZeitraum(week: Pick<Week, 'start'>, lang: Lang, ersatz: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(week.start ?? '')) return ersatz
  const montag = fromIso(week.start)
  const sonntag = new Date(montag)
  sonntag.setDate(montag.getDate() + 6)
  try {
    return datumsFormat(lang, 'tagMonatJahr').formatRange(montag, sonntag)
  } catch {
    return ersatz
  }
}
