import { useEffect, useState } from 'react'
import { useApp } from '../app/context'
import { THEME_LIST } from '../data/constants'
import { CURRENT_PERSON_ID } from '../data/demo'
import { fullName } from '../data/helpers'

import type { Lang, Theme } from '../data/types'
import { APP_LANGS_SORTED } from '../i18n/langs'
import { useT } from '../i18n/useT'
import { deletePushSubscription, savePushSubscription } from '../lib/data'
import { currentSubscription, pushSupported, subscribePush, subscriptionFields } from '../lib/push'
import { performLogout } from '../lib/supabase'
import '../aufgaben/aufgaben.css'

/**
 * Profil (eigener Navigationspunkt): Name/Versammlung, Push-Mitteilungen,
 * Darstellung (8 Farbschemata), App-Sprache und Abmelden. Rolle und
 * Predigtdienstgruppe werden im Personen-Screen gepflegt.
 */
export function ProfilScreen() {
  const { state, dispatch } = useApp()
  const { t } = useT()
  const me = state.persons.find((p) => p.id === (state.personId ?? CURRENT_PERSON_ID))

  // Web-Push: Schalter nur im Produktionsmodus und wenn der Browser es kann
  // (iOS erst als "Zum Home-Bildschirm"-App). Zustand = Abo dieses Geräts.
  const [pushOn, setPushOn] = useState(false)
  const showPush = state.dataStatus !== 'demo' && pushSupported()
  useEffect(() => {
    if (!showPush) return
    void currentSubscription().then((sub) => setPushOn(Boolean(sub)))
  }, [showPush])

  const togglePush = async () => {
    if (pushOn) {
      const sub = await currentSubscription()
      if (sub) {
        deletePushSubscription(sub.endpoint)
        await sub.unsubscribe()
      }
      setPushOn(false)
      dispatch({ type: 'showToast', text: t.toastPushAus })
      return
    }
    const sub = await subscribePush().catch(() => null)
    const fields = sub && subscriptionFields(sub)
    if (!fields || !state.congregationId || !state.userId) {
      dispatch({ type: 'showToast', text: t.toastPushVerweigert })
      return
    }
    savePushSubscription(state.congregationId, state.userId, fields)
    setPushOn(true)
    dispatch({ type: 'showToast', text: t.toastPushAn })
  }

  return (
    <section className="screen">
      <h1 className="screen-title">{t.navProfil}</h1>

      <div className="panel panel--pb14" data-farbe="neutral">
        <div className="panel-label">{t.profil}</div>
        <div className="kv-row">
          <span className="kv-key">{t.nameLbl}</span>
          <span className="kv-val">{me ? fullName(me) : ''}</span>
        </div>
        <div className="kv-row">
          <span className="kv-key">{t.versammlungLbl}</span>
          <span className="kv-val">{state.congregation.name}</span>
        </div>
        {showPush && (
          <div className="kv-row">
            <span className="kv-key">{t.pushLbl}</span>
            <button
              type="button"
              className={pushOn ? 'switch is-on' : 'switch'}
              role="switch"
              aria-checked={pushOn}
              aria-label={t.pushLbl}
              onClick={() => void togglePush()}
            >
              <span className="switch-knob" />
            </button>
          </div>
        )}
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
