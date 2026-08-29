import { useEffect, useRef } from 'react'
import { useBackDismiss } from '../components/useBackDismiss'
import { useEscape } from '../components/useEscape'
import { useDialogFocus } from '../components/useDialogFocus'
import { NOTIF_TITLE_KEY } from '../i18n/ui'
import { useT } from '../i18n/useT'
import { useApp } from './context'
import { loadAndHydrate } from './hydrate'
import { relativeZeit } from '../i18n/zeit'

/** Mitteilungen-Overlay (Kopf-Chip öffnet); Backdrop-Klick oder Escape schließt. */
export function NotificationsPanel() {
  const { state, dispatch } = useApp()
  const { t, tu } = useT()
  const dlg = useRef<HTMLDivElement>(null)
  useDialogFocus(dlg)
  useBackDismiss(true, () => dispatch({ type: 'closeNotifs' }))

  useEscape(() => dispatch({ type: 'closeNotifs' }))

  /*
   * **Beim Öffnen still nachladen.**
   *
   * Die Mitteilungen kamen bis dahin ausschließlich beim Start der App aus der
   * Datenbank — es gibt kein Realtime-Abo und kein Nachladen bei Fokus. Wer die
   * App als PWA offen liegen hat, sah in der Glocke also den Stand vom letzten
   * echten Start: Ein zweiter Planer teilte zu, jemand sagte ab, ein Ersatz
   * wurde gesucht — nichts davon kam an, bis die App neu gestartet wurde.
   *
   * Der Push-Klick löst dasselbe Nachladen schon aus (AppShell). Was fehlte,
   * war der Fall, in dem jemand von sich aus nachsieht — und das ist genau der
   * Moment, in dem er den aktuellen Stand erwartet.
   *
   * Einmal beim Öffnen, nicht wiederholt: Die leere Abhängigkeitsliste ist hier
   * Absicht, das Panel wird beim Schließen ausgehängt.
   */
  const userId = state.userId
  useEffect(() => {
    if (userId) void loadAndHydrate(dispatch, userId, { silent: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <>
      <div className="notif-backdrop" onClick={() => dispatch({ type: 'closeNotifs' })} />
      <div className="notif-panel" role="dialog" aria-modal="true" aria-label={t.mitteilungen} ref={dlg}>
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
                <div className="notif-row-time">{relativeZeit(notif.at, state.lang)}</div>
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
