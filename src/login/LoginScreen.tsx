import { lazy, Suspense, useEffect, useId, useState } from 'react'
import { codeAnzeige, codeAus, codeNormal, codeVollstaendig, tokenAus } from '../../supabase/functions/_shared/anmeldung.ts'
import { useApp } from '../app/context'
import { DESKTOP_BREITE, useMedia } from '../components/useMedia'
import type { Lang } from '../data/types'
import { APP_LANGS_SORTED } from '../i18n/langs'
import { fill, useT } from '../i18n/useT'
import { codePruefen, mitCodeAnmelden, mitLinkAnmelden } from '../lib/anmelden'
import { isSupabaseConfigured } from '../lib/supabase'
import { anmeldeAdresse, anmeldeCodeVerbraucht } from './anmelde-adresse'
import { anmeldeFehlerText } from './anmelde-fehler'
import { KONTAKT_MAIL, kontaktVerweis } from './kontakt'
import { LoginKopf } from './LoginKopf'
import './login.css'

const ZettelScanner = lazy(() => import('./ZettelScanner'))

/** Kann dieses Gerät überhaupt eine Kamera öffnen? (Ob es eine hat, zeigt erst der Versuch.) */
const kameraMoeglich = (): boolean => typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function'

type Ansicht = { art: 'start' } | { art: 'code'; code: string } | { art: 'scannen' }

/**
 * **Anmelden** (T121, Phase 8; Entwürfe `GAnmeldung`, `GCode`,
 * `GDesktopAnmeldung`). Ein Kennwort gibt es nicht: Wer einen Link von den
 * Ältesten hat, tippt darauf und kommt gar nicht erst hierher; alle anderen
 * scannen ihren Zettel oder tippen den Code darauf ein. Konten legt der Admin
 * an — registrieren kann man sich hier nicht. Bis zum 31.10.2026 ließ man sich
 * hier auch einen Link per E-Mail schicken; seitdem speichert die App keine
 * Adressen mehr.
 *
 * Unter dem Namen steht, wofür die App da ist, ganz unten der Kontakt für eine
 * neue Versammlung (T113).
 *
 * **Ohne Datenbank** (Entwicklerseite) ist Anmelden nachgestellt: Jeder
 * vollständige Code meldet an — die Maske sieht trotzdem aus wie im Betrieb,
 * denn hier entsteht die Aufnahme fürs Handbuch.
 */
