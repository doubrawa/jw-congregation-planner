import { useApp } from '../app/context'
import { useInstallAvailable, usePush } from '../components/usePush'
import { FONT_SCALES, THEME_LIST } from '../data/constants'
import { fullName } from '../data/helpers'

import type { Lang, Theme } from '../data/types'
import { APP_LANGS_SORTED } from '../i18n/langs'
import { useT } from '../i18n/useT'
import { promptInstall } from '../lib/install'
import { performLogout } from '../lib/supabase'
import { Diagnose } from './Diagnose'
import '../aufgaben/aufgaben.css'

/** Stufenname je FONT_SCALES-Position (gleiche Reihenfolge). */
const FS_LABELS = [
  'schriftKlein',
  'schriftStandard',
  'schriftGross',
  'schriftGroesser',
  'schriftSehrGross',
] as const

/**
 * Profil (eigener Navigationspunkt): Name/Versammlung, Push-Mitteilungen,
 * Darstellung (Farbschemata, siehe THEME_LIST), Schriftgröße, App-Sprache und Abmelden. Rolle
 * und Predigtdienstgruppe werden im Personen-Screen gepflegt.
 */
export function ProfilScreen() {
  const { state, dispatch } = useApp()
  const { t } = useT()
  // Position im Regler; unbekannter Wert (z. B. alter localStorage) → Standard.
  const scaleIndex = Math.max(0, FONT_SCALES.indexOf(state.fontScale))
  // Beide Listen sind gleich lang und der Index ist geklemmt; der
  // Index-Zugriff sieht das nicht (noUncheckedIndexedAccess).
  const scaleLabel = FS_LABELS[scaleIndex] ?? FS_LABELS[0]!
  const me = state.persons.find((p) => p.id === state.personId)
  // Konto-E-Mail des eingeloggten Nutzers (nur Produktion; die eigene
  // Mitglieder-Zeile ist auch für Nicht-Planer sichtbar).
  const myEmail = state.members.find((m) => m.userId === state.userId)?.email ?? ''

  // Web-Push (nur Produktion): Schalter, wenn der Browser es kann; auf iOS im
  // Browser stattdessen Installations-Hinweis (dort erst als App möglich).
  const { production, supported, needsInstall, subscribed, enable, disable } = usePush()
  const installAvail = useInstallAvailable()
  const togglePush = () => void (subscribed ? disable() : enable())

  return (
    <section className="screen">
      <h1 className="screen-title">{t.navProfil}</h1>

      <div className="panel panel--pb14" data-farbe="neutral">
        <h2 className="panel-label">{t.profil}</h2>
        <div className="kv-row">
          <span className="kv-key">{t.nameLbl}</span>
          <span className="kv-val" dir="auto">{me ? fullName(me) : ''}</span>
        </div>
        {myEmail && (
          <div className="kv-row">
            <span className="kv-key">{t.emailKv}</span>
            <span className="kv-val" dir="ltr">
              {myEmail}
            </span>
          </div>
        )}
        <div className="kv-row">
          <span className="kv-key">{t.versammlungLbl}</span>
          <span className="kv-val">{state.congregation.name}</span>
        </div>
        {production && supported && (
          <div className="kv-row">
            <span className="kv-key">{t.pushLbl}</span>
            <button
              type="button"
              className={subscribed ? 'switch is-on' : 'switch'}
              role="switch"
              aria-checked={subscribed}
              aria-label={t.pushLbl}
              onClick={togglePush}
            >
              <span className="switch-knob" />
            </button>
          </div>
        )}
        {production && needsInstall && (
          <div className="kv-row kv-row--plain prof-push-ios">
            <span className="kv-key">{t.pushLbl}</span>
            <span className="prof-push-hint">{t.pushIosHint}</span>
          </div>
        )}
        {production && installAvail && (
          <button type="button" className="btn-outline prof-install" onClick={() => void promptInstall()}>
            {t.appInstallieren}
          </button>
        )}
        <div className="kv-row kv-row--plain">
          <span className="kv-key">{t.darstellung}</span>
          <select
            className="mem-select lang-select"
            aria-label={t.darstellung}
            value={state.theme}
            onChange={(e) => dispatch({ type: 'setTheme', theme: e.target.value as Theme })}
          >
            {THEME_LIST.map(({ key, label, labelKey }) => (
              <option key={key} value={key}>
                {labelKey ? t[labelKey] : label}
              </option>
            ))}
          </select>
        </div>
        <div className="kv-row kv-row--plain">
          <span className="kv-key">{t.schriftgroesse}</span>
          <span className="kv-val">{t[scaleLabel]}</span>
        </div>
        <div className="fs-slider">
          <span className="fs-slider-a fs-slider-a--min" aria-hidden="true">
            A
          </span>
          <input
            type="range"
            className="fs-slider-input"
            min={0}
            max={FONT_SCALES.length - 1}
            step={1}
            value={scaleIndex}
            aria-label={t.schriftgroesse}
            aria-valuetext={t[scaleLabel]}
            onChange={(e) =>
              dispatch({ type: 'setFontScale', scale: FONT_SCALES[Number(e.target.value)] ?? FONT_SCALES[0]! })
            }
          />
          <span className="fs-slider-a fs-slider-a--max" aria-hidden="true">
            A
          </span>
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
        {/*
          Stand der App: beantwortet die eine Frage, die sich aus der Ferne
          sonst nicht klären lässt — läuft auf diesem Gerät wirklich die
          neueste Fassung? Unübersetzt, weil „Build" international geläufig
          und die Zeile ohnehin technische Kennung ist. Dahinter versteckt
          sich die Gesten-Diagnose (siehe Diagnose.tsx).
        */}
        <Diagnose />
      </div>
    </section>
  )
}
