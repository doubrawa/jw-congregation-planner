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

  const reminderRows: Array<{ key: 'first' | 'last'; name: keyof Dict }> = [
    { key: 'first', name: 'remErste' },
    { key: 'last', name: 'remLetzte' },
  ]

  return (
    <div className="panel panel--pb14" data-farbe="wein">
      <div className="panel-label">{t.erinnerungenCard}</div>
      <p className="panel-hint">{t.remDesc}</p>
      <div className="kv-row">
        <span className="kv-key">{t.remBeiZut}</span>
        <span className="kv-val">{t.remSofort}</span>
      </div>
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
              aria-label="–"
              onClick={() => dispatch({ type: 'changeReminder', key, delta: -1 })}
            >
              –
            </button>
            <span className="svc-count">{state.reminders[key]}</span>
            <button
              type="button"
              className="stepper-btn"
              aria-label="+"
              onClick={() => dispatch({ type: 'changeReminder', key, delta: 1 })}
            >
              +
            </button>
          </div>
        </div>
      ))}
      <div className="rem-toggle-row">
        <span className="rem-toggle-label">{t.remRepeat}</span>
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
