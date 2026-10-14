import { useState } from 'react'
import { useApp } from '../app/context'
import { useKalendertag } from '../app/useKalendertag'
import { Zeichen } from '../bausteine/Zeichen'
import { fromIso } from '../data/meeting-dates'
import { kommendeTermine, trolleysSortiert } from '../data/trolleys'
import { fill, useT } from '../i18n/useT'
import { EinstellZeile } from './EinstellZeile'
import { neuerTrolleyName } from './einstellungen-anzeige'
import { TrolleyBlatt } from './TrolleyBlatt'

/**
 * **Die Trolleys der Versammlung** (T121, Phase 7, Entwurf `GGruppenStandorte`;
 * am Desktop `GDesktopEinstellungen` als Tabelle): je Trolley, wo man ihn
 * abholt und wie viele Termine anstehen; ein Tipp öffnet ihn (`TrolleyBlatt`).
 *
 * „Trolley hinzufügen" legt ihn gleich an, mit der nächsten Nummer, und öffnet
 * ihn — Name, Ort und Hinweis stehen dann im Blatt.
 */
export function TrolleysKarte({ tabelle = false }: { tabelle?: boolean }) {
  const { state, dispatch } = useApp()
  const { t } = useT()
  const heute = useKalendertag()
  const [offen, setOffen] = useState<string | null>(null)
  const trolley = state.trolleys.find((x) => x.id === offen)
  const kommende = (id: string): number => kommendeTermine(state.trolleyTermine, id, fromIso(heute)).length

  const hinzufuegen = () => {
    // Die Kennung vergibt der Client (`t<uuid>`, wie im Schema beschrieben).
    const id = `t${crypto.randomUUID()}`
    dispatch({ type: 'trolleyAnlegen', trolley: { id, name: neuerTrolleyName(state.trolleys, t.privZeugnis), ort: '', hinweis: '' } })
    setOffen(id)
  }

  return (
    <section className={tabelle ? 'karte einst-karte trolleys-tabelle' : 'karte einst-karte'}>
      <h2 className="abschnitt-titel karte-titel">{t.fsTrolleysTab}</h2>
      {tabelle && state.trolleys.length > 0 && (
        <div className="einst-tabelle-kopf" aria-hidden="true">
          <span>{t.privZeugnis}</span>
          <span>{t.trolleyOrtKopf}</span>
          <span>{t.trolleyHinweisKopf}</span>
          <span>{t.trolleyKommende}</span>
        </div>
      )}
      {trolleysSortiert(state.trolleys).map((tr) =>
        tabelle ? (
          <button key={tr.id} type="button" className="einst-tabelle-zeile" onClick={() => setOffen(tr.id)}>
            <span className="einst-zeile-name" dir="auto">
              {tr.name}
            </span>
            <span dir="auto">{tr.ort}</span>
            <span dir="auto">{tr.hinweis}</span>
            <span>{kommende(tr.id)}</span>
            <Zeichen name="weiter" />
          </button>
        ) : (
          <EinstellZeile
            key={tr.id}
            name={tr.name}
            eigenerName
            unter={tr.ort ? fill(t.trolleyAbholen, { ort: tr.ort }) : undefined}
            wert={fill(t.trolleyTermineN, { n: kommende(tr.id) })}
            onTipp={() => setOffen(tr.id)}
          />
        ),
      )}
      <button type="button" className="zeile-hinzu" onClick={hinzufuegen}>
        <Zeichen name="plus" />
        {t.trolleyHinzu}
      </button>
      {trolley && <TrolleyBlatt key={trolley.id} trolley={trolley} onClose={() => setOffen(null)} />}
    </section>
  )
}
