import { useApp } from '../app/context'
import { eigenePerson, rolleUndGruppe } from '../app/eigene-person'
import { Wahl } from '../bausteine/Wahl'
import { Zeichen } from '../bausteine/Zeichen'
import { AbmeldenKnopf } from '../components/AbmeldenKnopf'
import { Switch } from '../components/Switch'
import { useInstallAvailable, usePush } from '../components/usePush'
import { FONT_SCALES, THEME_LIST, type FontScale } from '../data/constants'
import { displayName, initials } from '../data/helpers'
import { erlaubteScreens, rechteVon } from '../data/rechte'
import type { Lang } from '../data/types'
import { ErsteSchritteKnopf } from '../erste-schritte/ErsteSchritteKarte'
import { APP_LANGS_SORTED } from '../i18n/langs'
import type { Dict } from '../i18n/ui'
import { useT } from '../i18n/useT'
import { promptInstall } from '../lib/install'
import { AbwesenheitenKarte } from '../components/AbwesenheitenKarte'
import { AnsichtKarte } from './AnsichtKarte'
import { Diagnose } from './Diagnose'
import './profil.css'

/**
 * Der Name jeder Stufe des Reglers — gegen `FontScale` geprüft: Eine neue Stufe
 * fehlt hier nicht still. Bis zum 16.10.2026 eine Liste neben `FONT_SCALES`,
 * die nur über die Reihenfolge zusammenhing.
 */
const FS_LABELS = {
  0.9: 'schriftKlein',
  1: 'schriftStandard',
  1.15: 'schriftGross',
  1.3: 'schriftGroesser',
  1.45: 'schriftSehrGross',
} as const satisfies Record<FontScale, keyof Dict>

/**
 * **Profil** (T121): wer man ist, wie die App aussieht, wann man fehlt.
 *
 *  - Oben Initialen, Name, Rechte-Stufe und Gruppe — und das Konto (E-Mail):
 *    man sieht, als wer man angemeldet ist.
 *  - **Darstellung**: Hell, Dunkel, Automatisch; Schriftgröße; Sprache;
 *    Push-Mitteilungen (auf dem iPhone erst als App, dann steht dort der Hinweis).
 *  - **Abwesenheiten**: die eigenen, die anstehen — und „Abwesenheit eintragen".
 *  - **Verwaltung** (Admins, nur am Handy — ab dem Tablet steht sie im Menü).
 *  - App installieren, der Film „Erste Schritte", Abmelden und der Stand der App.
 */
export function ProfilScreen() {
  const { state, dispatch } = useApp()
  const i18n = useT()
  const { t } = i18n
  const me = eigenePerson(state)
  // Position im Regler. Die Stufe ist immer eine bekannte: Was das Gerät
  // gespeichert hat, grenzt `asFontScale` schon beim Start ein.
  const scaleIndex = FONT_SCALES.indexOf(state.fontScale)
  const scaleLabel = FS_LABELS[state.fontScale]
  // Konto-E-Mail (nur Produktion; die eigene Mitglieder-Zeile sieht jeder).
  const myEmail = state.members.find((m) => m.userId === state.userId)?.email ?? ''
  const verwalten = erlaubteScreens(rechteVon(state)).includes('personen')

  // Web-Push (nur angemeldet): Schalter, wenn der Browser es kann; auf iOS im
  // Browser stattdessen Installations-Hinweis (dort erst als App möglich).
  const { angemeldet, supported, needsInstall, subscribed, enable, disable } = usePush()
  const installAvail = useInstallAvailable()

  return (
    <section className="screen profil">
      <div className="profil-kopf">
        <span className="profil-bild" aria-hidden="true">
          <span>{me ? initials(me) : '–'}</span>
        </span>
        <div className="profil-wer">
          <h1 className="profil-name" dir="auto">
            {me ? displayName(me) : t.navProfil}
          </h1>
          <span className="profil-rolle">{rolleUndGruppe(state, i18n).join(' · ')}</span>
          {myEmail && (
            <span className="klein-text" dir="ltr">
              {myEmail}
            </span>
          )}
        </div>
      </div>

      <div className="profil-spalten">
        <section className="karte profil-karte">
          <h2 className="abschnitt-titel karte-titel">{t.darstellung}</h2>
          <Wahl
            label={t.darstellung}
            optionen={THEME_LIST.map(({ key, labelKey }) => ({ wert: key, text: t[labelKey] }))}
            wert={state.theme}
            onWahl={(theme) => dispatch({ type: 'setTheme', theme })}
          />
          <div className="profil-zeile profil-schrift">
            <div className="profil-schrift-kopf">
              <span>{t.schriftgroesse}</span>
              <span className="klein-text">{t[scaleLabel]}</span>
            </div>
            <div className="profil-regler">
              <span className="profil-regler-a" aria-hidden="true">
                A
              </span>
              <input
                type="range"
                className="profil-regler-feld"
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
              <span className="profil-regler-a is-gross" aria-hidden="true">
                A
              </span>
            </div>
          </div>
          <label className="profil-zeile profil-sprache">
            <span>{t.spracheLbl}</span>
            <select
              className="profil-auswahl"
              value={state.lang}
              onChange={(e) => dispatch({ type: 'setLang', lang: e.target.value as Lang })}
            >
              {APP_LANGS_SORTED.map(({ code, label }) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {angemeldet && supported && (
            <div className="profil-zeile schalter-zeile">
              <span>{t.pushLbl}</span>
              <Switch on={subscribed} label={t.pushLbl} onToggle={() => void (subscribed ? disable() : enable())} />
            </div>
          )}
          {angemeldet && needsInstall && (
            <div className="profil-zeile schalter-zeile">
              <span className="schalter-text">
                <span>{t.pushLbl}</span>
                <span className="klein-text">{t.pushIosHint}</span>
              </span>
            </div>
          )}
        </section>

        <div className="profil-spalte">
          <AbwesenheitenKarte />

          {/* Befristet (T124): nur für Admins, am echten Recht gefragt. */}
          <AnsichtKarte />

          {verwalten && (
            <section className="karte profil-karte profil-verwaltung">
              <h2 className="abschnitt-titel karte-titel">{t.navVerwaltung}</h2>
              <button type="button" className="profil-zeile profil-verweis" onClick={() => dispatch({ type: 'navigate', screen: 'personen' })}>
                <span>{t.navPersonen}</span>
                <span className="profil-verweis-wert">
                  {state.persons.length}
                  <Zeichen name="weiter" />
                </span>
              </button>
              <button
                type="button"
                className="profil-zeile profil-verweis"
                onClick={() => dispatch({ type: 'navigate', screen: 'einstellungen' })}
              >
                <span>{t.navEinstellungen}</span>
                <Zeichen name="weiter" />
              </button>
            </section>
          )}

          <div className="profil-knoepfe">
            {angemeldet && installAvail && (
              <button type="button" className="knopf-umriss" onClick={() => void promptInstall()}>
                {t.appInstallieren}
              </button>
            )}
            <ErsteSchritteKnopf />
            <AbmeldenKnopf className="knopf-umriss" />
          </div>
          {/*
            Stand der App: beantwortet die eine Frage, die sich aus der Ferne
            sonst nicht klären lässt — läuft auf diesem Gerät wirklich die
            neueste Fassung? Dahinter versteckt sich die Gesten-Diagnose.
          */}
          <Diagnose />
        </div>
      </div>
    </section>
  )
}
