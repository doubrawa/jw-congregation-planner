import type { ReactNode } from 'react'
import { LOGO_GROSS, REIHEN_DECKKRAFT } from '../bausteine/logo-form'
import { Zeichen } from '../bausteine/Zeichen'
import type { Dict } from '../i18n/ui'
import type { FilmInhalt } from './film-inhalt'

/**
 * **Die Bilder im Handy des Films** (22.10.2026): Start, Mitteilungen, die
 * Anmelde-E-Mail, das Menü des Browsers und der Startbildschirm des Handys.
 *
 * Gezeichnet mit eigenen Klassen (`fm-…`, erste-schritte.css), nicht mit denen
 * der App: Deren Regeln folgen der Breite des **Fensters** — am Desktop stünde
 * im Handy sonst die Desktop-Fassung, und die Kopfzeile gäbe es dort gar
 * nicht. Die Farben sind die der App, das Bild folgt also Hell und Dunkel. Die
 * Schrift wächst nicht mit (`--fs: 1` am Schirm): Es ist ein Bild, zu lesen
 * sind die Worte darunter. Mail, Menü und Startbildschirm sind Eigenentwürfe,
 * keine Nachbauten fremder Oberflächen.
 *
 * Was die Bewegung greift, trägt ein `data-f` (film-szenen.ts). Kein Knopf ist
 * echt — es sind `span`, und die Bühne ist für Vorleseprogramme verborgen.
 */

/** Die Besetzung im Saal über der Karte, wie auf dem Entwurf: fast voll, ein Platz ist man selbst. */
const LAGEN = [
  'voll', 'voll', 'voll', 'wartet',
  'voll', 'voll', 'du', 'voll', 'problem', 'voll',
  'voll', 'voll', 'wartet', 'voll', 'voll', 'voll', 'offen', 'offen',
] as const

const PLATZ_KLASSE = {
  voll: 'fm-platz is-voll',
  wartet: 'fm-platz is-wartet',
  problem: 'fm-platz is-problem',
  offen: 'fm-platz is-offen',
} as const

/** Der Platz der App auf dem Startbildschirm: zweite Reihe, dritte Spalte. */
const APP_PLATZ = 6
const KACHELN = 20

export function Handy({ children }: { children: ReactNode }) {
  return (
    <div className="film-handy" data-f="handy">
      <div className="film-schirm" data-f="schirm">
        {children}
      </div>
    </div>
  )
}

export function Tipp() {
  return <span className="fm-tipp" data-f="tipp" />
}

/** Das Symbol der App wie `public/logo.svg`: Kachel, helle Plätze, Pult in Minze. */
export function AppSymbol() {
  return (
    <svg className="fm-symbol" viewBox="0 0 512 512">
      <rect className="fm-symbol-grund" width="512" height="512" rx="116" />
      {LOGO_GROSS.reihen.map((reihe, i) =>
        reihe.map(([x, y]) => (
          <circle key={`${x}|${y}`} className="fm-symbol-platz" cx={x} cy={y} r={LOGO_GROSS.r} fillOpacity={REIHEN_DECKKRAFT[i]} />
        )),
      )}
      <circle className="fm-symbol-pult" cx={LOGO_GROSS.pult.mitte[0]} cy={LOGO_GROSS.pult.mitte[1]} r={LOGO_GROSS.pult.r} />
    </svg>
  )
}

/**
 * Der Saal über der Karte. Der eigene Platz wie in der App (`bausteine/Saal`):
 * blass, solange die Zusage aussteht, mit ihr in Minze gefüllt. Beim Wechsel
 * wächst die Füllung in der Szene „Aufgabe" (film-szenen.ts, `du`).
 */
