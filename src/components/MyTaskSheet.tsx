import { useRef } from 'react'
import { helperKeyParts } from '../data/planning'
import { useApp } from '../app/context'
import { aufgabenLabel, useT } from '../i18n/useT'
import { useBackDismiss } from './useBackDismiss'
import { useDialogFocus } from './useDialogFocus'
import './overlays.css'

/**
 * Aktions-Sheet für eine EIGENE Zuteilung (geöffnet aus „Meine Aufgaben" oder
 * dem Dashboard): bestätigen, absagen („ich kann doch nicht") oder eine bereits
 * gemeldete Verhinderung doch wieder bestätigen. Bei Hilfsdiensten löst das
 * Absagen automatisch die Ersatzsuche aus (Hinweis). Schließt per ✕/Backdrop.
 */
export function MyTaskSheet() {
  const { state, dispatch } = useApp()
  const i18n = useT()
  const { t, tp } = i18n
  const dlg = useRef<HTMLDivElement>(null)
  useDialogFocus(dlg)
  const close = () => dispatch({ type: 'closeMyTask' })
  // Vor dem vorzeitigen return: Hooks müssen bei jedem Render laufen.
  useBackDismiss(true, close)

  const task = state.myTasks.find((x) => x.id === state.myTaskId)
  if (!task) return null
  const label = aufgabenLabel(task, i18n)
  const isHelper = helperKeyParts(task.id) !== null
  const decline = () => dispatch({ type: 'declineTask', id: task.id })
  const confirm = () => dispatch({ type: 'confirmTask', id: task.id })

  return (
    <>
      <div className="confirm-backdrop" onClick={close} />
      <div
        className="confirm-modal"
        role="dialog"
        aria-modal="true"
        aria-label={label}
        ref={dlg}
      >
        <button type="button" className="mytask-close" aria-label={t.a11yClose} onClick={close}>
          ✕
        </button>
        <div className="confirm-task-title">{label}</div>
        <div className="confirm-task-date">{tp(task.date)}</div>

        {task.status === 'bestätigt' && <div className="mytask-status">✓ {t.bestaetigt}</div>}
        {task.status === 'verhindert' && (
          <div className="mytask-status mytask-status--verh">{t.verhindertChip}</div>
        )}

        <div className="confirm-actions">
          {task.status === 'offen' && (
            <>
              <button type="button" className="confirm-yes" onClick={confirm}>
                ✓ {t.bestaetigen}
              </button>
              <button type="button" className="confirm-no" onClick={decline}>
                {t.kannNicht}
              </button>
            </>
          )}
          {task.status === 'bestätigt' && (
            <button type="button" className="confirm-no" onClick={decline}>
              {t.absagen}
            </button>
          )}
          {task.status === 'verhindert' && (
            <button type="button" className="confirm-yes" onClick={confirm}>
              ✓ {t.dochBestaetigen}
            </button>
          )}
        </div>

        {isHelper && task.status !== 'verhindert' && (
          <p className="mytask-hint">{t.ersatzHint}</p>
        )}
      </div>
    </>
  )
}
