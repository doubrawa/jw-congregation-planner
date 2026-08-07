import { useEffect, useMemo, useRef } from 'react'
import { useApp } from '../app/context'
import { langChoices, useLangNames } from '../i18n/langnames'
import { fill, useT } from '../i18n/useT'
import { useBackDismiss } from './useBackDismiss'
import { useDialogFocus } from './useDialogFocus'
import { useSwipeDown } from './useSwipeDown'
import './overlays.css'

/**
 * Sprach-Sheet: durchsuchbare vollständige jw.org-Liste. Zwei Modi
 * (state.langSheetFor): Versammlungssprache wählen ('cong') oder eine weitere
 * Programmsprache für den Import hinzufügen ('alt').
 *
 * Die Namen stehen in der Bediensprache (`langChoices`), gespeichert wird
 * weiterhin der deutsche Name — er ist der Schlüssel in der Datenbank. Bis die
 * nachgeladene Liste da ist, sind Anzeige und Schlüssel schlicht dasselbe.
 */
export function LanguageSheet() {
  const { state, dispatch } = useApp()
  const { t } = useT()
  const gen = useLangNames(state.lang)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const alle = useMemo(() => langChoices(state.lang), [state.lang, gen])
  const altMode = state.langSheetFor === 'alt'
  const close = () => dispatch({ type: 'closeLangSheet' })
  const dlg = useRef<HTMLDivElement>(null)
  useDialogFocus(dlg)
  useBackDismiss(true, close)
  useSwipeDown(dlg, close)
  const pick = (name: string) =>
    dispatch(altMode ? { type: 'addProgLang', name } : { type: 'setCongLang', name })
  const isActive = (name: string) =>
    altMode ? state.progLangs.includes(name) : state.congLang === name

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dispatch({ type: 'closeLangSheet' })
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [dispatch])

  // Gesucht wird über beide Namen: wer „Hebräisch" tippt, findet עברית, und wer
  // עברית tippt, findet es auch. Nach einem Sprachwechsel weiß man oft nur noch
  // den einen von beiden.
  const query = state.langSearch.trim().toLowerCase()
  const filtered = alle.filter(
    (l) => !query || l.label.toLowerCase().includes(query) || l.key.toLowerCase().includes(query),
  )

  return (
    <>
      <div className="sheet-backdrop" onClick={close} />
      <div className="sheet sheet--lang" role="dialog" aria-modal="true" aria-label={t.a11yCongLang} ref={dlg}>
        <span className="sheet-grip" aria-hidden="true" />
        <div className="sheet-head">
          <div>
            <div className="sheet-title">{altMode ? t.progLangsLbl : t.versSprache}</div>
            <div className="sheet-sub">
              {fill(t.langCount, { n: filtered.length })} · {t.langListNote}
            </div>
          </div>
          <button type="button" className="sheet-close" aria-label={t.a11yClose} onClick={close}>
            ✕
          </button>
        </div>
        <input
          type="text"
          className="lang-search"
          placeholder={t.langSearchPh}
          aria-label={t.langSearchPh}
          value={state.langSearch}
          onChange={(e) => dispatch({ type: 'setLangSearch', text: e.target.value })}
        />
        <div className="lang-list">
          {filtered.map((l) => {
            const active = isActive(l.key)
            return (
              <button
                key={l.key}
                type="button"
                className={active ? 'lang-row is-active' : 'lang-row'}
                onClick={() => pick(l.key)}
              >
                <span>{l.label}</span>
                {active && <span className="lang-check">✓</span>}
              </button>
            )
          })}
        </div>
      </div>
    </>
  )
}
