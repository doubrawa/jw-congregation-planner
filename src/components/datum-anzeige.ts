/**
 * **Datumsformate, einmal gebaut.**
 *
 * Ein `Intl.DateTimeFormat` zu bauen kostet rund hundertmal so viel wie damit
 * zu formatieren (gemessen am 3.10.2026: 76 µs gegen 0,8 µs; `formatRange`
 * 115 µs gegen 16 µs). Die Pläne formatieren in Schleifen über Wochen,
 * Schichten und Auswahllisten — bei jedem Render, und der kommt mit jedem
 * Tastenanschlag. Bis dahin baute jeder Helfer seinen Formatierer je Aufruf.
 */

import type { Lang } from '../data/types'
import { LOCALES } from '../i18n/langs'

const FORMATE = {
  /** „Mittwoch, 7. Oktober" */
  tag: { weekday: 'long', day: 'numeric', month: 'long' },
  /** „Mi., 7. Okt." — für die Zeilen der Banner */
  kurzerTag: { weekday: 'short', day: 'numeric', month: 'short' },
  /** „So., 8. November" */
  kurzerWochentag: { weekday: 'short', day: 'numeric', month: 'long' },
  /** „Di., 8.9." — die Spalte vor einer Zeile auf dem Start */
  wochentagZahl: { weekday: 'short', day: 'numeric', month: 'numeric' },
  /** „12. Oktober" — als Spanne „12.–18. Oktober" */
  tagMonat: { day: 'numeric', month: 'long' },
  /** „1. Dezember 2026" — als Zeitraum „1. Dezember 2026 – 28. Februar 2027" */
  tagMonatJahr: { day: 'numeric', month: 'long', year: 'numeric' },
  /** „Oktober 2026" — auch die Monate eines weiteren Plans im Monatstakt */
  monatJahr: { month: 'long', year: 'numeric' },
  /** „Okt." — für die Monate zum Auslassen bei den Gruppenbesuchen */
  monatKurz: { month: 'short' },
} as const satisfies Record<string, Intl.DateTimeFormatOptions>

export type DatumsFormat = keyof typeof FORMATE

const gemerkt = new Map<string, Intl.DateTimeFormat>()

/**
 * Der Formatierer für Sprache und Format — beim ersten Mal gebaut, danach
 * gemerkt. Ein Sprach-Tag, das Intl nicht kennt, fällt auf die Sprache des
 * Geräts zurück, statt zu werfen: Seit dem neuen Design (T121) steht das Datum
 * in der Kopfzeile jedes Bildschirms, ein Wurf dort risse die ganze App mit.
 */
export function datumsFormat(lang: string, format: DatumsFormat): Intl.DateTimeFormat {
  const schluessel = `${lang}|${format}`
  let formatierer = gemerkt.get(schluessel)
  if (!formatierer) {
    try {
      formatierer = new Intl.DateTimeFormat(LOCALES[lang as Lang] ?? lang, FORMATE[format])
    } catch {
      formatierer = new Intl.DateTimeFormat(undefined, FORMATE[format])
    }
    gemerkt.set(schluessel, formatierer)
  }
  return formatierer
}
