import { useApp } from '../app/context'
import { type Dict } from '../i18n/ui'
import { fill, useT } from '../i18n/useT'

/** Erinnerungen: erste/letzte Erinnerung (Tage vorher) + tägliche Wiederholung. */
export function RemindersPanel() {
  const { state, dispatch } = useApp()
  const { t } = useT()

  const reminderSub = (n: number): string => {
    if (n === 0) return t.remAmTag
    return n === 1 ? t.remTagVorher : fill(t.remTageVorher, { n })
  }

  /*
   * Hier stand der Schalter „Bei Zuteilung · Sofort" (T74). Er steuerte eine
   * Mitteilung, die an die **Planer** ging — nicht an die eingeteilte Person
   * (das war schon damals gemessen und vertagt). Mit T99 hat der Planer statt
   * dessen den Knopf „Plan senden" im Planen-Screen, und die Nachricht geht an
   * den, den sie angeht. Damit steuerte der Schalter nichts mehr.
   */

  const reminderRows: Array<{ key: 'first' | 'last'; name: keyof Dict }> = [
    { key: 'first', name: 'remErste' },
    { key: 'last', name: 'remLetzte' },
  ]

  return (
    <div className="panel panel--pb14" data-farbe="wein">
      <h2 className="panel-label">{t.erinnerungenCard}</h2>
      <p className="panel-hint">{t.remDesc}</p>
      {/* Alle Zeilen der Karte haben dieselbe Form (`svc-row`: Schnitt,
          Abstände, Haarlinie) — es sind Punkte einer Liste, und einer davon
          soll nicht als eigene Sorte dastehen. Die letzte trägt zusätzlich
          `--schluss` und damit keinen Trenner. */}
      {reminderRows.map(({ key, name }) => (
        <div key={key} className="svc-row">
          <div>
            <div className="svc-name">{t[name]}</div>
            <div className="svc-sub">{reminderSub(state.reminders[key])}</div>
          </div>
          <div className="svc-controls">
            <button
              type="button"
              className="stepper-btn"
              aria-label={t.a11yDecrease}
              onClick={() => dispatch({ type: 'changeReminder', key, delta: -1 })}
            >
              –
            </button>
            <span className="svc-count">{state.reminders[key]}</span>
            <button
              type="button"
              className="stepper-btn"
              aria-label={t.a11yIncrease}
              onClick={() => dispatch({ type: 'changeReminder', key, delta: 1 })}
            >
              +
            </button>
          </div>
        </div>
      ))}
      <div className="svc-row svc-row--schluss">
        <span className="svc-name">{t.remRepeat}</span>
        <button
          type="button"
          role="switch"
          aria-checked={state.reminders.repeat}
          aria-label={t.remRepeat}
          className={state.reminders.repeat ? 'switch is-on' : 'switch'}
          onClick={() => dispatch({ type: 'toggleReminderRepeat' })}
        >
          <span className="switch-knob" />
        </button>
      </div>
    </div>
  )
}
