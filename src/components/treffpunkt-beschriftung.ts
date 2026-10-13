import { fsTag } from '../data/fs'
import type { FsInstance, Group } from '../data/types'
import type { Dict } from '../i18n/ui'
import type { I18n } from '../i18n/useT'
import { datumsFormat } from './datum-anzeige'
import { wochentagNameAusWd } from '../planen/wochentage'

/**
 * Beschriftungen eines Treffpunkts — für das Programm und das Planen dieselben.
 *
 * Beide Bildschirme zeigen dieselben Treffpunkte, nur der eine zum Lesen und
 * der andere zum Bearbeiten. Tag und Titel standen in jedem für sich
 * ausgeschrieben; eine Änderung am Datumsformat hätte einen davon übersehen.
 */

/**
 * Der Tag eines Treffpunkts in der Sprache des Lesers („Samstag, 12. September").
 *
 * Ohne brauchbare Wochen-Kennung (Vorlagen, Demo) bleibt der Wochentag stehen —
 * ein erfundenes Datum wäre schlimmer als ein fehlendes.
 */
export function treffpunktTagLabel(kennung: string, wd: number, lang: string): string {
  const tag = fsTag(kennung, wd)
  return tag ? datumsFormat(lang, 'tag').format(tag) : wochentagNameAusWd(wd, lang)
}

/** Versammlungstreffpunkt oder der Name seiner Gruppe (übersetzt). */
export function treffpunktTitel(
  inst: Pick<FsInstance, 'grp'>,
  groups: readonly Group[],
  i18n: Pick<I18n, 't' | 'tu'>,
): string {
  if (inst.grp == null) return i18n.t.fsVers
  const gruppe = groups.find((g) => g.id === inst.grp)
  return gruppe ? i18n.tu(gruppe.name) : inst.grp
}

/** Die Worte der Häufigkeiten einer Regel (`FsRule.monthly`): jede Woche, der n-te Wochentag im Monat. */
const HAEUFIGKEIT_WORT = ['fsFreqW', 'fsFreqM1', 'fsFreqM2', 'fsFreqM3', 'fsFreqM4'] as const

/** Die wählbaren Häufigkeiten, in dieser Reihenfolge. */
export const HAEUFIGKEITEN: readonly number[] = HAEUFIGKEIT_WORT.map((_wort, monthly) => monthly)

/** Wie oft eine Regel des Grundplans gilt, in Worten („Jede Woche", „Jeden 2. im Monat"). */
export function treffpunktHaeufigkeit(monthly: number, t: Pick<Dict, (typeof HAEUFIGKEIT_WORT)[number]>): string {
  return t[HAEUFIGKEIT_WORT[monthly] ?? 'fsFreqW']
}
