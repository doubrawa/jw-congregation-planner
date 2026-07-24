import { useT } from '../i18n/useT'
import type { MeetingTab } from '../data/types'
import './components.css'

interface MeetingTabsProps {
  tab: MeetingTab
  onChange: (tab: MeetingTab) => void
  className?: string
  showFs?: boolean // dritter Tab „Zusammenkünfte für den Predigtdienst“
}

/**
 * Textreiter „Zusammenkunft unter der Woche / am Wochenende“ (Programm und
 * Planen), optional zusätzlich „Zusammenkünfte für den Predigtdienst“.
 */
export function MeetingTabs({ tab, onChange, className, showFs = false }: MeetingTabsProps) {
  const { t } = useT()
  const tabs: ReadonlyArray<[MeetingTab, string]> = [
    ['mid', t.tabMid],
    ['we', t.tabWe],
    ...(showFs ? ([['fs', t.tabFs]] as ReadonlyArray<[MeetingTab, string]>) : []),
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
