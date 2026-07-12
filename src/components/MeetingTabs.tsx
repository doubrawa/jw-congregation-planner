import type { MeetingTab } from '../data/types'
import './components.css'

const TABS: ReadonlyArray<[MeetingTab, string]> = [
  ['mid', 'Unter der Woche'],
  ['we', 'Wochenende'],
]

interface MeetingTabsProps {
  tab: MeetingTab
  onChange: (tab: MeetingTab) => void
  className?: string
}

/** Textreiter „Unter der Woche“ / „Wochenende“ — Programm und Planen. */
export function MeetingTabs({ tab, onChange, className }: MeetingTabsProps) {
  return (
    <div className={className ? `meeting-tabs ${className}` : 'meeting-tabs'}>
      {TABS.map(([key, label]) => (
        <button
          key={key}
          type="button"
          className={tab === key ? 'meeting-tab is-active' : 'meeting-tab'}
          aria-pressed={tab === key}
          onClick={() => onChange(key)}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
