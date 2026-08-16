import { useEffect, useRef } from 'react'
import { useAppDispatch } from '../app/context'
import { S89Karte } from './S89Karte'
import { useT } from '../i18n/useT'
import { useBackDismiss } from './useBackDismiss'
import { useDialogFocus } from './useDialogFocus'
import { useSwipeDown } from './useSwipeDown'
import type { S89Payload } from '../data/types'
import './overlays.css'

/**
 * Digitales S-89-Formular („Aufgabe in der Leben-und-Dienst-Zusammenkunft“).
 * Bottom-Sheet mobil / zentriertes Modal desktop; liegt über dem
 * Zuteilungs-Sheet. Geöffnet aus Meine Aufgaben und dem Zuteilungs-Sheet.
 */
export function S89Sheet({ payload }: { payload: S89Payload }) {
  const dispatch = useAppDispatch()
  const { t } = useT()
  const close = () => dispatch({ type: 'closeS89' })
  const dlg = useRef<HTMLDivElement>(null)
  useDialogFocus(dlg)
  useBackDismiss(true, close)
  useSwipeDown(dlg, close)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dispatch({ type: 'closeS89' })
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [dispatch])

  return (
    <>
      <div className="sheet-backdrop sheet-backdrop--s89" onClick={close} />
      <div className="sheet sheet--s89" role="dialog" aria-modal="true" aria-label={t.s89Title} ref={dlg}>
        <span className="sheet-grip" aria-hidden="true" />
        <div className="sheet-head">
          <div>
            <div className="s89-eyebrow">S-89</div>
            <div className="sheet-title">{t.s89Title}</div>
          </div>
          <button type="button" className="sheet-close" aria-label={t.a11yClose} onClick={close}>
            ✕
          </button>
        </div>
        <S89Karte payload={payload} />
      </div>
    </>
  )
}