function Saal({ zugesagt }: { zugesagt: boolean }) {
  const [pultX, pultY] = LOGO_GROSS.pult.mitte
  return (
    <svg className="fm-saal" viewBox={LOGO_GROSS.viewBox}>
      <circle className="fm-pult" cx={pultX} cy={pultY} r={LOGO_GROSS.pult.r} />
      {LOGO_GROSS.reihen.flat().map(([x, y], i) => {
        const lage = LAGEN[i] ?? 'offen'
        if (lage === 'du') {
          return (
            <g key={i}>
              <circle className="fm-du-grund" cx={x} cy={y} r={LOGO_GROSS.r} />
              <circle className="fm-du" data-f="du" cx={x} cy={y} r={LOGO_GROSS.r} style={zugesagt ? undefined : { transform: 'scale(0)' }} />
              <circle className="fm-du-ring" cx={x} cy={y} r="25" />
            </g>
          )
        }
        return <circle key={i} className={PLATZ_KLASSE[lage]} cx={x} cy={y} r={lage === 'offen' ? 13 : LOGO_GROSS.r} />
      })}
    </svg>
  )
}

/**
 * Start mit der nächsten Aufgabe. `knopf`: offen (noch zu bestätigen), bestätigt
 * — oder beides, dann wechselt die Bewegung vom einen zum anderen.
 */
