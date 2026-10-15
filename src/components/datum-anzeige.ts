/**
 * **Datumsformate, einmal gebaut.**
 *
 * Ein `Intl.DateTimeFormat` zu bauen kostet rund hundertmal so viel wie damit
 * zu formatieren (gemessen am 3.10.2026: 76 µs gegen 0,8 µs; `formatRange`
 * 115 µs gegen 16 µs). Die Pläne formatieren in Schleifen über Wochen,
 * Termine und Auswahllisten — bei jedem Render, und der kommt mit jedem
 * Tastenanschlag. Bis dahin baute jeder Helfer seinen Formatierer je Aufruf.
 */

import { fromIso, tagNach } from '../data/meeting-dates'
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
  /** „8.9." — unter dem Wochentag auf der Karte einer Zusammenkunft */
  tagZahl: { day: 'numeric', month: 'numeric' },
  /** „Dienstag" — der Name der Karte einer Zusammenkunft */
  wochentag: { weekday: 'long' },
  /** „So." — vor den Aufgaben am anderen Tag der Woche, im Zuteilen-Blatt */
  wochentagKurz: { weekday: 'short' },
  /** „12" — die Zahl unter dem Wochentag bei der Wahl eines Tages (Trolleys) */
  tagNummer: { day: 'numeric' },
  /** „12. Oktober" — als Spanne „12.–18. Oktober" */
  tagMonat: { day: 'numeric', month: 'long' },
  /** „4. Sept." — der Tag unter einem Schritt der Spur (Link gesendet) */
  tagMonatKurz: { day: 'numeric', month: 'short' },
  /** „1. Dezember 2026" — als Zeitraum „1. Dezember 2026 – 28. Februar 2027" */
  tagMonatJahr: { day: 'numeric', month: 'long', year: 'numeric' },
  /** „28. Feb. 2027" — Von und Bis eines Weiteren Plans, zwei Felder nebeneinander */
  tagKurzJahr: { day: 'numeric', month: 'short', year: 'numeric' },
  /** „Oktober 2026" — auch die Monate eines weiteren Plans im Monatstakt */
  monatJahr: { month: 'long', year: 'numeric' },
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

/**
 * Ein Zeitraum von Tag zu Tag (beide ISO) in Worten — ein einzelner Tag
 * einmal, nicht „1.–1. November". Für Abwesenheiten im Profil und im
 * Zuteilen-Blatt.
 */
export function tageSpanne(von: string, bis: string, lang: string, format: DatumsFormat): string {
  const fmt = datumsFormat(lang, format)
  return von === bis ? fmt.format(fromIso(von)) : fmt.formatRange(fromIso(von), fromIso(bis))
}

/**
 * Eine Woche in Worten, Montag bis Sonntag: „7.–13. September" — aus `Intl`,
 * nicht aus dem Arbeitsheft (`Week.range`): für Wochen, deren Programm noch
 * nicht da ist (Gruppenbesuche, Trolleys, „Holen"). Stand bis Phase 10 von
 * T121 zweimal gleich da (`besuchsWocheText`, `wochenSpanne` der Trolleys).
 */
export function wochenSpanne(montag: string, lang: string): string {
  return datumsFormat(lang, 'tagMonat').formatRange(fromIso(montag), fromIso(tagNach(montag, 6)))
}

/**
 * Eine Anzahl Tage, Wochen oder Monate in Worten der Sprache: „1 Tag",
 * „7 Tage", „13 Wochen". Die Mehrzahl kennt `Intl` — ein „{n} Tage" in den
 * Übersetzungen kennte sie nicht.
 */
export function zeitspanne(n: number, einheit: 'day' | 'week' | 'month', lang: string): string {
  return new Intl.NumberFormat(LOCALES[lang as Lang] ?? lang, { style: 'unit', unit: einheit, unitDisplay: 'long' }).format(n)
}
