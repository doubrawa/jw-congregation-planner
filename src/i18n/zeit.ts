/**
 * Relative Zeitangaben („vor 5 Minuten", „gestern") in der Sprache des Lesers.
 *
 * **Warum das hier steht und nicht mehr in `lib/data.ts`:** Dort wurde beim
 * Laden aus dem Zeitstempel ein **deutscher Satz** gebaut und als
 * `Notification.time` gespeichert. Übersetzt werden konnte er danach nur noch
 * über das Fragment-Wörterbuch — also über eine feste Liste von Zeichenketten.
 * Am 13. August 2026 nachgemessen, was davon in 33 Sprachen ankam:
 *
 * | erzeugt | übersetzt |
 * | --- | --- |
 * | `gerade eben` | ja |
 * | `vor 2 Std.` | ja |
 * | `vor 3 Std.`, `vor 5 Min.`, `gestern`, `vor 2 Tagen` | **nein** |
 *
 * Ausgerechnet `vor 2 Std.` stand im Wörterbuch — weil genau diese Zeichenkette
 * in den **Testdaten** vorkam. Die Wörterbücher waren aus den eigenen Vorgaben
 * gefüllt worden statt aus dem, was der Code erzeugt. Jede andere Stundenzahl
 * blieb deutsch, in allen 33 Sprachen, ohne dass etwas abstürzte.
 *
 * Eine Liste von Sätzen kann das gar nicht lösen: „vor N Stunden" ist keine
 * Zeichenkette, sondern eine Form mit Zahl — und die Regeln dafür (Plural,
 * Stellung, „gestern" statt „vor 1 Tag") stehen je Sprache fest.
 * `Intl.RelativeTimeFormat` kennt sie aus den Daten der Laufzeitumgebung. Damit
 * ist hier **nichts zu erfinden und nichts zu messen** — und es gibt keine
 * Zeichenkette mehr, die man vergessen könnte.
 */

import { LOCALES } from './langs'
import type { Lang } from '../data/types'

/**
 * `numeric: 'auto'` ist die ganze Absicht: Es liefert „gestern" statt „vor
 * 1 Tag" und „jetzt" statt „vor 0 Sekunden" — dieselben Sonderformen, die der
 * abgelöste deutsche Code von Hand geschrieben hatte, nur eben in jeder
 * Sprache.
 */
const formatter = new Map<Lang, Intl.RelativeTimeFormat>()

function fuer(lang: Lang): Intl.RelativeTimeFormat {
  const vorhanden = formatter.get(lang)
  if (vorhanden) return vorhanden
  const neu = new Intl.RelativeTimeFormat(LOCALES[lang] ?? lang, { numeric: 'auto' })
  formatter.set(lang, neu)
  return neu
}

/**
 * Wie lange ist `iso` her, aus Sicht von `jetzt` (ms).
 *
 * Die Stufen sind die des abgelösten Codes: unter einer Minute „jetzt", dann
 * Minuten, ab einer Stunde Stunden, ab einem Tag Tage. Gerundet wird wie dort
 * auch — `Math.round`, nicht abgeschnitten: 90 Minuten sind „vor 2 Stunden"
 * und nicht „vor 1 Stunde".
 *
 * Ein unlesbarer Zeitstempel ergibt einen leeren Text. Er stünde sonst als
 * „Invalid Date" in der Glocke.
 */
export function relativeZeit(iso: string, lang: Lang, jetzt: number = Date.now()): string {
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) return ''
  const min = Math.round((jetzt - ms) / 60000)
  const rtf = fuer(lang)
  if (min < 1) return rtf.format(0, 'second')
  if (min < 60) return rtf.format(-min, 'minute')
  const std = Math.round(min / 60)
  if (std < 24) return rtf.format(-std, 'hour')
  return rtf.format(-Math.round(std / 24), 'day')
}
