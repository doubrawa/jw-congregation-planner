import type { Lang } from '../data/types'
import { LOCALES } from '../i18n/langs'

/**
 * **Namen als ein Satz** — „Anna Test, Carl Test und Dora Test", die
 * Verbindung aus `Intl` in der Sprache des Lesers („、" im Japanischen, „و" im
 * Arabischen). Kennt `Intl` die Sprache nicht, stehen sie mit Komma da.
 *
 * Für die Zugesagten einer Woche und für „Wer plant" in den Einstellungen.
 */
export function namenSatz(namen: readonly string[], lang: Lang): string {
  try {
    return new Intl.ListFormat(LOCALES[lang] ?? lang, { type: 'conjunction', style: 'long' }).format(namen)
  } catch {
    return namen.join(', ')
  }
}
