import { fromIso } from '../data/meeting-dates'
import { LOCALES } from '../i18n/langs'
import type { Lang, Week } from '../data/types'

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

/** „September 2026" in der Sprache des Lesers. */
export function monatsName(monat: string, lang: Lang): string {
  const tag = fromIso(`${monat}-01`)
  try {
    return new Intl.DateTimeFormat(LOCALES[lang] ?? lang, { month: 'long', year: 'numeric' }).format(tag)
  } catch {
    return new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(tag)
  }
}

/**
 * **Die Weiche zwischen den Ausdrucken.**
 *
 * Drei Regelwerke sagen im Druck „alles außer mir ausblenden": das Programm
 * einer Woche (`print.css`, der Normalfall), die S-89-Zettel
 * (`planen/print-s89.css`) und der Monat (`print-monat.css`). Welches gilt,
 * sagt das Kennzeichen `data-print` am Wurzelelement — gesetzt beim Klick,
 * abgeräumt, wenn der Druckdialog durch ist. Ohne Kennzeichen druckt die Woche.
 *
 * Hier gesetzt statt an jedem Knopf von Hand: Ein stehengebliebenes
 * Kennzeichen (ein Abbruch vor `afterprint`) ließe sonst den nächsten
 * Wochen-Ausdruck still als Monat oder als Zettelbogen herauskommen.
 */
export function druckKennzeichen(kennzeichen: 'monat' | null): void {
  if (kennzeichen) document.documentElement.dataset.print = kennzeichen
  else delete document.documentElement.dataset.print
}
