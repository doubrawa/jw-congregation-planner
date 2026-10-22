import { useRef, useState } from 'react'
import { Zeichen } from '../bausteine/Zeichen'
import { useT } from '../i18n/useT'
import { ErsteSchritteFilm } from './ErsteSchritteFilm'

/**
 * Auf diesem Gerät gesehen oder weggeklickt — gilt für jedes Konto, wie die
 * Push-Karte (`pushKarteWeg`).
 */
export const WEG_KEY = 'ersteSchritteWeg'

function istWeg(): boolean {
  try {
    return localStorage.getItem(WEG_KEY) === '1'
  } catch {
    return false
  }
}

function merkeWeg(): void {
  try {
    localStorage.setItem(WEG_KEY, '1')
  } catch {
    // Ohne Speicher (privates Fenster) bleibt sie nur bis zum Neuladen weg.
  }
}

/**
 * **Erste Schritte** (22.10.2026): die Karte oben auf Start für alle, die neu
 * sind — sie öffnet den Film. Sie geht, sobald er einmal ganz gesehen ist oder
 * das ✕ sie wegklickt, auf diesem Gerät für immer; ansehen lässt er sich
 * weiter im Profil (`ErsteSchritteKnopf`). Wer den Film vorher schließt, findet
 * die Karte beim nächsten Mal wieder.
 */
export function ErsteSchritteKarte() {
  const { t } = useT()
  const [weg, setWeg] = useState(istWeg)
  const [offen, setOffen] = useState(false)
  // Ganz gesehen: Die Karte geht, wenn der Film schließt — auch ohne Speicher.
  const gesehen = useRef(false)
  if (weg) return null

  const wegklicken = () => {
    merkeWeg()
    setWeg(true)
  }
  return (
    <section className="karte erste-schritte-karte">
      <h2 className="erste-schritte-titel">{t.ersteSchritte}</h2>
      <button type="button" className="rund-knopf erste-schritte-weg" aria-label={t.pushKarteWeg} onClick={wegklicken}>
        <Zeichen name="kreuz" />
      </button>
      <p className="klein-text erste-schritte-text">{t.ersteSchritteKarte}</p>
      <button type="button" className="knopf-pille erste-schritte-knopf" onClick={() => setOffen(true)}>
        {t.ersteSchritteAnsehen}
      </button>
      {offen && (
        <ErsteSchritteFilm
          onEnde={() => {
            merkeWeg()
            gesehen.current = true
          }}
          onClose={() => {
            setOffen(false)
            if (gesehen.current) setWeg(true)
          }}
        />
      )}
    </section>
  )
}

/** Der Film im Profil — immer da, auch wenn die Karte auf Start schon fort ist. */
export function ErsteSchritteKnopf() {
  const { t } = useT()
  const [offen, setOffen] = useState(false)
  return (
    <>
      <button type="button" className="knopf-umriss" onClick={() => setOffen(true)}>
        {t.ersteSchritte}
      </button>
      {offen && <ErsteSchritteFilm onEnde={merkeWeg} onClose={() => setOffen(false)} />}
    </>
  )
}
