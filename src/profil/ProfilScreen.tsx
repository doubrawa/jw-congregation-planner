import { useState } from 'react'
import { useApp } from '../app/context'
import { useInstallAvailable, usePush } from '../components/usePush'
import { FONT_SCALES, THEME_LIST } from '../data/constants'
import { CURRENT_PERSON_ID } from '../data/demo'
import { fullName } from '../data/helpers'

import type { Lang, Theme } from '../data/types'
import { APP_LANGS_SORTED } from '../i18n/langs'
import { useT } from '../i18n/useT'
import { promptInstall } from '../lib/install'
import { performLogout } from '../lib/supabase'
import { copyText } from '../lib/clipboard'
import { gestenLoeschen, gestenProtokollText } from '../lib/gesture-log'
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
 * Darstellung (8 Farbschemata), Schriftgröße, App-Sprache und Abmelden. Rolle
 * und Predigtdienstgruppe werden im Personen-Screen gepflegt.
 */
export function ProfilScreen() {
  const { state, dispatch } = useApp()
  const { t } = useT()
  // Antippen der Build-Zeile — ab fünf öffnet sich die Gesten-Diagnose.
  const [tipps, setTipps] = useState(0)
  // Position im Regler; unbekannter Wert (z. B. alter localStorage) → Standard.
  const scaleIndex = Math.max(0, FONT_SCALES.indexOf(state.fontScale))
  const me = state.persons.find((p) => p.id === (state.personId ?? CURRENT_PERSON_ID))
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
        <div className="panel-label">{t.profil}</div>
        <div className="kv-row">
          <span className="kv-key">{t.nameLbl}</span>
          <span className="kv-val">{me ? fullName(me) : ''}</span>
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
            {THEME_LIST.map(({ key, label }) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="kv-row kv-row--plain">
          <span className="kv-key">{t.schriftgroesse}</span>
          <span className="kv-val">{t[FS_LABELS[scaleIndex]]}</span>
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
            aria-valuetext={t[FS_LABELS[scaleIndex]]}
            onChange={(e) =>
              dispatch({ type: 'setFontScale', scale: FONT_SCALES[Number(e.target.value)] })
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
          Stand der App. Bewusst unübersetzt und unauffällig: er richtet sich
          nicht an alle Nutzer, sondern beantwortet die eine Frage, die sich
          aus der Ferne sonst nicht klären lässt — läuft auf diesem Gerät
          wirklich die neueste Fassung?
        */}
        {/* „Build" bewusst unübersetzt: das Wort ist international geläufig,
            und die Zeile ist ohnehin technische Kennung, kein Fließtext.
            Fünfmal antippen öffnet die Gesten-Diagnose — versteckt, weil sie
            niemanden außer der Fehlersuche etwas angeht, und ohne Tastatur-
            Fokus, damit sie beim Durchtabben nicht im Weg steht. */}
        <p className="prof-build" onClick={() => setTipps((n) => n + 1)}>
          Build {__BUILD_ID__}
        </p>
        {tipps >= 5 && <GestenDiagnose />}
      </div>
    </section>
  )
}

/**
 * Gesten-Diagnose: zeigt, was bei der letzten Wischbewegung auf DIESEM Gerät
 * tatsächlich passiert ist.
 *
 * Grund für die Existenz: Gesten lassen sich am Rechner nur nachbilden. Ein
 * Wisch, der in Chrome mit Handy-Emulation sauber durchläuft, kann auf einem
 * Android-Handy abbrechen, weil der Browser die Bewegung fürs Scrollen
 * übernimmt. Ohne dieses Protokoll bleibt nur Raten.
 *
 * Bewusst unübersetzt: der Text richtet sich nicht an Nutzer, sondern wird
 * kopiert und weitergegeben.
 */
function GestenDiagnose() {
  const [text, setText] = useState(gestenProtokollText)
  const [kopiert, setKopiert] = useState(false)
  return (
    <div className="prof-diag">
      <pre className="prof-diag-text">{text}</pre>
      <div className="prof-diag-btns">
        <button type="button" className="btn-outline" onClick={() => setText(gestenProtokollText())}>
          Aktualisieren
        </button>
        <button
          type="button"
          className="btn-outline"
          onClick={() => {
            void copyText(text).then(setKopiert)
          }}
        >
          {kopiert ? 'Kopiert' : 'Kopieren'}
        </button>
        <button
          type="button"
          className="btn-outline"
          onClick={() => {
            gestenLoeschen()
            setText(gestenProtokollText())
          }}
        >
          Leeren
        </button>
      </div>
    </div>
  )
}
