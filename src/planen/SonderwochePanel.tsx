import { useApp } from '../app/context'
import { abweichung, weichtAb } from '../data/helpers'
import { meetingOffset, meetingTime } from '../data/meeting-dates'
import type { MeetingKey } from '../data/types'
import { useT } from '../i18n/useT'
import { WOCHENTAGE, wochentagName } from './wochentage'

/**
 * Sonderwoche: diese Zusammenkunft weicht von der Regel ab (T30).
 *
 * Der Anlass kam vom Betreiber: mehrere Versammlungen teilen sich oft einen
 * Königreichssaal. Hat eine davon Dienstwoche, muss eine **andere** ihren Tag
 * verlegen. Eine Sonderwoche verschiebt also Tag und Uhrzeit; und es gibt
 * Gründe, die einen Ausfall rechtfertigen (Kongress).
 *
 * **Ohne einen einzigen neuen Wörterbuch-Schlüssel gebaut.** Das ist kein
 * Selbstzweck: ein neuer Schlüssel hieße 33 erfundene Übersetzungen, und eine
 * erfundene ist schlimmer als eine zusammengesetzte aus geprüften Bausteinen
 * (dieselbe Regel wie beim Treffpunkt-Konfliktbanner und beim leeren
 * Gruppen-Sheet). Verwendet werden:
 *
 * | Element | Woher |
 * | --- | --- |
 * | Name der Zusammenkunft | `tabMid` / `tabWe` |
 * | Wochentage | `Intl` über `LOCALES` — wie im Treffpunkt-Banner |
 * | „Wochentag" / „Uhrzeit" | `a11yWeekday` / `a11yTime` |
 * | „Grund (optional)" | `grundOpt` |
 *
 * Für „entfällt" gibt es **kein** gemessenes Wort. Deshalb ist der Schalter
 * positiv formuliert und trägt den Namen der Zusammenkunft: ausgeschaltet neben
 * „Zusammenkunft am Wochenende" liest sich unmissverständlich, und
 * Screenreader sagen es genauso an („Schalter, nicht aktiviert").
 *
 * Der Grund bleibt unübersetzt — es sind die Worte des Planers, wie ein Name
 * oder ein Vortragsthema.
 */
export function SonderwochePanel({ tab }: { tab: MeetingKey }) {
  const { state, dispatch } = useApp()
  const { t } = useT()
  const week = state.weeks[state.week]
  if (!week) return null

  const abw = abweichung(week, tab)
  const findetStatt = abw?.cancelled !== true
  const name = tab === 'we' ? t.tabWe : t.tabMid

  // Der gerade geltende Termin — aus Abweichung, eigenem Termin oder
  // Einstellungen. Er ist zugleich die Vorbelegung: wählt der Planer denselben
  // Tag noch einmal, ist das keine Verlegung und die Abweichung fällt weg.
  const versatz = meetingOffset(week, tab, state.congregation.meetings)
  const zeit = meetingTime(week, tab, state.congregation.meetings)
  const regulaererVersatz = meetingOffset(
    { ...week, dev: undefined },
    tab,
    state.congregation.meetings,
  )
  const regulaereZeit = meetingTime({ ...week, dev: undefined }, tab, state.congregation.meetings)

  const setzen = (patch: Partial<NonNullable<typeof abw>>) =>
    dispatch({ type: 'setAbweichung', tab, patch })

  return (
    <div className={`sonder${weichtAb(week, tab) ? ' is-abweichend' : ''}`}>
      <div className="sonder-row">
        <span className="sonder-name">{name}</span>
        <button
          type="button"
          role="switch"
          aria-checked={findetStatt}
          aria-label={name}
          className={findetStatt ? 'switch is-on' : 'switch'}
          onClick={() => setzen({ cancelled: findetStatt ? true : undefined })}
        >
          <span className="switch-knob" />
        </button>
      </div>

      {findetStatt && (
        <div className="sonder-row sonder-row--termin">
          <label className="sonder-feld">
            <span className="sonder-label">{t.a11yWeekday}</span>
            <select
              className="sonder-select"
              value={versatz}
              onChange={(e) => {
                const gewaehlt = Number(e.target.value)
                setzen({
                  // Der reguläre Tag ist keine Verlegung — dann verschwindet sie.
                  day: gewaehlt === regulaererVersatz ? undefined : WOCHENTAGE[gewaehlt],
                })
              }}
            >
              {WOCHENTAGE.map((tag, i) => (
                <option key={tag} value={i}>
                  {wochentagName(i, state.lang)}
                </option>
              ))}
            </select>
          </label>
          <label className="sonder-feld">
            <span className="sonder-label">{t.a11yTime}</span>
            <input
              type="time"
              className="sonder-time"
              value={zeit}
              onChange={(e) =>
                setzen({ time: e.target.value === regulaereZeit ? undefined : e.target.value })
              }
            />
          </label>
        </div>
      )}

      <label className="sonder-feld sonder-feld--grund">
        <span className="sonder-label">{t.grundOpt}</span>
        <input
          type="text"
          className="sonder-grund"
          dir="auto"
          value={abw?.reason ?? ''}
          onChange={(e) => setzen({ reason: e.target.value })}
        />
      </label>

    </div>
  )
}

