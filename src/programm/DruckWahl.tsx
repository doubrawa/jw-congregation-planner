import { useState } from 'react'
import { createPortal, flushSync } from 'react-dom'
import { useApp } from '../app/context'
import { Zeichen } from '../bausteine/Zeichen'
import { Sheet } from '../components/Sheet'
import { fill, useT } from '../i18n/useT'
import { druckKennzeichen, monatDerWoche, monatsName } from './druck'
import { useMonatDrucken } from './MonatsDruck'

/**
 * **Drucken: diese Woche oder der ganze Monat** (T105; T121, Entwurf
 * `GDrucken`).
 *
 * Für den Aushang will der Planer den Monat am Stück — **wahlweise**, wie der
 * Betreiber es gesagt hat, nicht statt der Woche. Deshalb öffnet der Knopf ein
 * Blatt mit der Wahl, statt sofort zu drucken.
 *
 * Das Blatt hängt per Portal am Dokument: Der Knopf liegt im Wochenstreifen,
 * und der wird zum Wischen per `transform` verschoben — ein festes Blatt darin
 * säße nicht mehr am Bildschirm, sondern am Streifen.
 *
 * Ohne Monat (die Woche trägt kein gültiges Datum) oder ohne Bildschirm, der
 * ihn drucken kann, druckt der Knopf wie früher gleich die Woche — eine Wahl
 * mit einem einzigen Eintrag wäre ein Tipp zu viel.
 *
 * Am Handy ein rundes Zeichen neben dem Termin; ab dem Tablet steht das Wort
 * dabei (`mitText`), rechts neben der Wochenwahl (`GTabletWoche`).
 */
export function DruckWahl({
  zeitraum,
  erklaerung,
  mitText = false,
}: {
  zeitraum?: string
  erklaerung?: string
  mitText?: boolean
}) {
  const { state } = useApp()
  const { t } = useT()
  const monatDrucken = useMonatDrucken()
  const monat = monatDerWoche(state.weeks[state.week])
  const [offen, setOffen] = useState(false)

  const woche = () => {
    druckKennzeichen(null) // die Woche ist der Normalfall — kein Kennzeichen
    window.print()
  }
  const knopf = (onClick: () => void) =>
    mitText ? (
      <button type="button" className="knopf-umriss druck-knopf druck-knopf--text" onClick={onClick}>
        <Zeichen name="drucken" />
        {t.drucken}
      </button>
    ) : (
      <button type="button" className="rund-knopf druck-knopf" aria-label={t.drucken} onClick={onClick}>
        <Zeichen name="drucken" />
      </button>
    )

  if (!monat || !monatDrucken) return knopf(woche)

  return (
    <>
      {knopf(() => setOffen(true))}
      {offen && (
        <DruckBlatt
          zeitraum={zeitraum}
          erklaerung={erklaerung}
          monatText={fill(t.druckMonat, { monat: monatsName(monat, state.lang) })}
          onClose={() => setOffen(false)}
          onDrucken={(ganzerMonat) => {
            // Erst das Blatt weg, dann drucken: Der Druckdialog nimmt den Stand
            // auf, der in diesem Moment im DOM steht.
            flushSync(() => setOffen(false))
            if (ganzerMonat) monatDrucken(monat)
            else woche()
          }}
        />
      )}
    </>
  )
}

/** Das Blatt mit der Wahl — die Woche ist vorgewählt. */
function DruckBlatt({
  zeitraum,
  erklaerung,
  monatText,
  onClose,
  onDrucken,
}: {
  zeitraum?: string
  erklaerung?: string
  monatText: string
  onClose: () => void
  onDrucken: (ganzerMonat: boolean) => void
}) {
  const { t } = useT()
  const [ganzerMonat, setGanzerMonat] = useState(false)
  const wahl = (monat: boolean, titel: string, unter?: string) => (
    <button
      type="button"
      role="radio"
      aria-checked={ganzerMonat === monat}
      className="druck-option"
      onClick={() => setGanzerMonat(monat)}
    >
      <span className="druck-option-kreis" aria-hidden="true" />
      <span className="druck-option-text">
        <span className="druck-option-titel">{titel}</span>
        {unter && <span className="klein-text">{unter}</span>}
      </span>
    </button>
  )

  return createPortal(
    <Sheet label={t.drucken} title={t.drucken} sub={erklaerung} onClose={onClose}>
      <div className="sheet-inhalt">
        <div className="druck-optionen" role="radiogroup" aria-label={t.drucken}>
          {wahl(false, t.druckWoche, zeitraum)}
          {wahl(true, monatText)}
        </div>
      </div>
      <div className="druck-fuss">
        <button type="button" className="knopf-haupt" onClick={() => onDrucken(ganzerMonat)}>
          {t.drucken}
        </button>
        <button type="button" className="knopf-leise" onClick={onClose}>
          {t.abbrechen}
        </button>
      </div>
    </Sheet>,
    document.body,
  )
}
