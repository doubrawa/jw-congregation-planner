import { useState } from 'react'
import { createPortal, flushSync } from 'react-dom'
import { useApp } from '../app/context'
import { Option } from '../bausteine/Option'
import { Sheet } from '../components/Sheet'
import { useDruckBogen } from '../druck/useDruckBogen'
import { MonatsBogen, WochenBogen } from '../druck/ZusammenkunftBogen'
import { fill, useT } from '../i18n/useT'
import { druckKennzeichen, monatDerWoche, monatsName } from './druck'
import { DruckKnopf } from './DruckKnopf'
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
  const monatDruckenFs = useMonatDrucken()
  const { drucken, bogen } = useDruckBogen()
  const monat = monatDerWoche(state.weeks[state.week])
  const [offen, setOffen] = useState(false)
  // Die Zusammenkünfte haben ihre Bögen (Phase 9); die Treffpunkte drucken
  // bis auf Weiteres den Bildschirm.
  const zusammenkunft = state.tab !== 'fs'
  const wi = state.week

  const woche = () => {
    if (zusammenkunft) {
      drucken(<WochenBogen wi={wi} />)
      return
    }
    druckKennzeichen(null) // die Woche ist der Normalfall — kein Kennzeichen
    window.print()
  }
  const ganzerMonat = (m: string) => {
    if (zusammenkunft) drucken(<MonatsBogen monat={m} />)
    else monatDruckenFs?.(m)
  }
  const mitMonat = monat !== null && (zusammenkunft || monatDruckenFs !== null)

  if (!mitMonat)
    return (
      <>
        <DruckKnopf mitText={mitText} onClick={woche} />
        {bogen}
      </>
    )

  return (
    <>
      <DruckKnopf mitText={mitText} onClick={() => setOffen(true)} />
      {offen && (
        <DruckBlatt
          zeitraum={zeitraum}
          erklaerung={erklaerung}
          monatText={fill(t.druckMonat, { monat: monatsName(monat, state.lang) })}
          onClose={() => setOffen(false)}
          onDrucken={(monatGewaehlt) => {
            // Erst das Blatt weg, dann drucken: Der Druckdialog nimmt den Stand
            // auf, der in diesem Moment im DOM steht.
            flushSync(() => setOffen(false))
            if (monatGewaehlt) ganzerMonat(monat)
            else woche()
          }}
        />
      )}
      {bogen}
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

  return createPortal(
    <Sheet label={t.drucken} title={t.drucken} sub={erklaerung} onClose={onClose}>
      <div className="sheet-inhalt">
        <div className="druck-optionen" role="radiogroup" aria-label={t.drucken}>
          <Option an={!ganzerMonat} titel={t.druckWoche} unter={zeitraum} onWahl={() => setGanzerMonat(false)} />
          <Option an={ganzerMonat} titel={monatText} onWahl={() => setGanzerMonat(true)} />
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
