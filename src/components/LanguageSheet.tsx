import { useEffect } from 'react'
import { useApp } from '../app/context'
import { CONG_LANGS } from '../i18n/langs'
import './overlays.css'

/**
 * Sprach-Sheet zur Auswahl der Versammlungssprache (Sprache der Programm-
 * Inhalte beim Arbeitsheft-Import). Durchsuchbare vollständige jw.org-Liste.
 */
export function LanguageSheet() {
  const { state, dispatch } = useApp()
  const close = () => dispatch({ type: 'closeLangSheet' })

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dispatch({ type: 'closeLangSheet' })
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [dispatch])

  const query = state.langSearch.trim().toLowerCase()
  const filtered = CONG_LANGS.filter((n) => !query || n.toLowerCase().includes(query))

  return (
    <>
      <div className="sheet-backdrop" onClick={close} />
      <div className="sheet sheet--lang" role="dialog" aria-modal="true" aria-label="Versammlungssprache">
        <div className="sheet-head">
          <div>
            <div className="sheet-title">Versammlungssprache</div>
            <div className="sheet-sub">{filtered.length} Sprachen · Sprachliste von jw.org</div>
          </div>
          <button type="button" className="sheet-close" aria-label="Schließen" onClick={close}>
            ✕
          </button>
        </div>
        <input
          type="text"
          className="lang-search"
          placeholder="Sprache suchen …"
          aria-label="Sprache suchen"
          value={state.langSearch}
          onChange={(e) => dispatch({ type: 'setLangSearch', text: e.target.value })}
        />
        <div className="lang-list">
          {filtered.map((name) => {
            const active = state.congLang === name
            return (
              <button
                key={name}
                type="button"
                className={active ? 'lang-row is-active' : 'lang-row'}
                onClick={() => dispatch({ type: 'setCongLang', name })}
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
