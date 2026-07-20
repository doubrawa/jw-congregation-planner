/**
 * Warn-Banner im Planen: Konflikte (Abwesenheit, Doppelbelegung, Serien) und
 * offene Slots der ganzen Woche (beide Zusammenkünfte). Reine Ableitung aus dem
 * State — kein eigener Zustand.
 */

import { useApp } from '../app/context'
import { openSlotLabels, weekConflicts, type Conflict } from '../data/planning'
import type { MeetingTab } from '../data/types'
import type { Dict } from '../i18n/ui'
import { fill, useT } from '../i18n/useT'

/** "Wochenende"/"unter der Woche" für die Banner-Zeilen. */
function tabName(t: Dict, tab: MeetingTab | undefined): string {
  return tab === 'we' ? t.tabWe : t.tabMid
}

/** Serien-Konflikte (streak) auf so viele Zeilen begrenzen; Rest → „+N weitere". */
const STREAK_SHOWN = 2

/** Konflikt-Banner der ganzen Woche (Abwesende, Doppelbelegung, Serien). */
export function ConflictsBanner() {
  const { state } = useApp()
  const { t } = useT()
  const conflicts = weekConflicts(state.weeks, state.week, state.persons, state.services)
  if (conflicts.length === 0) return null

  const shownConflicts = [
    ...conflicts.filter((c) => c.kind === 'absent'),
    ...conflicts.filter((c) => c.kind === 'double'),
    ...conflicts.filter((c) => c.kind === 'streak').slice(0, STREAK_SHOWN),
    ...conflicts.filter((c) => c.kind === 'helperTask'),
  ]
  const hiddenConflicts = conflicts.length - shownConflicts.length

  const conflictText = (c: Conflict): string => {
    if (c.kind === 'absent') return fill(t.konfliktAbsent, { name: c.name, tab: tabName(t, c.tab) })
    if (c.kind === 'double')
      return fill(t.konfliktDouble, { name: c.name, n: c.count ?? 2, tab: tabName(t, c.tab) })
    if (c.kind === 'helperTask')
      return fill(t.konfliktHelperTask, { name: c.name, tab: tabName(t, c.tab) })
    return fill(t.konfliktStreak, { name: c.name, n: c.count ?? 3 })
  }

  return (
    <div className="plan-conflicts">
      <div className="plan-banner-head">
        <span className="plan-banner-badge">!</span>
        <span className="plan-banner-title">{t.konflikteTitle}</span>
        <span className="plan-banner-count">{conflicts.length}</span>
      </div>
      {shownConflicts.map((c, i) => (
        <div key={i} className="plan-conflict-row">
          <span className="plan-conflict-dot" data-kind={c.kind} />
          <span className="plan-conflict-text">{conflictText(c)}</span>
        </div>
      ))}
      {hiddenConflicts > 0 && (
        <div className="plan-conflict-more">{fill(t.konfMehr, { n: hiddenConflicts })}</div>
      )}
    </div>
  )
}

/**
 * Banner der offenen (unbesetzten) Aufgaben/Hilfsdienste beider Zusammenkünfte.
 * `tpw` übersetzt Programmpunkt-Titel in die Anzeigesprache der Woche.
 */
export function OpenSlotsBanner({ tpw }: { tpw: (s: string) => string }) {
  const { state } = useApp()
  const { t, tu } = useT()
  const rawWeek = state.weeks[state.week]
  if (!rawWeek) return null

  const openSlots = (['mid', 'we'] as const).flatMap((tab) =>
    openSlotLabels(rawWeek[tab], state.services).map((slot) => ({ ...slot, tab })),
  )
  const openTotal = openSlots.reduce((sum, slot) => sum + slot.n, 0)
  if (openTotal === 0) return null

  return (
    <div className="plan-open">
      <div className="plan-banner-head">
        <span className="plan-banner-badge">?</span>
        <span className="plan-banner-title">{t.offeneTitle}</span>
        <span className="plan-banner-count">{openTotal}</span>
      </div>
      {openSlots.map((slot, i) => (
        <div key={i} className="plan-open-row">
          <span className="plan-open-prefix">{tabName(t, slot.tab)}:</span>
          <span className="plan-open-label" dir="auto">
            {slot.lang === 'u' ? tu(slot.text) : tpw(slot.text)}
            {slot.n > 1 ? ` ×${slot.n}` : ''}
          </span>
        </div>
      ))}
    </div>
  )
}
