import { useId, useState } from 'react'
import { createPortal } from 'react-dom'
import { useApp } from '../app/context'
import { useKalendertag } from '../app/useKalendertag'
import { BlattFeld } from '../bausteine/BlattFeld'
import { EntfernenKnopf } from '../components/EntfernenKnopf'
import { Sheet } from '../components/Sheet'
import { fromIso } from '../data/meeting-dates'
import { kommendeTermine } from '../data/trolleys'
import type { Trolley } from '../data/types'
import { fill, useT } from '../i18n/useT'
import { zuDenTrolleys } from '../trolleys/trolley-anzeige'
import { trolleyFehlerText, useTrolleyAktion } from '../trolleys/useTrolleyAktion'
import { EinstellZeile } from './EinstellZeile'
import { doppelterName } from './einstellungen-anzeige'

/** Was im Blatt getippt wird — es gilt erst beim Schließen. */
type Eingabe = Pick<Trolley, 'name' | 'ort' | 'hinweis'>

/**
 * **Ein Trolley** (T121, Phase 7, Entwurf `GTrolley`): sein Name, wo man ihn
 * abholt, ein Hinweis (freiwillig). Alle drei gelten beim Schließen, wie bei
 * der Gruppe — ein halb getippter Name stünde sonst schon im Plan der anderen.
 * Leer oder doppelt bleibt der alte Name, und ein Hinweis sagt warum.
 *
 * Darunter, wie viele Termine anstehen (ein Tipp führt zu den Trolleys), was
 * beim Entfernen mitgeht, und „Trolley entfernen" mit Rückfrage. Entfernt wird
 * über die Function `trolley`: Sie sagt allen Bescheid, die für einen
 * kommenden Termin eingetragen sind.
 */
export function TrolleyBlatt({ trolley, onClose }: { trolley: Trolley; onClose: () => void }) {
  const { state, dispatch } = useApp()
  const { t } = useT()
  const heute = useKalendertag()
  const aktion = useTrolleyAktion()
  const [eingabe, setEingabe] = useState<Eingabe>({ name: trolley.name, ort: trolley.ort, hinweis: trolley.hinweis })
  const [fehlerEntfernen, setFehlerEntfernen] = useState<string | null>(null)
  const fehlerId = useId()
  const name = eingabe.name.trim()
  const dublette = doppelterName(state.trolleys, trolley.id, name)
  // Was beim Schließen statt des neuen Namens gilt — und schon am Feld steht.
  const fehler =
    name === trolley.name ? null : name === '' ? t.toastNameLeer : dublette ? fill(t.toastNameNichtGeaendert, { name: dublette.name }) : null
  const kommende = kommendeTermine(state.trolleyTermine, trolley.id, fromIso(heute)).length

  const schliessen = () => {
    const patch: Partial<Eingabe> = {}
    if (name !== trolley.name) {
      if (fehler) dispatch({ type: 'showToast', text: fehler })
      else patch.name = name
    }
    if (eingabe.ort.trim() !== trolley.ort) patch.ort = eingabe.ort.trim()
    if (eingabe.hinweis.trim() !== trolley.hinweis) patch.hinweis = eingabe.hinweis.trim()
    if (Object.keys(patch).length > 0) dispatch({ type: 'trolleyAendern', id: trolley.id, patch })
    onClose()
  }

  const entfernen = async () => {
    const grund = await aktion.entfernen(trolley.id)
    if (grund) setFehlerEntfernen(trolleyFehlerText(grund, t))
    else onClose()
  }

  const textFeld = (feld: keyof Eingabe, extra: { 'aria-invalid'?: true; 'aria-describedby'?: string } = {}) => (
    <input
      className="feld"
      type="text"
      dir="auto"
      autoComplete="off"
      value={eingabe[feld]}
      onChange={(e) => setEingabe({ ...eingabe, [feld]: e.target.value })}
      {...extra}
    />
  )

  return createPortal(
    <Sheet
      variante="lang"
      label={trolley.name}
      eyebrow={<div className="sheet-marke">{t.privZeugnis}</div>}
      title={<span dir="auto">{trolley.name}</span>}
      onClose={schliessen}
    >
      <div className="sheet-inhalt blatt-felder">
        <BlattFeld marke={t.nameLbl}>
          {textFeld('name', fehler ? { 'aria-invalid': true, 'aria-describedby': fehlerId } : {})}
        </BlattFeld>
        {fehler && (
          /* `dir="auto"`: Der Hinweis nennt den Namen des anderen Trolleys — frei getippt. */
          <p id={fehlerId} className="feld-fehler" role="alert" dir="auto">
            {fehler}
          </p>
        )}
        <BlattFeld marke={t.trolleyOrtLbl}>{textFeld('ort')}</BlattFeld>
        <BlattFeld marke={t.trolleyHinweisLbl}>{textFeld('hinweis')}</BlattFeld>
        <EinstellZeile
          name={t.trolleyKommende}
          wert={String(kommende)}
          onTipp={() => {
            schliessen()
            zuDenTrolleys(dispatch)
          }}
        />
        {kommende > 0 && (
          <section className="blatt-folgen" aria-label={t.trolleyWennEntfernt}>
            <h3 className="feld-marke">{t.trolleyWennEntfernt}</h3>
            <p>{t.trolleyDelTermine}</p>
            <p>{t.trolleyDelBescheid}</p>
          </section>
        )}
        {fehlerEntfernen && (
          <p className="feld-fehler" role="alert">
            {fehlerEntfernen}
          </p>
        )}
      </div>
      <div className="sheet-fuss-ende">
        <EntfernenKnopf className="knopf-umriss knopf-entfernen" text={t.trolleyEntfernen} onEntfernen={() => void entfernen()} />
        <button type="button" className="knopf-haupt" onClick={schliessen}>
          {t.fertig}
        </button>
      </div>
    </Sheet>,
    document.body,
  )
}
