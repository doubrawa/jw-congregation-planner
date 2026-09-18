import { useApp } from '../app/context'
import { useT } from '../i18n/useT'
import { versatzAbMontag, wdAusVersatz } from '../data/meeting-dates'
import type { MeetingKey, MeetingTime } from '../data/types'
import { VERSAETZE, wochentagName } from '../planen/wochentage'
import { timeOptions } from './meeting-times'
import { Switch } from '../components/Switch'

/** Versammlung: Name, Saal und die beiden Zusammenkunfts-Zeiten (Tag + Uhrzeit). */
export function CongregationPanel() {
  const { state, dispatch } = useApp()
  const { t } = useT()

  const congFields: Array<['name' | 'hall', string]> = [
    ['name', t.nameLbl],
    ['hall', t.saal],
  ]

  const zeiten = state.congregation.times
  const setMeetingTime = (tab: MeetingKey, patch: Partial<MeetingTime>) => {
    dispatch({
      type: 'updateCongregation',
      patch: { times: { ...zeiten, [tab]: { ...zeiten[tab], ...patch } } },
    })
  }

  return (
    <div className="panel panel--lead panel--pb16" data-farbe="neutral">
      <h2 className="panel-label">{t.versammlungCard}</h2>
      {congFields.map(([key, label]) => (
        <div key={key} className="cong-field">
          <label className="field-label" htmlFor={`cong-${key}`}>
            {label}
          </label>
          {/*
            Name und Anschrift des Königreichssaals gehören der Versammlung,
            nicht der App — sie stehen in ihrer eigenen Schrift und Richtung
            (`dir="auto"`, wie die Personenfelder und die Freitexte des
            Planers). Eine Hausnummer in einer arabischen Oberfläche liefe sonst
            an die falsche Seite der Straße.
          */}
          <input
            id={`cong-${key}`}
            className="field-input"
            type="text"
            dir="auto"
            value={state.congregation[key]}
            onChange={(e) => dispatch({ type: 'updateCongregation', patch: { [key]: e.target.value } })}
          />
        </div>
      ))}
      {([
        ['mid', t.tabMid, zeiten.mid],
        ['we', t.tabWe, zeiten.we],
      ] as const).map(([which, label, mt]) => (
        <div key={which} className="cong-field">
          <span className="field-label">{label}</span>
          <div className="cong-time-row">
            <select
              className="mem-select cong-day"
              aria-label={label}
              value={versatzAbMontag(mt.wd)}
              onChange={(e) => setMeetingTime(which, { wd: wdAusVersatz(Number(e.target.value)) })}
            >
              {VERSAETZE.map((i) => (
                <option key={i} value={i}>
                  {wochentagName(i, state.lang)}
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
      {/*
        Zusätzliche Klasse (jw.org S-38, Absatz 26). Gehört zur Versammlung,
        nicht zum Gerät: bei vielen Verkündigern laufen die Schulungsaufgaben
        parallel in einem zweiten Raum, damit jeder öfter drankommt.
      */}
      <div className="rem-toggle-row">
        <span className="rem-toggle-label">{t.auxKlasse}</span>
        <Switch
          on={state.auxClass}
          label={t.auxKlasse}
          onToggle={() => dispatch({ type: 'setAuxClass', on: !state.auxClass })}
        />
      </div>
      <p className="panel-hint">{t.auxDesc}</p>
    </div>
  )
}
