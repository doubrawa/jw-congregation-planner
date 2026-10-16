import { useState } from 'react'
import { createPortal, flushSync } from 'react-dom'
import { useApp } from '../app/context'
import { Option } from '../bausteine/Option'
import { Sheet } from '../components/Sheet'
import { TreffpunktBogen } from '../druck/TreffpunktBogen'
import { useDruckBogen } from '../druck/useDruckBogen'
import { MonatsBogen, WochenBogen } from '../druck/ZusammenkunftBogen'
import { fill, useT } from '../i18n/useT'
import { monatDerWoche, monatsName, wochenDesMonats, wochenZeitraum } from './druck'
import { DruckKnopf } from './DruckKnopf'

/**
 * **Drucken: diese Woche oder der ganze Monat** (T105; T121, Entwurf
 * `GDrucken`).
 *
 * Für den Aushang will der Planer den Monat am Stück — **wahlweise**, wie der
 * Betreiber es gesagt hat, nicht statt der Woche. Deshalb öffnet der Knopf ein
 * Blatt mit der Wahl, statt sofort zu drucken. Gedruckt wird ein Bogen (Phase
 * 9): bei den Zusammenkünften der Wochen- oder Monatsbogen, im Predigtdienst
 * der Bogen der Treffpunkte.
 *
 * Das Blatt hängt per Portal am Dokument: Der Knopf liegt im Wochenstreifen,
 * und der wird zum Wischen per `transform` verschoben — ein festes Blatt darin
 * säße nicht mehr am Bildschirm, sondern am Streifen.
 *
 * Ohne Monat (die Woche trägt kein gültiges Datum) druckt der Knopf gleich die
 * Woche — eine Wahl mit einem einzigen Eintrag wäre ein Tipp zu viel.
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
  const { drucken, bogen } = useDruckBogen()
  const wi = state.week
  const week = state.weeks[wi]
  const monat = monatDerWoche(week)
  const [offen, setOffen] = useState(false)
  const treffpunkte = state.tab === 'fs'

  const woche = () =>
    drucken(
      treffpunkte ? (
        <TreffpunktBogen wochen={[wi]} zeitraum={week ? wochenZeitraum(week, state.lang, zeitraum ?? '') : (zeitraum ?? '')} />
      ) : (
        <WochenBogen wi={wi} />
      ),
    )
  const ganzerMonat = (m: string) =>
    drucken(
      treffpunkte ? (
        <TreffpunktBogen wochen={wochenDesMonats(state.weeks, m)} zeitraum={monatsName(m, state.lang)} />
      ) : (
        <MonatsBogen monat={m} />
      ),
    )

  if (!monat)
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
        <DruckWahlBlatt
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

/**
 * Das Blatt mit der Wahl — die Woche ist vorgewählt. Nicht zu verwechseln mit
 * `druck/DruckBlatt` (dem A4-Blatt des Ausdrucks).
 */
function DruckWahlBlatt({
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
