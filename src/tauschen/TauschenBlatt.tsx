import { useEffect, useState } from 'react'
import { useApp } from '../app/context'
import { useKalendertag } from '../app/useKalendertag'
import { AngebotText } from '../aufgaben/Angebot'
import { aufgabeWann } from '../aufgaben/aufgabe-anzeige'
import { Punkt } from '../bausteine/Punkt'
import { Sheet } from '../components/Sheet'
import { displayName } from '../data/helpers'
import { anfrageZu } from '../data/tausch'
import type { MyTask } from '../data/types'
import { aufgabenLabel, fill, useT } from '../i18n/useT'
import type { TauschAngebot } from '../lib/tauschen'
import { usePlatzZeile } from './usePlatzZeile'
import { tauschFehlerText, useTauschen, useTauschFehler } from './useTauschen'
import './tauschen.css'

/**
 * **Tauschen** (T153): der eigene Hilfsdienst, und darunter, mit wem er
 * getauscht werden könnte — wer denselben Dienst an einem anderen Tag hat, an
 * beiden Tagen kann und antworten kann (das rechnet der Server). „Anfragen"
 * schickt die Anfrage; solange sie läuft, steht hier, bei wem, und sie lässt
 * sich zurückziehen. Erst die Zusage des Gefragten ändert den Plan.
 */
export function TauschenBlatt({ task }: { task: MyTask }) {
  const { state, dispatch } = useApp()
  const i18n = useT()
  const { t } = i18n
  const heute = useKalendertag()
  const tausch = useTauschen()
  const platzZeile = usePlatzZeile()
  const offen = anfrageZu(state.tauschAnfragen, task.id, heute, state.weeks)
  const [angebote, setAngebote] = useState<TauschAngebot[] | null>(null)
  const { fehler, setFehler, ausfuehren } = useTauschFehler()
  const { angebote: angeboteLaden } = tausch

  // Die Angebote fragt das Blatt beim Server, sobald keine Anfrage läuft —
  // beim Öffnen und nach dem Zurückziehen. Eine Antwort, die erst nach dem
  // Schließen kommt, fällt weg.
  useEffect(() => {
    if (offen) return
    let aktuell = true
    void angeboteLaden(task.id).then((erg) => {
      if (!aktuell) return
      setAngebote(erg.ok ? erg.wert : [])
      setFehler(erg.ok ? null : tauschFehlerText(erg.fehler, t))
    })
    return () => {
      aktuell = false
    }
  }, [angeboteLaden, task.id, offen, t, setFehler])

  const nameVon = (pid: string): string => {
    const p = state.persons.find((x) => x.id === pid)
    return p ? displayName(p) : ''
  }

  return (
    <Sheet
      label={t.tauschAktion}
      title={t.tauschAktion}
      onClose={() => dispatch({ type: 'closeTausch' })}
    >
      <div className="sheet-inhalt tausch-blatt">
        <section className="tausch-abschnitt">
          <h3 className="tausch-kopf">{t.tauschGibstAb}</h3>
          <p className="tausch-platz">{`${aufgabenLabel(task, i18n)} · ${aufgabeWann(task, state.lang, i18n)}`}</p>
        </section>
        {offen ? (
          <section className="tausch-abschnitt">
            <p className="tausch-angefragt">{fill(t.tauschAngefragtBei, { name: nameVon(offen.an) })}</p>
            <div className="aufgabe-handlungen">
              <button type="button" className="knopf-umriss" disabled={tausch.laeuft} onClick={() => ausfuehren(() => tausch.zurueckziehen(offen))}>
                {t.tauschZurueckziehen}
              </button>
            </div>
          </section>
        ) : (
          <section className="tausch-abschnitt">
            <h3 className="tausch-kopf">{t.tauschUebernimmstDafuer}</h3>
            {angebote === null && <p className="klein-text">{t.tauschSucht}</p>}
            {angebote?.length === 0 && !fehler && <p className="klein-text">{t.tauschNiemand}</p>}
            {angebote?.map((a) => {
              const zeile = platzZeile(a.nimmt)
              if (!zeile) return null
              return (
                <div key={a.nimmt} className="aufgaben-zeile">
                  <Punkt art="offen" />
                  <AngebotText titel={nameVon(a.personId)} wann={zeile} schonHeute={[]} />
                  <button type="button" className="knopf-pille" disabled={tausch.laeuft} onClick={() => ausfuehren(() => tausch.anfragen(task.id, a))}>
                    {t.tauschAnfragen}
                  </button>
                </div>
              )
            })}
          </section>
        )}
        {fehler && (
          <p className="feld-fehler" role="alert">
            {fehler}
          </p>
        )}
        <p className="klein-text">{t.tauschHinweis}</p>
      </div>
    </Sheet>
  )
}
