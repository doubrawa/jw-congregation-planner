import { fill, useT } from '../i18n/useT'
import type { MeetingTab, Week } from '../data/types'
import './components.css'

/**
 * Chips unter der Wochen-Navigation: aktuelle Woche, Besuch des
 * Kreisaufsehers, Gedächtnismahl. Im Programm wird auch „AKTUELLE WOCHE“
 * gezeigt, im Planen nur die Sonderwochen-Chips.
 */
export function WeekChips({ week, showCurrent }: { week: Week; showCurrent: boolean }) {
  const { t } = useT()
  const chips: Array<{ key: string; label: string; cls: string }> = []
  if (showCurrent && week.current)
    chips.push({ key: 'cur', label: t.aktuelleWoche, cls: 'week-chip--current' })
  if (week.co) chips.push({ key: 'co', label: t.coWoche, cls: 'week-chip--co' })
  if (week.mem) chips.push({ key: 'mem', label: t.memWoche, cls: 'week-chip--mem' })
  if (chips.length === 0) return null
  return (
    <div className="week-chips">
      {chips.map((c) => (
        <span key={c.key} className={`week-chip ${c.cls}`}>
          {c.label}
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
