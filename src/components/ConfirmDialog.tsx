import { useRef } from 'react'
import { useApp } from '../app/context'
import { aufgabenLabel, useT } from '../i18n/useT'
import { useDialogFocus } from './useDialogFocus'
import './overlays.css'

/**
 * Das Blatt beim Öffnen der App. Es legt zweierlei vor:
 *
 *  1. **Offene Zuteilungen** des Nutzers — Pflicht. Kein Backdrop-Schließen,
 *     kein ✕; es verschwindet erst, wenn keine offene Aufgabe mehr übrig ist.
 *     Je Aufgabe „Bestätigen" oder „Ich bin verhindert" (meldet an den
 *     Koordinator).
 *  2. **Offene Ersatzgesuche** — freiwillig (T69). Sie erreichten bis dahin nur,
 *     wer von selbst unter „Aufgaben" nachsah oder über einen Push hereinkam;
 *     die übrigen erfuhren nie davon, und der Abgesagte blieb ohne Ersatz.
 *
 * Beides in **einem** Blatt und aus derselben Ableitung: eine zweite Mechanik
 * neben dem Bestätigen wäre ein zweiter Ort, an dem so etwas vergessen wird.
 * Steht nur ein Gesuch da, lässt sich das Blatt weglegen — einspringen kann
 * man, müssen tut man es nicht.
 */
export function ConfirmDialog() {
  const { state, dispatch } = useApp()
  const i18n = useT()
  const { t, tp, tu } = i18n
  const openTasks = state.myTasks.filter((task) => task.status === 'offen')
  const gesuche = state.substituteReqs
  const pflicht = openTasks.length > 0
  const dlg = useRef<HTMLDivElement>(null)
  useDialogFocus(dlg)
  const close = () => dispatch({ type: 'closeConfirm' })

  return (
    <>
      <div className="confirm-backdrop" onClick={pflicht ? undefined : close} />
      <div
        className="confirm-modal"
        role="dialog"
        aria-modal="true"
        aria-label={pflicht ? t.confirmTitle : t.einspringenTitle}
        ref={dlg}
      >
        {pflicht && (
          <>
            <div className="confirm-eyebrow">{t.erinnerungCap}</div>
            <h2 className="confirm-title">{t.confirmTitle}</h2>
            <p className="confirm-intro">{t.confirmIntro}</p>
            {openTasks.map((task) => (
              <div key={task.id} className="confirm-task">
                <div className="confirm-task-title">{aufgabenLabel(task, i18n)}</div>
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
          </>
        )}
        {gesuche.length > 0 && (
          <div className={pflicht ? 'confirm-subs confirm-subs--nach' : 'confirm-subs'}>
            <div className="confirm-subs-head">
              <div className="confirm-eyebrow">{t.einspringenTitle}</div>
              {/* Wegzulegen nur, solange nichts zu bestätigen ist — sonst hält
                  das Blatt, wie es das immer getan hat. */}
              {!pflicht && (
                <button type="button" className="sheet-close" aria-label={t.a11yClose} onClick={close}>
                  ✕
                </button>
              )}
            </div>
            <p className="confirm-intro">{t.einspringenHint}</p>
            {gesuche.map((req) => (
              <div key={req.key} className="confirm-task">
                <div className="confirm-task-title">{tu(req.title)}</div>
                <div className="confirm-task-date">
                  {tp(req.date)} · {tu(req.declinedBy)}
                </div>
                <div className="confirm-actions">
                  <button
                    type="button"
                    className="confirm-yes"
                    onClick={() => dispatch({ type: 'takeSubstitute', key: req.key })}
                  >
                    {t.uebernehmen}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
