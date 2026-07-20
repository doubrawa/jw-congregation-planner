import { useEffect } from 'react'
import { NOTIF_TITLE_KEY } from '../i18n/ui'
import { useT } from '../i18n/useT'
import { useApp } from './context'

/** Mitteilungen-Overlay (Kopf-Chip öffnet); Backdrop-Klick oder Escape schließt. */
export function NotificationsPanel() {
  const { state, dispatch } = useApp()
  const { t, tu } = useT()

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
          <h2 className="notif-title">{t.mitteilungen}</h2>
          <div className="notif-actions">
            <button
              type="button"
              className="notif-mark-read"
              onClick={() => dispatch({ type: 'markAllRead' })}
            >
              {t.alleGelesen}
            </button>
            {state.notifs.length > 0 && (
              <button
                type="button"
                className="notif-clear"
                onClick={() => dispatch({ type: 'clearNotifs' })}
              >
                {t.alleLoeschen}
              </button>
            )}
          </div>
        </div>
        {state.notifs.map((notif) => {
          const canConfirm =
            !!notif.taskId &&
            state.myTasks.some((task) => task.id === notif.taskId && task.status === 'offen')
          const titleKey = NOTIF_TITLE_KEY[notif.title]
          return (
            <div key={notif.id} className={notif.read ? 'notif-row' : 'notif-row is-unread'}>
              <span className="notif-dot" />
              <div>
                <div className="notif-row-title">{titleKey ? t[titleKey] : notif.title}</div>
                <div className="notif-row-text">{tu(notif.text)}</div>
                <div className="notif-row-time">{tu(notif.time)}</div>
                {canConfirm && (
                  <button
                    type="button"
                    className="notif-confirm"
                    onClick={() => notif.taskId && dispatch({ type: 'confirmTask', id: notif.taskId })}
                  >
                    ✓ {t.bestaetigen}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}