export function MockStart({ inhalt, t, knopf }: { inhalt: FilmInhalt; t: Dict; knopf: 'offen' | 'wechsel' | 'bestaetigt' }) {
  return (
    <div className="fm-app" data-f="start">
      <div className="fm-kopf">
        <span className="fm-rund">
          <Zeichen name="menue" />
        </span>
        <span className="fm-mitte">
          <span className="fm-datum">{inhalt.kopfDatum}</span>
          <span className="fm-versammlung" dir="auto">
            {inhalt.kopfVersammlung}
          </span>
        </span>
        <span className="fm-rund" data-f="glocke">
          <Zeichen name="glocke" />
          <span className="fm-neu" />
        </span>
      </div>
      <div className="fm-screen">
        <p className="fm-seitentitel" dir="auto">
          {inhalt.gruss}
        </p>
        <div className="fm-karte fm-karte--held" data-f="karte">
          <Saal zugesagt={knopf === 'bestaetigt'} />
          <span className="fm-wann">
            <span className="fm-punkt" />
            <span>{inhalt.wann}</span>
          </span>
          <span className="fm-held-titel">{t.privBibellesung}</span>
          <span className="fm-handlungen">
            {knopf !== 'bestaetigt' && (
              <span className="fm-knopf-haupt" data-f="bestaetigen">
                {t.bestaetigen}
              </span>
            )}
            {knopf !== 'offen' && (
              <span className="fm-stand" data-f="bestaetigt">
                {t.bestaetigt}
              </span>
            )}
            <span className="fm-knopf-umriss">{t.kannNicht}</span>
          </span>
        </div>
        <div className="fm-karte fm-liste">
          {inhalt.zeilen.map((tag, i) => (
            <span key={i} className="fm-zeile">
              <span className="fm-tag">{tag}</span>
              <span className={i === 0 ? 'fm-balken fm-balken--lang' : 'fm-balken'} />
              <Zeichen name="weiter" />
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

/**
 * Die Nachricht mit dem Anmelde-Link, bis zum Link (Eigenentwurf eines
 * Messengers: Kopf mit Bild und Namen als Platzhalter, eine Sprechblase). Bis
 * zum 31.10.2026 stand hier eine E-Mail — seitdem schickt die App keine mehr.
 */
export function MockNachricht({ inhalt }: { inhalt: FilmInhalt }) {
  return (
    <div className="fm-app fm-chat" data-f="nachricht">
      <div className="fm-chat-kopf">
        <Zeichen name="zurueck" />
        <span className="fm-chat-bild" />
        <span className="fm-balken" />
      </div>
      <div className="fm-chat-verlauf">
        <div className="fm-chat-blase">
          <span className="fm-chat-text" dir="auto">
            {inhalt.nachrichtText}
          </span>
          <span className="fm-chat-url" dir="ltr" data-f="url">
            https://versammlung.app/#…
          </span>
        </div>
      </div>
    </div>
  )
}

/** Das Menü des Browsers über der App (Eigenentwurf): Platzhalter und „App installieren". */
export function MockMenue({ t }: { t: Dict }) {
  return (
    <div className="fm-app fm-ueber" data-f="ueber">
      <div className="fm-menue" data-f="menue">
        <span className="fm-menue-zeile">
          <span className="fm-balken" />
        </span>
        <span className="fm-menue-zeile">
          <span className="fm-balken fm-balken--kurz" />
        </span>
        <span className="fm-menue-zeile fm-wahl" data-f="wahl">
          {t.appInstallieren}
        </span>
        <span className="fm-menue-zeile">
          <span className="fm-balken fm-balken--lang" />
        </span>
      </div>
    </div>
  )
}

/**
 * Der Startbildschirm des Handys (Eigenentwurf): Kacheln, auf einem Platz die
 * App. `installiert`: Sie steht schon dort; sonst fliegt sie aus dem Menü
 * herein (`flug`).
 */
export function MockHome({ installiert }: { installiert: boolean }) {
  return (
    <div className="fm-app fm-home" data-f="home">
      <div className="fm-raster">
        {Array.from({ length: KACHELN }, (_, i) =>
          i === APP_PLATZ ? (
            <span key={i} className="fm-app-platz" data-f="platz">
              {installiert && <AppSymbol />}
              <span className="fm-app-name" data-f="name">
                Versammlung.app
              </span>
            </span>
          ) : (
            <span key={i} className="fm-kachel" />
          ),
        )}
      </div>
      {!installiert && (
        <span className="fm-flug" data-f="flug">
          <AppSymbol />
        </span>
      )}
    </div>
  )
}

/** Die Mitteilungen: die Karte „Keine Zuteilung verpassen" über einer neuen Zuteilung. */
export function MockMitteilungen({ inhalt, t }: { inhalt: FilmInhalt; t: Dict }) {
  return (
    <div className="fm-app" data-f="mitteilungen">
      <div className="fm-kopf fm-kopf--unter">
        <span className="fm-rund">
          <Zeichen name="zurueck" />
        </span>
        <span className="fm-aktion">{t.alleGelesen}</span>
      </div>
      <div className="fm-screen">
        <p className="fm-seitentitel">{t.mitteilungen}</p>
        <div className="fm-karte fm-push" data-f="pushkarte">
          <span className="fm-push-text">
            <span className="fm-push-titel">{t.pushPromptTitle}</span>
            <span className="fm-klein">{t.pushPromptText}</span>
          </span>
          <span className="fm-pille" data-f="aktivieren">
            {t.pushAktivieren}
          </span>
        </div>
        <div className="fm-abschnitt" data-f="rest">
          <span className="fm-abschnitt-titel">{t.mitteilungenNeu}</span>
          <div className="fm-karte">
            <span className="fm-mitteilung">
              <span className="fm-mitteilung-punkt" />
              <span className="fm-mitteilung-inhalt">
                <span className="fm-mitteilung-kopf">
                  <span className="fm-mitteilung-titel">{t.notifZuteilung}</span>
                  <span className="fm-mitteilung-zeit">{inhalt.vorKurzem}</span>
                </span>
                <span className="fm-mitteilung-text">{inhalt.aufgabeZeile}</span>
              </span>
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Die erste Erinnerung, oben über allem — wie das Handy sie zeigt (Eigenentwurf). */
export function MockBanner({ inhalt, t }: { inhalt: FilmInhalt; t: Dict }) {
  return (
    <div className="fm-banner" data-f="banner">
      <span className="fm-banner-symbol">
        <AppSymbol />
      </span>
      <span className="fm-push-text">
        <span className="fm-banner-app">Versammlung.app</span>
        <span className="fm-push-titel">{t.notifErinnerung}</span>
        <span className="fm-mitteilung-text">{inhalt.aufgabeZeile}</span>
      </span>
    </div>
  )
}
