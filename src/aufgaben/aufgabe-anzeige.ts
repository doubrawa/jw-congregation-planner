import { schluesselTeile } from '../../supabase/functions/_shared/aufgaben-schluessel.ts'
import { isoVonKalendertag } from '../data/meeting-dates'
import type { Lang, MyTask } from '../data/types'
import { LOCALES } from '../i18n/langs'
import { relativeDayLabel } from '../i18n/relative-time'

/**
 * Wie eine eigene Aufgabe dasteht (T121) — auf dem Start, unter „Meine
 * Aufgaben", im Blatt beim Öffnen und beim Absagen dieselben Zeilen.
 */

/**
 * Der Abstand in Worten, wie er vor einem Termin steht — „Morgen"; ohne
 * Kalendertag (Vorlagen) leer. Angezeigt wird er mit dem Termin zusammen
 * (`AufgabeWann`): jeder Teil in seiner Sprache.
 */
export function abstandVorn(at: number | null | undefined, lang: Lang, jetzt?: number): string {
  const abstand = relativeDayLabel(at, lang, jetzt)
  // „morgen" steht hier am Satzanfang. Wo eine Schrift keine Großbuchstaben
  // kennt, ändert das nichts.
  return abstand && abstand.charAt(0).toLocaleUpperCase(LOCALES[lang]) + abstand.slice(1)
}

/**
 * Abstand und Termin als eine Zeichenkette — „Morgen · <Termin>"; ohne
 * Kalendertag nur der Termin. Für den Film „Erste Schritte", der dieselbe
 * Zeile als Text zeigt; in der App setzt `AufgabeWann` die Teile einzeln.
 */
export function mitAbstand(termin: string, at: number | null | undefined, lang: Lang, jetzt?: number): string {
  const abstand = abstandVorn(at, lang, jetzt)
  return abstand ? `${abstand} · ${termin}` : termin
}

/**
 * Was nach einer Absage geschieht — davon hängt ab, was das Absage-Blatt
 * erzählt:
 *  - `hilfsdienst`: Es wird von selbst ein Ersatz gesucht (`substituteSeek`).
 *  - `programm`: Der Planer erfährt es und teilt neu zu — auch beim Treffpunkt.
 */
export type AbsageArt = 'hilfsdienst' | 'programm'

export function absageArt(taskId: string): AbsageArt {
  return schluesselTeile(taskId)?.art === 'helper' ? 'hilfsdienst' : 'programm'
}

/** Der Kalendertag einer Aufgabe als ISO-Datum — oder `null` ohne Termin (Vorlagen). */
export function aufgabeTag(task: MyTask): string | null {
  return task.at == null ? null : isoVonKalendertag(task.at)
}
