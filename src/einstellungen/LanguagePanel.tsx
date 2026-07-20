import { useApp } from '../app/context'
import { useT } from '../i18n/useT'

/** Sprache: Versammlungssprache (öffnet Sheet) und weitere Programmsprachen als Chips. */
export function LanguagePanel() {
  const { state, dispatch } = useApp()
  const { t } = useT()

  return (
    <div className="panel panel--pb14" data-farbe="acc">
      <div className="panel-label">{t.spracheCard}</div>
      <button
        type="button"
        className="lang-card-row"
        onClick={() => dispatch({ type: 'openLangSheet' })}
      >
        <span className="lang-card-key">{t.versSprache}</span>
        <span className="lang-card-val">
          <span>{state.congLang}</span>
          <span className="lang-card-chevron">›</span>
        </span>
      </button>
      <p className="lang-card-desc">{t.versSpracheDesc}</p>

      <div className="lang-card-key proglang-label">{t.progLangsLbl}</div>
      <div className="proglang-chips">
        {state.progLangs.map((name) => (
          <span key={name} className="proglang-chip">
            {name}
            <button
              type="button"
              className="proglang-chip-x"
              aria-label="✕"
              onClick={() => dispatch({ type: 'removeProgLang', name })}
            >
              ✕
            </button>
          </span>
        ))}
        <button
          type="button"
          className="role-chip"
          onClick={() => dispatch({ type: 'openLangSheet', mode: 'alt' })}
        >
          {t.hinzufuegen}
        </button>
      </div>
      <p className="lang-card-desc">{t.progLangsDesc}</p>
    </div>
  )
}
