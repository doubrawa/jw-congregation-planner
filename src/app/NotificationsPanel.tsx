import { useEffect } from 'react'
import { useApp } from './context'

/** Mitteilungen-Overlay (Kopf-Chip öffnet); Backdrop-Klick oder Escape schließt. */
export function NotificationsPanel() {
  const { state, dispatch } = useApp()

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dispatch({ type: 'closeNotifs' })
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [dispatch])

  return (
    <>
      <div className="notif-backdrop" onClick={() => dispatch({ type: 'closeNotifs' })} />
      <div className="notif-panel" role="dialog" aria-modal="true" aria-label="Mitteilungen">
        <div className="notif-head">
          <h2 className="notif-title">Mitteilungen</h2>
          <button
            type="button"
            className="notif-mark-read"
            onClick={() => dispatch({ type: 'markAllRead' })}
          >
            Alle gelesen
          </button>
        </div>
        {state.notifs.map((notif) => (
          <div key={notif.id} className={notif.read ? 'notif-row' : 'notif-row is-unread'}>
            <span className="notif-dot" />
            <div>
              <div className="notif-row-title">{notif.title}</div>
              <div className="notif-row-text">{notif.text}</div>
              <div className="notif-row-time">{notif.time}</div>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