export function LoginScreen() {
  const { state, dispatch } = useApp()
  const { t } = useT()
  // Am Desktop hält man keinen Zettel vor die Kamera — dort tippt man.
  const scannen = !useMedia(DESKTOP_BREITE) && kameraMoeglich()
  const [ansicht, setAnsicht] = useState<Ansicht>(() => {
    const code = anmeldeAdresse().code
    return code ? { art: 'code', code } : { art: 'start' }
  })

  const angemeldet = () => dispatch({ type: 'login', welcome: true })

  /** Was der Scanner liest: ein Anmelde-Link meldet an, ein Zettel füllt den Code. */
  const gescannt = async (text: string) => {
    const hash = (() => {
      try {
        return new URL(text).hash
      } catch {
        return ''
      }
    })()
    const token = tokenAus(hash)
    const code = codeAus(hash) ?? (codeVollstaendig(text) ? codeNormal(text) : null)
    if (code) {
      setAnsicht({ art: 'code', code })
      return
    }
    if (token) {
      setAnsicht({ art: 'start' })
      const fehler = await mitLinkAnmelden(token)
      if (fehler) dispatch({ type: 'showToast', text: anmeldeFehlerText(fehler, t, 'link') })
      else angemeldet()
      return
    }
    setAnsicht({ art: 'start' })
    dispatch({ type: 'showToast', text: t.scanFremd })
  }

  return (
    <div className="login">
      {/* Am Desktop steht das hier auf einer Karte (Entwurf GDesktopAnmeldung),
          Sprache und Kontakt darunter. */}
      <div className="login-karte">
        {/* Wer ohne Link hierher kommt, erfährt sonst nicht, wofür die App da ist (T113). */}
        <LoginKopf untertitel={t.appZweck} />

        {/* Abgemeldet, weil das Konto keiner Versammlung mehr angehört
            (21.10.2026) — ohne den Satz stünde man ohne Erklärung hier. */}
        {state.keineVersammlung && (
          <p className="karte login-abgemeldet" role="status">
            {t.stKeineVersText}
          </p>
        )}

        {ansicht.art === 'code' ? (
          <CodeEingabe
            code={ansicht.code}
            onAngemeldet={angemeldet}
            onZurueck={() => {
              anmeldeCodeVerbraucht()
              setAnsicht({ art: 'start' })
            }}
          />
        ) : ansicht.art === 'scannen' ? (
          <>
            {/* Die Überschrift der Seite — wie „Anmelden" und „Mit Code anmelden" in den anderen Ansichten. */}
            <h1 className="seitentitel seitentitel--gross login-titel">{t.zettelScannen}</h1>
            <Suspense fallback={<p className="klein-text login-scanner-laedt">{t.laedt}</p>}>
              <ZettelScanner onGefunden={(text) => void gescannt(text)} onAbbrechen={() => setAnsicht({ art: 'start' })} />
            </Suspense>
          </>
        ) : (
          <div className="login-form">
            <h1 className="seitentitel seitentitel--gross login-titel">{t.anmeldenTitel}</h1>
            <p className="login-hinweis">{t.ohnePasswort}</p>
            <div className="karte login-zettel">
              {/* Der Hinweis nennt nur, was hier geht: ohne Scanner das Eintippen. */}
              <p className="klein-text">{scannen ? t.zettelHinweis : t.zettelHinweisTippen}</p>
              <div className="login-zettel-knoepfe">
                {scannen && (
                  <button type="button" className="knopf-haupt" onClick={() => setAnsicht({ art: 'scannen' })}>
                    {t.zettelScannen}
                  </button>
                )}
                {/* Allein ist „Code eintippen" der Weg und so deutlich wie sonst „Zettel scannen". */}
                <button
                  type="button"
                  className={scannen ? 'knopf-umriss' : 'knopf-haupt'}
                  onClick={() => setAnsicht({ art: 'code', code: '' })}
                >
                  {t.codeEintippen}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="login-langs">
        <select
          className="feld-wahl login-lang-select"
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

      <p className="login-note">{isSupabaseConfigured ? t.nurMitglieder : t.anmeldungOhneDb}</p>
      {/* Der Weg zum Betreiber für eine neue Versammlung (T113) — auch in der
          Demo: Wer sie ansieht, ist genau der, der fragen würde. Die Adresse
          steht sichtbar da, zum Abschreiben, falls kein Mail-Programm
          eingerichtet ist, und bleibt in jeder Schreibrichtung
          links-nach-rechts lesbar. */}
      <p className="login-kontakt">
        <span>{t.versammlungAnfragen}</span>
        <a href={kontaktVerweis(t.anfrageBetreff)} dir="ltr">
          {KONTAKT_MAIL}
        </a>
      </p>
    </div>
  )
}

/**
 * **Mit Code anmelden** (Entwurf `GCode`): der Code vom Zettel, getippt oder
 * gescannt. Ist er vollständig, sagt die App, wem er gehört — erst dann meldet
 * „Anmelden" an. So merkt, wer auf einem geteilten Gerät den Zettel eines
 * anderen erwischt hat, es vorher.
 */
function CodeEingabe({ code: vorgabe, onAngemeldet, onZurueck }: { code: string; onAngemeldet: () => void; onZurueck: () => void }) {
  const { t } = useT()
  const feldId = useId()
  const [eingabe, setEingabe] = useState(vorgabe ? codeAnzeige(vorgabe) : '')
  const [geprueft, setGeprueft] = useState<{ code: string; name: string; versammlung: string } | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const [laeuft, setLaeuft] = useState(false)
  /** Zählt die Versuche der Prüfung — „Anmelden" stößt nach einem Fehlschlag die nächste an. */
  const [versuch, setVersuch] = useState(0)
  const code = codeNormal(eingabe)
  const passt = geprueft !== null && geprueft.code === code

  // Vollständig getippt (oder gescannt): nachsehen, wem der Code gehört.
  useEffect(() => {
    if (!codeVollstaendig(code)) return
    let vorbei = false
    setLaeuft(true)
    void codePruefen(code).then((r) => {
      if (vorbei) return
      setLaeuft(false)
      if (r.ok) setGeprueft({ code, name: r.name, versammlung: r.versammlung })
      else setFehler(anmeldeFehlerText(r.fehler, t, 'code'))
    })
    return () => {
      vorbei = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, versuch])

  const anmelden = async () => {
    if (laeuft) return
    /*
     * Noch nicht geprüft — die Prüfung ist gescheitert, etwa am Netz: Dann
     * prüft der Knopf noch einmal, und angemeldet wird erst, wenn der Name zu
     * sehen ist. Bis zum 16.10.2026 blieb er gesperrt; der Fehler bat um einen
     * neuen Versuch, und keiner ging, ohne den Code neu zu tippen.
     */
    if (!passt) {
      if (codeVollstaendig(code)) {
        setFehler(null)
        setVersuch((n) => n + 1)
      }
      return
    }
    setLaeuft(true)
    const r = await mitCodeAnmelden(code)
    setLaeuft(false)
    if (r) {
      setFehler(anmeldeFehlerText(r, t, 'code'))
      return
    }
    anmeldeCodeVerbraucht()
    onAngemeldet()
  }

  return (
    <div className="login-form">
      <h1 className="seitentitel seitentitel--gross login-titel">{t.mitCodeAnmelden}</h1>
      <p className="login-hinweis">{t.codeHinweis}</p>
      <div className="blatt-feld">
        <label className="feld-marke" htmlFor={feldId}>
          {t.codeLbl}
        </label>
        <input
          id={feldId}
          className="feld login-code"
          type="text"
          dir="ltr"
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="one-time-code"
          spellCheck={false}
          maxLength={12}
          value={eingabe}
          aria-invalid={fehler ? true : undefined}
          onChange={(e) => {
            setEingabe(e.target.value.toUpperCase())
            setFehler(null)
            setGeprueft(null)
          }}
        />
      </div>
      {fehler && (
        <p className="feld-fehler" role="alert">
          {fehler}
        </p>
      )}
      {passt && (
        <section className="karte login-code-passt" aria-live="polite">
          <span className="klein-text">{t.codePasst}</span>
          {geprueft.name && (
            <span className="login-code-name" dir="auto">
              {geprueft.name}
            </span>
          )}
          {geprueft.versammlung && (
            <span className="klein-text" dir="auto">
              {fill(t.congLabel, { name: geprueft.versammlung })}
            </span>
          )}
          <span className="klein-text">{t.codeNichtDu}</span>
        </section>
      )}
      <button
        type="button"
        className="knopf-haupt login-senden"
        aria-disabled={!codeVollstaendig(code) || laeuft || undefined}
        onClick={() => void anmelden()}
      >
        {t.anmeldenKnopf}
      </button>
      {passt && <p className="klein-text login-meldung">{t.angemeldetBleiben}</p>}
      <button type="button" className="knopf-leise login-zurueck" onClick={onZurueck}>
        {t.a11yZurueck}
      </button>
    </div>
  )
}
