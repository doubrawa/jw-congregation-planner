import { useT } from '../i18n/useT'
import type { MeetingTab } from '../data/types'
import './components.css'

interface MeetingTabsProps {
  tab: MeetingTab
  onChange: (tab: MeetingTab) => void
  className?: string
}

/** Textreiter „Unter der Woche“ / „Wochenende“ — Programm und Planen. */
export function MeetingTabs({ tab, onChange, className }: MeetingTabsProps) {
  const { t } = useT()
  const tabs: ReadonlyArray<[MeetingTab, string]> = [
    ['mid', t.tabMid],
    ['we', t.tabWe],
  ]
  return (
    <div className={className ? `meeting-tabs ${className}` : 'meeting-tabs'}>
      {tabs.map(([key, label]) => (
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
