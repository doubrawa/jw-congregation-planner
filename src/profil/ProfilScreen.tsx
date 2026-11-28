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
import { inAnzeigeZiffern } from '../i18n/anzeige-ziffern'
import { useT } from '../i18n/useT'
import { promptInstall } from '../lib/install'
import { AbwesenheitenKarte } from '../components/AbwesenheitenKarte'
import { AnmeldungKarte } from './AnmeldungKarte'
import { KalenderKarte } from './KalenderKarte'
import { AnsichtKarte } from './AnsichtKarte'
import { Diagnose } from './Diagnose'
import { HandbuchKarte } from './HandbuchKarte'
import './profil.css'

/**
 * Der Name jeder Schriftstufe — gegen `FontScale` geprüft: Eine neue Stufe
 * fehlt hier nicht still.
 */
const FS_LABELS = {
  0.9: 'schriftKlein',
  1: 'schriftStandard',
  1.15: 'schriftGross',
  1.3: 'schriftGroesser',
  1.45: 'schriftSehrGross',
} as const satisfies Record<FontScale, keyof Dict>

/** Das „A" der Stufe „Standard" in px; die übrigen stehen im Verhältnis ihrer Stufe dazu. */
const A_GROESSE = 17

/**
 * **Profil** (T121): wer man ist, wie die App aussieht, wann man fehlt.
 *
 *  - Oben Initialen, Name, Rechte-Stufe und Gruppe — und das Konto (E-Mail):
 *    man sieht, als wer man angemeldet ist.
 *  - **Darstellung**: Hell, Dunkel, Automatisch; Schriftgröße — fünf Knöpfe,
 *    jeder mit einem „A" in seiner Größe, statt eines Schiebereglers, den eine
 *    unsichere Hand kaum trifft; Sprache; Mitteilungen auf dieses Gerät (auf
 *    dem iPhone erst als App, dann steht dort der Hinweis).
 *  - **Abwesenheiten**: die eigenen, die anstehen — und „Abwesenheit eintragen".
 *  - **Verwaltung** (Admins, nur am Handy — ab dem Tablet steht sie im Menü).
 *  - **Anmeldung**: ein Einmal-Code fürs nächste Gerät, „Zettel und Link sperren".
 *  - **Handbuch**: für Verkündiger, wer planen darf auch für Planer (GitHub).
 *  - App installieren, der Film „Erste Schritte", Abmelden und der Stand der App.
 */
export function ProfilScreen() {
  const { state, dispatch } = useApp()
  const i18n = useT()
  const { t } = i18n
  const me = eigenePerson(state)
  // Konto-E-Mail (nur Produktion; die eigene Mitglieder-Zeile sieht jeder).
  const myEmail = state.members.find((m) => m.userId === state.userId)?.email ?? ''
  const rechte = rechteVon(state)
  const verwalten = erlaubteScreens(rechte).includes('personen')

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
        {/* Links Darstellung und Abwesenheiten, rechts der Rest (T192): Am Desktop
            stand links nur die Darstellung — 261 px gegen 1141 px daneben. Am Handy
            bleibt die Folge dieselbe. */}
        <div className="profil-spalte">
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
                <span className="profil-schrift-stufe">{t[FS_LABELS[state.fontScale]]}</span>
              </div>
              <div role="group" aria-label={t.schriftgroesse} className="wahl profil-schriftwahl">
                {FONT_SCALES.map((stufe) => (
                  <button
                    key={stufe}
                    type="button"
                    className="wahl-knopf"
                    aria-pressed={stufe === state.fontScale}
                    aria-label={t[FS_LABELS[stufe]]}
                    onClick={() => dispatch({ type: 'setFontScale', scale: stufe })}
                  >
                    {/* Fest in der Größe seiner Stufe, nicht mit der gewählten:
                        Das „A" zeigt, was der Tipp bringt. */}
                    <span aria-hidden="true" style={{ fontSize: `${A_GROESSE * stufe}px` }}>
                      A
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <label className="profil-zeile profil-sprache">
              <span>{t.spracheLbl}</span>
              <select
                className="profil-auswahl"
                value={state.lang}
                onChange={(e) => dispatch({ type: 'setLang', lang: e.target.value as Lang })}
              >
                {/* Jede Sprache in ihrem eigenen Namen, mit ihrem `lang` (wie bei der Anmeldung). */}
                {APP_LANGS_SORTED.map(({ code, label }) => (
                  <option key={code} value={code} lang={code}>
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

          <AbwesenheitenKarte />
        </div>

        <div className="profil-spalte">
          {/* Nur für Admins, am echten Recht gefragt. */}
          <AnsichtKarte />

          {verwalten && (
            <section className="karte profil-karte profil-verwaltung">
              <h2 className="abschnitt-titel karte-titel">{t.navVerwaltung}</h2>
              <button type="button" className="profil-zeile profil-verweis" onClick={() => dispatch({ type: 'navigate', screen: 'personen' })}>
                <span>{t.navPersonen}</span>
                <span className="profil-verweis-wert">
                  {inAnzeigeZiffern(state.persons.length)}
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

          <AnmeldungKarte />

          {/* Unter „Anmeldung": Beides verbindet ein Gerät mit dem eigenen Zugang. */}
          <KalenderKarte />

          {/* Das Handbuch gleich über „Erste Schritte" — beides Hilfe. */}
          <HandbuchKarte fuerPlaner={rechte.zuteilen} />

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
