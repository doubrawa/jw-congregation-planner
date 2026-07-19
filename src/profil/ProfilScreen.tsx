import { useApp } from '../app/context'
import { THEME_LIST } from '../data/constants'
import { CURRENT_PERSON_ID } from '../data/demo'
import { displayName } from '../data/helpers'
import type { Lang, Theme } from '../data/types'
import { APP_LANGS_SORTED } from '../i18n/langs'
import { useT } from '../i18n/useT'
import { performLogout } from '../lib/supabase'
import '../aufgaben/aufgaben.css'

/**
 * Profil (eigener Navigationspunkt): Stammdaten (Name/Versammlung/Rolle),
 * Darstellung (8 Farbschemata als Combobox), App-Sprache und Abmelden. Zuvor Teil des
 * Aufgaben-Screens, jetzt eigener Bereich in der Navigation.
 */
export function ProfilScreen() {
  const { state, dispatch } = useApp()
  const { t, tu } = useT()
  const me = state.persons.find((p) => p.id === (state.personId ?? CURRENT_PERSON_ID))

  // Predigtdienstgruppe des Nutzers: "Gruppe 1 · M. Albrecht" (mit Aufseher).
  const myGroup = state.groups.find((g) => g.id === me?.grp)
  const overseer = myGroup ? state.persons.find((p) => p.id === myGroup.ov) : undefined
  const myGroupLabel = myGroup
    ? tu(myGroup.name) + (overseer ? ` · ${displayName(overseer)}` : '')
    : '—'

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
          <span className="kv-key">{t.gruppeLbl}</span>
          <span className="kv-val">{myGroupLabel}</span>
        </div>
        <div className="kv-row kv-row--plain">
          <span className="kv-key">{t.darstellung}</span>
          <select
            className="mem-select lang-select"
            aria-label={t.darstellung}
            value={state.theme}
            onChange={(e) => dispatch({ type: 'setTheme', theme: e.target.value as Theme })}
          >
            {THEME_LIST.map(({ key, label }) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="kv-row kv-row--plain">
          <span className="kv-key">{t.spracheLbl}</span>
          <select
            className="mem-select lang-select"
            aria-label={t.spracheLbl}
            value={state.lang}
            onChange={(e) => dispatch({ type: 'setLang', lang: e.target.value as Lang })}
          >
            {APP_LANGS_SORTED.map(({ code, label }) => (
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
