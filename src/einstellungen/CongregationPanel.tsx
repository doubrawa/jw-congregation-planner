import { useMemo } from 'react'
import { useApp } from '../app/context'
import { LOCALES } from '../i18n/langs'
import { useT } from '../i18n/useT'
import { DAY_KEYS, parseMeetingTimes, timeOptions, type MeetingTime } from './meeting-times'

/** Versammlung: Name, Saal und die beiden Zusammenkunfts-Zeiten (Tag + Uhrzeit). */
export function CongregationPanel() {
  const { state, dispatch } = useApp()
  const { t } = useT()

  const congFields: Array<['name' | 'hall', string]> = [
    ['name', t.nameLbl],
    ['hall', t.saal],
  ]

  const [midTime, weTime] = parseMeetingTimes(state.congregation.meetings)
  // Lokalisierte Wochentagsnamen (Mo..So) — 1.1.2024 war ein Montag
  const dayNames = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(LOCALES[state.lang], { weekday: 'long' })
    return DAY_KEYS.map((_, i) => fmt.format(new Date(Date.UTC(2024, 0, 1 + i))))
  }, [state.lang])
  const setMeetingTime = (which: 0 | 1, patch: Partial<MeetingTime>) => {
    const next: [MeetingTime, MeetingTime] = [midTime, weTime]
    next[which] = { ...next[which], ...patch }
    dispatch({
      type: 'updateCongregation',
      patch: { meetings: `${next[0].day} ${next[0].time} · ${next[1].day} ${next[1].time}` },
    })
  }

  return (
    <div className="panel panel--lead panel--pb16" data-farbe="neutral">
      <div className="panel-label">{t.versammlungCard}</div>
      {congFields.map(([key, label]) => (
        <div key={key} className="cong-field">
          <label className="field-label" htmlFor={`cong-${key}`}>
            {label}
          </label>
          <input
            id={`cong-${key}`}
            className="field-input"
            type="text"
            value={state.congregation[key]}
            onChange={(e) => dispatch({ type: 'updateCongregation', patch: { [key]: e.target.value } })}
          />
        </div>
      ))}
      {([
        [0, t.tabMid, midTime],
        [1, t.tabWe, weTime],
      ] as const).map(([which, label, mt]) => (
        <div key={which} className="cong-field">
          <span className="field-label">{label}</span>
          <div className="cong-time-row">
            <select
              className="mem-select cong-day"
              aria-label={label}
              value={mt.day}
              onChange={(e) => setMeetingTime(which, { day: e.target.value })}
            >
              {DAY_KEYS.map((key, i) => (
                <option key={key} value={key}>
                  {dayNames[i]}
                </option>
              ))}
            </select>
            <select
              className="mem-select cong-time"
              aria-label={label}
              value={mt.time}
              onChange={(e) => setMeetingTime(which, { time: e.target.value })}
            >
              {timeOptions(mt.time).map((time) => (
                <option key={time} value={time}>
                  {time}
                </option>
              ))}
            </select>
          </div>
        </div>
      ))}
    </div>
  )
}
