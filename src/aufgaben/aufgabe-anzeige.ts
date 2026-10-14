import { schluesselTeile } from '../../supabase/functions/_shared/aufgaben-schluessel.ts'
import { isoVonKalendertag } from '../data/meeting-dates'
import type { Lang, MyTask } from '../data/types'
import { LOCALES } from '../i18n/langs'
import { relativeDayLabel } from '../i18n/relative-time'
import { aufgabenTp, type I18n } from '../i18n/useT'

/**
 * Wie eine eigene Aufgabe dasteht (T121) — auf dem Start, unter „Meine
 * Aufgaben", im Blatt beim Öffnen und beim Absagen dieselben Zeilen.
 */

/**
 * Wann: der Abstand in Worten, dann der Termin — „Morgen · Di, 8. September ·
 * 19:00". Ohne Kalendertag (Vorlagen) nur der Termin.
 */
export function aufgabeWann(task: MyTask, lang: Lang, i18n: Pick<I18n, 'tp' | 'tu'>): string {
  const datum = aufgabenTp(task, i18n)(task.date)
  const abstand = relativeDayLabel(task.at, lang)
  if (!abstand) return datum
  // „morgen" steht hier am Satzanfang. Wo eine Schrift keine Großbuchstaben
  // kennt, ändert das nichts.
  const gross = abstand.charAt(0).toLocaleUpperCase(LOCALES[lang]) + abstand.slice(1)
  return `${gross} · ${datum}`
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
