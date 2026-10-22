import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useApp } from '../app/context'
import { eigenePerson } from '../app/eigene-person'
import { Zeichen } from '../bausteine/Zeichen'
import { useBackDismiss } from '../components/useBackDismiss'
import { useDialogFocus } from '../components/useDialogFocus'
import { useEscape } from '../components/useEscape'
import { useMedia } from '../components/useMedia'
import { fill, useT } from '../i18n/useT'
import { HINTEN, VORN, baueFilm, finde, vermessen } from './film-szenen'
import { filmInhalt } from './film-inhalt'
import { GESAMT, SZENEN, standbildZeit, szeneBei, type SzenenId } from './film-zeit'
import { Handy, MockBanner, MockHome, MockMail, MockMenue, MockMitteilungen, MockStart, Tipp } from './FilmBilder'
import './erste-schritte.css'

/** Ohne Bewegung (Einstellung des Geräts) steht der Film Schritt für Schritt still. */
const WENIGER_BEWEGUNG = '(prefers-reduced-motion: reduce)'

/** Wo die vier Schritte stehen — die Szenen dazwischen haben keine Nummer. */
const SCHRITT_NR: Partial<Record<SzenenId, number>> = { link: 1, aufgabe: 2, installieren: 3, erinnern: 4 }
const SCHRITTE = Object.keys(SCHRITT_NR).length

/** Was der Film den Knöpfen anbietet, sobald er läuft. */
interface Steuerung {
  spielen(): void
  anhalten(): void
  schritt(index: number): void
}

/**
 * **Der Film „Erste Schritte"** (22.10.2026, Wunsch des Betreibers: „bau den
 * Clip in die App ein: als Hochformat-Fassung fürs Handy"). Dieselben sechs
 * Szenen wie im Clip aus T132, hier im Hochformat und in der App gezeichnet
 * statt als Video: So spricht er jede App-Sprache, auch von rechts nach links,
 * folgt Hell und Dunkel, wächst mit der Schrift und braucht keinen Download.
 * Die Musik des Clips fehlt — in der App klingt nichts von selbst.
 *
 * Er läuft einmal, knapp 50 Sekunden (mit Halten zum Lesen, `film-zeit.ts`),
 * mit Pause und „Nochmal ansehen". **Ohne Bewegung** (Einstellung des
 * Geräts) läuft nichts von selbst: Dann stehen die
 * Szenen als Bilder da, und „Weiter" blättert. Am Handy füllt er den Schirm, am
 * Desktop steht er als Fenster in der Mitte; liegt das Handy quer, stehen die
 * Worte neben dem Bild. Schließen wie ein Blatt: ✕, Zurück, Escape.
 *
 * `onEnde` meldet, dass der Film einmal ganz gesehen ist — dann geht die Karte
 * auf Start (`ErsteSchritteKarte`).
 */
