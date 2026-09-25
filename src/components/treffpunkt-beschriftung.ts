import { fsTag } from '../data/fs'
import type { FsInstance, Group } from '../data/types'
import { LOCALES } from '../i18n/langs'
import type { I18n } from '../i18n/useT'
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
  return tag
    ? tag.toLocaleDateString(LOCALES[lang as keyof typeof LOCALES], { weekday: 'long', day: 'numeric', month: 'long' })
    : wochentagNameAusWd(wd, lang)
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
