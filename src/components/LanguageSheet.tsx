import { useEffect } from 'react'
import { useApp } from '../app/context'
import { CONG_LANGS } from '../i18n/langs'
import { fill, useT } from '../i18n/useT'
import './overlays.css'

/** Vollständige jw.org-Liste, alphabetisch nach deutschem Sprachnamen. */
const SORTED_CONG_LANGS: readonly string[] = [...CONG_LANGS].sort((a, b) =>
  a.localeCompare(b, 'de'),
)

/**
 * Sprach-Sheet: durchsuchbare vollständige jw.org-Liste. Zwei Modi
 * (state.langSheetFor): Versammlungssprache wählen ('cong') oder eine weitere
 * Programmsprache für den Import hinzufügen ('alt').
 */
export function LanguageSheet() {
  const { state, dispatch } = useApp()
  const { t } = useT()
  const altMode = state.langSheetFor === 'alt'
  const close = () => dispatch({ type: 'closeLangSheet' })
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

  const query = state.langSearch.trim().toLowerCase()
  const filtered = SORTED_CONG_LANGS.filter((n) => !query || n.toLowerCase().includes(query))

  return (
    <>
      <div className="sheet-backdrop" onClick={close} />
      <div className="sheet sheet--lang" role="dialog" aria-modal="true" aria-label="Versammlungssprache">
        <div className="sheet-head">
          <div>
            <div className="sheet-title">{altMode ? t.progLangsLbl : t.versSprache}</div>
            <div className="sheet-sub">
              {fill(t.langCount, { n: filtered.length })} · {t.langListNote}
            </div>
          </div>
          <button type="button" className="sheet-close" aria-label="✕" onClick={close}>
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
          {filtered.map((name) => {
            const active = isActive(name)
            return (
              <button
                key={name}
                type="button"
                className={active ? 'lang-row is-active' : 'lang-row'}
                onClick={() => pick(name)}
              >
                <span>{name}</span>
                {active && <span className="lang-check">✓</span>}
              </button>
            )
          })}
        </div>
      </div>
    </>
  )
}
