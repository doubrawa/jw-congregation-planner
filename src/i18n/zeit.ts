/**
 * Relative Zeitangaben („vor 5 Minuten", „gestern") in der Sprache des Lesers.
 *
 * „Vor N Stunden" ist keine Zeichenkette, sondern eine Form mit Zahl — und die
 * Regeln dafür (Plural, Stellung, „gestern" statt „vor 1 Tag") stehen je
 * Sprache fest. Eine Liste übersetzter Sätze verfehlt jede Zahl, die nicht
 * darin steht. `Intl.RelativeTimeFormat` kennt die Regeln aus den Daten der
 * Laufzeitumgebung: Hier ist **nichts zu erfinden und nichts zu messen**, und
 * es gibt keine Zeichenkette, die man vergessen könnte. Gebaut wird der Text
 * beim Anzeigen, in der Sprache des Lesers — nicht beim Laden.
 */

import { tageZwischen } from '../data/meeting-dates'
import { LOCALES } from './langs'
import { zahlBinden } from './zahl-binden'
import type { Lang } from '../data/types'

/**
 * `numeric: 'auto'` ist die ganze Absicht: Es liefert „gestern" statt „vor
 * 1 Tag" und „jetzt" statt „vor 0 Sekunden" — in jeder Sprache.
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
 * Die Stufen: unter einer Minute „jetzt", dann Minuten, ab einer Stunde
 * Stunden — gerundet, nicht abgeschnitten: 90 Minuten sind „vor 2 Stunden" und
 * nicht „vor 1 Stunde". **Ab einem Tag zählen die Kalendertage**
 * (`tageZwischen`, örtlich): „gestern" ist der Tag vor heute, nicht der Block
 * vor 24 Stunden. Samstagabend, gelesen am Montagmorgen, ist „vorgestern".
 *
 * Ein unlesbarer Zeitstempel ergibt einen leeren Text. Er stünde sonst als
 * „Invalid Date" in der Glocke. Zahl und Wort bleiben zusammen („vor 3 Tagen",
 * `zahlBinden`, T128) — die Glocke zeigt den Text, ohne dass `fill` ihn bindet.
 */
export function relativeZeit(iso: string, lang: Lang, jetzt: number = Date.now()): string {
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) return ''
  return zahlBinden(relativ(fuer(lang), ms, jetzt))
}

/** Die Stufe der Dauer: jetzt, Minuten, Stunden, Kalendertage. */
function relativ(rtf: Intl.RelativeTimeFormat, ms: number, jetzt: number): string {
  const min = Math.round((jetzt - ms) / 60000)
  if (min < 1) return rtf.format(0, 'second')
  if (min < 60) return rtf.format(-min, 'minute')
  const std = Math.round(min / 60)
  if (std < 24) return rtf.format(-std, 'hour')
  return rtf.format(-tageZwischen(new Date(ms), new Date(jetzt)), 'day')
}
