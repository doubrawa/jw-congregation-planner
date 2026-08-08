import { fill, useT } from '../i18n/useT'
import { abweichung, istAusgefallen, weichtAb } from '../data/helpers'
import type { MeetingKey, MeetingTab, Week } from '../data/types'
import './components.css'

/**
 * Chips unter der Wochen-Navigation: aktuelle Woche, Besuch des
 * Kreisaufsehers, Gedächtnismahl. Im Programm wird auch „AKTUELLE WOCHE“
 * gezeigt, im Planen nur die Sonderwochen-Chips.
 */
export function WeekChips({
  week,
  showCurrent,
  istAktuell = false,
}: {
  week: Week
  showCurrent: boolean
  /**
   * Ob dies die laufende Woche ist. Kommt von außen (currentWeekIndex), nicht
   * aus `week.current`: das Flag setzt nur der Demo-Datensatz und wird nie
   * nachgeführt — der Chip erschien in der Produktion deshalb nie.
   */
  istAktuell?: boolean
}) {
  const { t } = useT()
  const chips: Array<{ key: string; label: string; cls: string }> = []
  if (showCurrent && istAktuell)
    chips.push({ key: 'cur', label: t.aktuelleWoche, cls: 'week-chip--current' })
  if (week.co) chips.push({ key: 'co', label: t.coWoche, cls: 'week-chip--co' })
  if (week.mem) chips.push({ key: 'mem', label: t.memWoche, cls: 'week-chip--mem' })
  const abweichungen = abweichungsChips(week, t)
  if (chips.length === 0 && abweichungen.length === 0) return null
  return (
    <div className="week-chips">
      {chips.map((c) => (
        <span key={c.key} className={`week-chip ${c.cls}`}>
          {c.label}
        </span>
      ))}
      {abweichungen.map((c) => (
        <span key={`dev-${c.key}`} className="week-chip week-chip--dev">
          {c.aus ? <s>{c.label}</s> : c.label}
        </span>
      ))}
    </div>
  )
}

/**
 * Hinweis-Banner auf dem Tab der ausfallenden Zusammenkunft einer
 * Gedächtnismahl-Woche: statt des normalen Programms findet das
 * Gedächtnismahl statt (das Programm darunter zeigt bereits das Mahl).
 */
export function MemorialBanner({ week, tab }: { week: Week; tab: MeetingTab }) {
  const { t, tp } = useT()
  if (!week.mem || week.memCancel !== tab) return null
  const cancelled = week.memCancel === 'we' ? t.tabWe : t.tabMid
  const date = (week.memCancel === 'we' ? week.we : week.mid).date
  return (
    <div className="mem-banner">
      {fill(t.memAusfall, { m: cancelled })}
      <div className="mem-banner-date">{tp(date)}</div>
    </div>
  )
}

/**
 * Hinweis, dass diese Zusammenkunft in dieser Woche **nicht stattfindet** (T30).
 *
 * Der Text ist der Grund, den der Planer selbst eingetragen hat — seine Worte,
 * in seiner Sprache, wie ein Name oder ein Vortragsthema. Für „entfällt" gibt
 * es kein gemessenes Wort; ein erfundenes in 33 Sprachen wäre schlechter als
 * gar keines. Der Name der Zusammenkunft steht durchgestrichen davor, und das
 * ist unmissverständlich — auch ohne Satz.
 *
 * Ohne Grund bleibt der durchgestrichene Name allein stehen. Das ist selten:
 * wer eine Zusammenkunft absagt, schreibt üblicherweise dazu, warum.
 */
export function AusfallBanner({ week, tab }: { week: Week | undefined; tab: MeetingKey }) {
  const { t } = useT()
  if (!week || !istAusgefallen(week, tab)) return null
  const name = tab === 'we' ? t.tabWe : t.tabMid
  const grund = abweichung(week, tab)?.reason ?? ''
  return (
    <div className="ausfall-banner" role="status">
      <s className="ausfall-name">{name}</s>
      {grund && (
        <div className="ausfall-grund" dir="auto">
          {grund}
        </div>
      )}
    </div>
  )
}

/**
 * Chip für eine Woche, in der eine Zusammenkunft von der Regel abweicht.
 *
 * Beschriftet mit dem Namen der betroffenen Zusammenkunft — ausgefallene
 * durchgestrichen. Damit sieht der Planer schon in der Wochen-Navigation, dass
 * hier etwas anders ist, ohne den Tab zu wechseln.
 */
function abweichungsChips(week: Week, t: ReturnType<typeof useT>['t']): Array<{ key: string; label: string; aus: boolean }> {
  const out: Array<{ key: string; label: string; aus: boolean }> = []
  for (const tab of ['mid', 'we'] as const) {
    if (!weichtAb(week, tab)) continue
    out.push({ key: tab, label: tab === 'we' ? t.tabWe : t.tabMid, aus: istAusgefallen(week, tab) })
  }
  return out
}
