import { useApp } from '../app/context'
import { meetingDayOffsets } from '../data/meeting-dates'
import { LOCALES } from '../i18n/langs'
import { fill, useT } from '../i18n/useT'
import type { MeetingTab } from '../data/types'
import './components.css'

interface MeetingTabsProps {
  tab: MeetingTab
  onChange: (tab: MeetingTab) => void
  className?: string
  showFs?: boolean // dritter Reiter „Predigtdienst“
}

/** Wochentagsname (App-Sprache) für einen Versatz 0..6 (Montag..Sonntag). */
function weekdayName(offset: number, locale: string): string {
  const monday = Date.UTC(2024, 0, 1) // 1. Jan 2024 = Montag
  return new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' }).format(
    new Date(monday + offset * 864e5),
  )
}

/**
 * Reiter „Versammlung <Wochentag>“ (unter der Woche / Wochenende, Wochentag aus
 * den Zusammenkunftszeiten der Versammlung) und optional „Predigtdienst“. Als
 * gefüllte Pillen gestaltet; passt nicht alles in eine Zeile, wird gescrollt.
 */
export function MeetingTabs({ tab, onChange, className, showFs = false }: MeetingTabsProps) {
  const { state } = useApp()
  const { t } = useT()
  const offsets = meetingDayOffsets(state.congregation.meetings)
  const locale = LOCALES[state.lang]
  const day = (offset: number) => fill(t.versammlungTag, { tag: weekdayName(offset, locale) })
  const tabs: ReadonlyArray<[MeetingTab, string]> = [
    ['mid', day(offsets.mid)],
    ['we', day(offsets.we)],
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
