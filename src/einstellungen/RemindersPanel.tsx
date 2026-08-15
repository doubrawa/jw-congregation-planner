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

  /**
   * „Bei Zuteilung · Sofort" stand hier als fester Text neben lauter echten
   * Bedienelementen und sah dadurch aus wie ein vergessenes Feld (T74). Jetzt
   * ist es der Schalter, der es immer war — die Beschriftung aus denselben
   * beiden Bausteinen, also in allen 34 Sprachen und ohne neuen Schlüssel.
   */
  const beiZuteilung = `${t.remBeiZut} · ${t.remSofort}`

  const reminderRows: Array<{ key: 'first' | 'last'; name: keyof Dict }> = [
    { key: 'first', name: 'remErste' },
    { key: 'last', name: 'remLetzte' },
  ]

  return (
    <div className="panel panel--pb14" data-farbe="wein">
      <h2 className="panel-label">{t.erinnerungenCard}</h2>
      <p className="panel-hint">{t.remDesc}</p>
      {/* Alle vier Zeilen der Karte haben dieselbe Form (`svc-row`: Schnitt,
          Abstände, Haarlinie) — es sind Punkte einer Liste, und einer davon
          soll nicht als eigene Sorte dastehen. Die letzte trägt zusätzlich
          `--schluss` und damit keinen Trenner. */}
      <div className="svc-row">
        <span className="svc-name">{beiZuteilung}</span>
        <button
          type="button"
          role="switch"
          aria-checked={state.reminders.onAssign}
          aria-label={beiZuteilung}
          className={state.reminders.onAssign ? 'switch is-on' : 'switch'}
          onClick={() => dispatch({ type: 'toggleReminderOnAssign' })}
        >
          <span className="switch-knob" />
        </button>
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
