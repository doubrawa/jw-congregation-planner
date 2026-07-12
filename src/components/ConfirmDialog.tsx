import { useApp } from '../app/context'
import './overlays.css'

/**
 * Bestätigungs-Dialog beim Öffnen der App: listet alle noch offenen
 * Zuteilungen des Nutzers. Kein Backdrop-Schließen, kein ✕ — der Dialog
 * verschwindet erst, wenn keine offene Aufgabe mehr übrig ist. Je Aufgabe
 * „Bestätigen“ oder „Ich bin verhindert“ (meldet an den Koordinator).
 */
export function ConfirmDialog() {
  const { state, dispatch } = useApp()
  const openTasks = state.myTasks.filter((t) => t.status === 'offen')

  return (
    <>
      <div className="confirm-backdrop" />
      <div className="confirm-modal" role="dialog" aria-modal="true" aria-label="Zuteilungen bestätigen">
        <div className="confirm-eyebrow">ERINNERUNG</div>
        <h2 className="confirm-title">Bitte bestätige deine Zuteilungen</h2>
        <p className="confirm-intro">
          Du hast Zuteilungen, die noch nicht bestätigt sind. Bitte bestätige sie, damit sich der
          Koordinator darauf verlassen kann.
        </p>
        {openTasks.map((task) => (
          <div key={task.id} className="confirm-task">
            <div className="confirm-task-title">{task.title}</div>
            <div className="confirm-task-date">{task.date}</div>
            <div className="confirm-actions">
              <button
                type="button"
                className="confirm-yes"
                onClick={() => dispatch({ type: 'confirmTask', id: task.id })}
              >
                ✓ Bestätigen
              </button>
              <button
                type="button"
                className="confirm-no"
                onClick={() => dispatch({ type: 'declineTask', id: task.id })}
              >
                Ich bin verhindert
              </button>
            </div>
          </div>
        ))}
        <p className="confirm-foot">
          Ohne Bestätigung wirst du beim nächsten Öffnen erneut erinnert.
        </p>
      </div>
    </>
  )
}
