import { useEffect, useRef, useState } from 'react'
import { useApp } from '../app/context'
import { fill, useT } from '../i18n/useT'
import { druckKennzeichen, monatDerWoche, monatsName } from './druck'
import { useMonatDrucken } from './MonatsDruck'

/**
 * **Der Druckknopf mit der Wahl: diese Woche oder der ganze Monat** (T105).
 *
 * Vorher druckte der Knopf die Woche, die gerade offen ist, und sonst nichts.
 * Für den Aushang will der Planer den Monat am Stück — **wahlweise**, wie der
 * Betreiber es gesagt hat, nicht statt der Woche. Deshalb klappt der Knopf eine
 * kleine Auswahl auf, statt sofort zu drucken.
 *
 * Eine Auswahl direkt am Knopf, kein Blatt über der Seite: Der Knopf liegt im
 * Wochenstreifen, und der wird zum Wischen per `transform` verschoben — ein
 * festes Overlay darin säße nicht mehr am Bildschirm, sondern am Streifen.
 *
 * Ohne Monat (die Woche trägt kein gültiges Datum) oder ohne Bildschirm, der
 * ihn drucken kann, druckt der Knopf wie früher gleich die Woche — eine Auswahl
 * mit einem einzigen Eintrag wäre ein Klick zu viel.
 */
export function DruckWahl() {
  const { state } = useApp()
  const { t } = useT()
  const monatDrucken = useMonatDrucken()
  const monat = monatDerWoche(state.weeks[state.week])
  const [offen, setOffen] = useState(false)
  const wahlRef = useRef<HTMLDivElement>(null)
  const knopfRef = useRef<HTMLButtonElement>(null)

  // Zu bei Escape (der Fokus kehrt auf den Knopf zurück) und bei einem Klick
  // daneben — wie jedes Aufklappmenü.
  useEffect(() => {
    if (!offen) return
    const taste = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOffen(false)
      knopfRef.current?.focus()
    }
    const daneben = (e: PointerEvent) => {
      if (!wahlRef.current?.contains(e.target as Node)) setOffen(false)
    }
    document.addEventListener('keydown', taste)
    document.addEventListener('pointerdown', daneben)
    return () => {
      document.removeEventListener('keydown', taste)
      document.removeEventListener('pointerdown', daneben)
    }
  }, [offen])

  const woche = () => {
    setOffen(false)
    druckKennzeichen(null) // die Woche ist der Normalfall — kein Kennzeichen
    window.print()
  }

  if (!monat || !monatDrucken) {
    return (
      <button type="button" className="prog-print-btn" onClick={woche}>
        {t.drucken}
      </button>
    )
  }

  return (
    <div className="druck-wahl" ref={wahlRef}>
      <button
        type="button"
        className="prog-print-btn"
        aria-expanded={offen}
        ref={knopfRef}
        onClick={() => setOffen(!offen)}
      >
        {t.drucken}
      </button>
      {offen && (
        <div className="druck-menue">
          <button type="button" className="druck-option" onClick={woche}>
            {t.druckWoche}
          </button>
          <button
            type="button"
            className="druck-option"
            onClick={() => {
              setOffen(false)
              monatDrucken(monat)
            }}
          >
            {fill(t.druckMonat, { monat: monatsName(monat, state.lang) })}
          </button>
        </div>
      )}
    </div>
  )
}
