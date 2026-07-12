import { useApp } from '../app/context'
import { useT } from '../i18n/useT'
import './overlays.css'

/**
 * Bestätigungs-Dialog beim Öffnen der App: listet alle noch offenen
 * Zuteilungen des Nutzers. Kein Backdrop-Schließen, kein ✕ — der Dialog
 * verschwindet erst, wenn keine offene Aufgabe mehr übrig ist. Je Aufgabe
 * „Bestätigen“ oder „Ich bin verhindert“ (meldet an den Koordinator).
 */
export function ConfirmDialog() {
  const { state, dispatch } = useApp()
  const { t, tp } = useT()
  const openTasks = state.myTasks.filter((task) => task.status === 'offen')

  return (
    <>
      <div className="confirm-backdrop" />
      <div className="confirm-modal" role="dialog" aria-modal="true" aria-label={t.confirmTitle}>
        <div className="confirm-eyebrow">{t.erinnerungCap}</div>
        <h2 className="confirm-title">{t.confirmTitle}</h2>
        <p className="confirm-intro">{t.confirmIntro}</p>
        {openTasks.map((task) => (
          <div key={task.id} className="confirm-task">
            <div className="confirm-task-title">{tp(task.title)}</div>
            <div className="confirm-task-date">{tp(task.date)}</div>
            <div className="confirm-actions">
              <button
                type="button"
                className="confirm-yes"
                onClick={() => dispatch({ type: 'confirmTask', id: task.id })}
              >
                ✓ {t.bestaetigen}
              </button>
              <button
                type="button"
                className="confirm-no"
                onClick={() => dispatch({ type: 'declineTask', id: task.id })}
              >
                {t.verhindert}
              </button>
            </div>
          </div>
        ))}
        <p className="confirm-foot">{t.confirmRequired}</p>
      </div>
    </>
  )
}
