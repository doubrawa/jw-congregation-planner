import { useApp } from '../app/context'
import { CURRENT_PERSON_ID } from '../data/demo'
import type { Lang } from '../data/types'
import { APP_LANGS } from '../i18n/langs'
import { useT } from '../i18n/useT'
import { performLogout } from '../lib/supabase'
import '../aufgaben/aufgaben.css'

/**
 * Profil (eigener Navigationspunkt): Stammdaten (Name/Versammlung/Rolle),
 * Darstellung (Hell/Dunkel), App-Sprache und Abmelden. Zuvor Teil des
 * Aufgaben-Screens, jetzt eigener Bereich in der Navigation.
 */
export function ProfilScreen() {
  const { state, dispatch } = useApp()
  const { t } = useT()
  const me = state.persons.find((p) => p.id === (state.personId ?? CURRENT_PERSON_ID))

  return (
    <section className="screen">
      <h1 className="screen-title">{t.navProfil}</h1>

      <div className="panel panel--pb14" data-farbe="neutral">
        <div className="panel-label">{t.profil}</div>
        <div className="kv-row">
          <span className="kv-key">{t.nameLbl}</span>
          <span className="kv-val">{me ? `${me.fn} ${me.ln}` : ''}</span>
        </div>
        <div className="kv-row">
          <span className="kv-key">{t.versammlungLbl}</span>
          <span className="kv-val">{state.congregation.name}</span>
        </div>
        <div className="kv-row">
          <span className="kv-key">{t.rolleLbl}</span>
          <span className="kv-val">
            {(state.planner ? t.rolleKoordinator : t.rolleVerkuendiger) +
              (state.dataStatus === 'demo' ? t.demoSuffix : '')}
          </span>
        </div>
        <div className="kv-row">
          <span className="kv-key">{t.darstellung}</span>
          <div className="theme-chips">
            <button
              type="button"
              className={state.theme === 'light' ? 'theme-chip is-active' : 'theme-chip'}
              aria-pressed={state.theme === 'light'}
              onClick={() => dispatch({ type: 'setTheme', theme: 'light' })}
            >
              {t.hell}
            </button>
            <button
              type="button"
              className={state.theme === 'dark' ? 'theme-chip is-active' : 'theme-chip'}
              aria-pressed={state.theme === 'dark'}
              onClick={() => dispatch({ type: 'setTheme', theme: 'dark' })}
            >
              {t.dunkel}
            </button>
          </div>
        </div>
        <div className="kv-row kv-row--plain">
          <span className="kv-key">{t.spracheLbl}</span>
          <select
            className="mem-select lang-select"
            aria-label={t.spracheLbl}
            value={state.lang}
            onChange={(e) => dispatch({ type: 'setLang', lang: e.target.value as Lang })}
          >
            {APP_LANGS.map(({ code, label }) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <button type="button" className="prof-logout" onClick={() => performLogout(dispatch)}>
          {t.abmelden}
        </button>
      </div>
    </section>
  )
}