export function ErsteSchritteFilm({ onClose, onEnde }: { onClose: () => void; onEnde?: () => void }) {
  const { state } = useApp()
  const { t } = useT()
  const stufenweise = useMedia(WENIGER_BEWEGUNG)
  const wurzel = useRef<HTMLDivElement>(null)
  const steuerung = useRef<Steuerung | null>(null)
  const [lage, setLage] = useState<'laeuft' | 'pause' | 'ende'>('laeuft')
  const [bild, setBild] = useState(0)
  const [quer, setQuer] = useState(false)
  // Die Rückrufe ändern sich mit jedem Zeichnen des Aufrufers; der Film soll
  // deshalb nicht neu beginnen.
  const rueckruf = useRef({ onClose, onEnde })
  rueckruf.current = { onClose, onEnde }
  const beenden = () => rueckruf.current.onClose()

  useDialogFocus(wurzel)
  useBackDismiss(true, beenden)
  useEscape(beenden)

  const me = eigenePerson(state)
  const inhalt = useMemo(
    () => filmInhalt({ t, lang: state.lang, vorname: me?.fn ?? '', versammlung: state.congregation.name }, new Date()),
    [t, state.lang, me?.fn, state.congregation.name],
  )

  // Die Bewegung: einmal aufgebaut, dann Bild für Bild. Gezeichnet ist alles
  // schon (unten); hier wird nur gemessen, sichtbar gemacht und bewegt — vor
  // dem ersten Zeichnen: sonst stünde ein Bild lang die leere Bühne da, und quer
  // das Hochformat, bis `film--quer` greift (Review vom 22.10.2026).
  useLayoutEffect(() => {
    const film = wurzel.current
    if (!film) return
    const bewegung = baueFilm({
      ebene: (id) => finde(film, `ebene-${id}`),
      worte: (id) => finde(film, `worte-${id}`),
      svg: finde<SVGElement>(film, 'svg'),
    })
    const schichten = SZENEN.map((szene) => [...film.querySelectorAll<HTMLElement | SVGElement>(`[data-szene="${szene.id}"]`)])
    const ansage = finde(film, 'ansage')
    let zeit = stufenweise ? standbildZeit(0) : 0
    if (stufenweise) setBild(0)
    let aktiv = -1
    let laeuft = false
    let zuletzt = 0
    let bildNr = 0
    let gemeldet = false

    const zeichnen = () => {
      const { index, t: szenenZeit } = szeneBei(zeit)
      const szene = SZENEN[index]
      if (!szene) return
      if (index !== aktiv) {
        schichten.forEach((teile, i) => teile.forEach((teil) => (teil.style.visibility = i === index ? 'visible' : 'hidden')))
        aktiv = index
        // Vorleseprogramme hören die Worte der Szene, sobald sie beginnt — Zeile
        // für Zeile, sonst stießen „Schritt 1 von 4“ und der Satz danach zusammen.
        ansage.textContent = [...finde(film, `worte-${szene.id}`).children].map((zeile) => zeile.textContent ?? '').join(' ')
      }
      bewegung.zeigen(szene.id, szenenZeit, zeit)
    }

    const messen = () => {
      const r = film.getBoundingClientRect()
      setQuer(r.width > r.height * 1.15)
      bewegung.messen(vermessen(film))
      zeichnen()
    }

    const takt = (jetzt: number) => {
      if (!laeuft) return
      // Höchstens ein Zehntel je Bild: War die App im Hintergrund, geht es
      // dort weiter, wo der Film stand, statt Szenen zu überspringen.
      zeit = Math.min(GESAMT, zeit + Math.min(0.1, Math.max(0, (jetzt - zuletzt) / 1000)))
      zuletzt = jetzt
      zeichnen()
      if (zeit >= GESAMT) {
        laeuft = false
        setLage('ende')
        if (!gemeldet) {
          gemeldet = true
          rueckruf.current.onEnde?.()
        }
        return
      }
      bildNr = requestAnimationFrame(takt)
    }

    steuerung.current = {
      spielen() {
        if (laeuft) return
        // „Nochmal ansehen": sofort der Anfang, nicht erst mit dem nächsten Bild.
        if (zeit >= GESAMT) {
          zeit = 0
          zeichnen()
        }
        laeuft = true
        zuletzt = performance.now()
        setLage('laeuft')
        bildNr = requestAnimationFrame(takt)
      },
      anhalten() {
        laeuft = false
        cancelAnimationFrame(bildNr)
        setLage('pause')
      },
      schritt(index) {
        zeit = standbildZeit(index)
        zeichnen()
      },
    }

    messen()
    const beobachter = typeof ResizeObserver === 'function' ? new ResizeObserver(() => messen()) : null
    beobachter?.observe(film)
    beobachter?.observe(finde(film, 'buehne'))
    if (!beobachter) window.addEventListener('resize', messen)
    if (!stufenweise) steuerung.current.spielen()

    return () => {
      laeuft = false
      cancelAnimationFrame(bildNr)
      beobachter?.disconnect()
      if (!beobachter) window.removeEventListener('resize', messen)
      steuerung.current = null
    }
  }, [stufenweise])

  const letztes = SZENEN.length - 1
  const blaettern = (index: number) => {
    setBild(index)
    steuerung.current?.schritt(index)
  }
  const weiter = () => {
    if (bild < letztes) return blaettern(bild + 1)
    rueckruf.current.onEnde?.()
    beenden()
  }
  const knopf = () => {
    if (lage === 'laeuft') steuerung.current?.anhalten()
    else steuerung.current?.spielen()
  }
  const schritt = (id: SzenenId) => {
    const nr = SCHRITT_NR[id]
    return nr === undefined ? null : (
      <p className="film-schritt" data-f="schritt">
        {fill(t.ersteSchritteSchritt, { n: nr, m: SCHRITTE })}
      </p>
    )
  }

  return createPortal(
    <>
      <div className="film-schleier" onClick={beenden} />
      <div
        className={quer ? 'film film--quer' : 'film'}
        role="dialog"
        aria-modal="true"
        aria-label={t.ersteSchritte}
        ref={wurzel}
      >
        <button
          type="button"
          className="rund-knopf rund-knopf--feld film-schliessen"
          aria-label={t.a11yClose}
          data-f="schliessen"
          onClick={beenden}
        >
          <Zeichen name="kreuz" />
        </button>

        <div className="film-rolle">
          <div className="film-buehne" data-f="buehne">
            <div className="film-bild" aria-hidden="true">
              <div className="film-ebene" data-szene="link" data-f="ebene-link">
                <Handy>
                  <MockMail inhalt={inhalt} />
                  <MockStart inhalt={inhalt} t={t} knopf="offen" />
                  <Tipp />
                </Handy>
              </div>
              <div className="film-ebene" data-szene="aufgabe" data-f="ebene-aufgabe">
                <Handy>
                  <MockStart inhalt={inhalt} t={t} knopf="wechsel" />
                  <Tipp />
                </Handy>
              </div>
              <div className="film-ebene" data-szene="installieren" data-f="ebene-installieren">
                <Handy>
                  <MockStart inhalt={inhalt} t={t} knopf="bestaetigt" />
                  <MockMenue t={t} />
                  <MockHome installiert={false} />
                  <Tipp />
                </Handy>
              </div>
              <div className="film-ebene" data-szene="erinnern" data-f="ebene-erinnern">
                <Handy>
                  <MockHome installiert />
                  <MockStart inhalt={inhalt} t={t} knopf="bestaetigt" />
                  <MockMitteilungen inhalt={inhalt} t={t} />
                  <MockBanner inhalt={inhalt} t={t} />
                  <Tipp />
                  <Tipp />
                  <Tipp />
                </Handy>
              </div>
            </div>

            <svg className="film-punkte" aria-hidden="true" data-f="svg">
              <g data-szene="punkte" data-f="punkte">
                <g data-f="hinten">
                  <circle className="film-pult" data-f="punkte-pult" />
                  {HINTEN.map(({ deckkraft }, i) => (
                    <circle key={i} className="film-sitz" data-f="punkte-sitz" fillOpacity={deckkraft} />
                  ))}
                </g>
                {VORN.map((_, i) => (
                  <g key={i} data-f="punkte-vorn">
                    <circle className="film-sitz-leer" data-f="leer" />
                    <circle className="film-sitz" data-f="voll" />
                  </g>
                ))}
              </g>
              <g data-f="stufen">
                {VORN.map((_, i) => (
                  <g key={i}>
                    <circle className="film-sitz-leer" data-f="leer" />
                    <circle className="film-sitz" data-f="voll" />
                    <circle className="film-ring" data-f="ring" />
                  </g>
                ))}
              </g>
              <g data-szene="ende" data-f="ende">
                <g data-f="ende-logo">
                  <circle className="film-pult" data-f="ende-pult" />
                  {HINTEN.map(({ deckkraft }, i) => (
                    <circle key={i} className="film-sitz" data-f="ende-sitz" fillOpacity={deckkraft} />
                  ))}
                </g>
                {VORN.map((_, i) => (
                  <circle key={i} className="film-sitz" data-f="ende-vorn" />
                ))}
              </g>
            </svg>

          </div>

          <div className="film-worte">
            <div className="film-text" data-szene="punkte" data-f="worte-punkte">
              <h2 className="film-titel film-titel--gross" data-f="titel">
                {t.ersteSchritte}
              </h2>
              <p className="film-sub" data-f="sub">
                {t.ersteSchritteFuer}
              </p>
            </div>
            <div className="film-text" data-szene="link" data-f="worte-link">
              {schritt('link')}
              <h2 className="film-titel" data-f="titel">
                {t.ersteSchritteLinkTitel}
              </h2>
              <p className="film-sub" data-f="sub">
                {t.ersteSchritteLinkText}
              </p>
              <p className="film-notiz" data-f="notiz">
                {t.ersteSchritteLinkNotiz}
              </p>
            </div>
            <div className="film-text" data-szene="aufgabe" data-f="worte-aufgabe">
              {schritt('aufgabe')}
              <h2 className="film-titel" data-f="titel">
                {t.ersteSchritteAufgabeTitel}
              </h2>
              <p className="film-sub" data-f="sub">
                {fill(t.ersteSchritteAufgabeText, { knopf: t.bestaetigen })}
              </p>
              <p className="film-notiz" data-f="notiz">
                {fill(t.ersteSchritteAufgabeNotiz, { knopf: t.kannNicht })}
              </p>
            </div>
            <div className="film-text" data-szene="installieren" data-f="worte-installieren">
              {schritt('installieren')}
              <h2 className="film-titel" data-f="titel">
                {t.ersteSchritteInstallTitel}
              </h2>
              <p className="film-sub" data-f="sub">
                {fill(t.ersteSchritteInstallText, { knopf: t.appInstallieren })}
              </p>
              <p className="film-notiz" data-f="notiz">
                {fill(t.ersteSchritteInstallNotiz, { knopf: t.codeEintippen })}
              </p>
            </div>
            <div className="film-text" data-szene="erinnern" data-f="worte-erinnern">
              {schritt('erinnern')}
              <h2 className="film-titel" data-f="titel">
                {t.ersteSchritteErinnernTitel}
              </h2>
              <p className="film-sub" data-f="sub">
                {fill(t.ersteSchritteErinnernText, { knopf: t.pushAktivieren })}
              </p>
            </div>
            <div className="film-text" data-szene="ende" data-f="worte-ende">
              <h2 className="film-titel film-titel--gross" data-f="titel">
                Versammlung.app
              </h2>
              <p className="film-sub" data-f="sub">
                {t.ersteSchritteFragen}
              </p>
            </div>
          </div>

          <div className="film-steuer">
            {stufenweise ? (
              <>
                <button type="button" className="knopf-umriss" disabled={bild === 0} onClick={() => blaettern(bild - 1)}>
                  {t.ersteSchritteZurueck}
                </button>
                <button type="button" className="knopf-haupt" onClick={weiter}>
                  {bild < letztes ? t.ersteSchritteWeiter : t.fertig}
                </button>
              </>
            ) : (
              <button type="button" className="knopf-umriss" onClick={knopf}>
                {lage === 'laeuft' ? t.ersteSchrittePause : lage === 'pause' ? t.ersteSchritteAbspielen : t.ersteSchritteNochmal}
              </button>
            )}
          </div>
        </div>

        <p className="sr-only" aria-live="polite" data-f="ansage" />
      </div>
    </>,
    document.body,
  )
}
