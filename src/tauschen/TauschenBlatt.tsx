import { useEffect, useState } from 'react'
import { useApp } from '../app/context'
import { useKalendertag } from '../app/useKalendertag'
import { AngebotText } from '../aufgaben/Angebot'
import { aufgabeWann } from '../aufgaben/aufgabe-anzeige'
import { Punkt } from '../bausteine/Punkt'
import { Sheet } from '../components/Sheet'
import { useZweiTipp } from '../components/useZweiTipp'
import { nameVon } from '../data/helpers'
import { anfrageZu } from '../data/tausch'
import type { MyTask } from '../data/types'
import { aufgabenLabel, fill, useT } from '../i18n/useT'
import type { TauschAngebot } from '../lib/tauschen'
import { usePlatzZeile } from './usePlatzZeile'
import { tauschFehlerText, useTauschen, useTauschFehler } from './useTauschen'
import './tauschen.css'

/**
 * **Tauschen** (T153): der eigene Hilfsdienst, und darunter, mit wem er
 * getauscht werden könnte — wer denselben Dienst an einem anderen Tag hat und
 * an beiden Tagen kann (das rechnet der Server). „Anfragen" schickt die
 * Anfrage; solange sie läuft, steht hier, bei wem, und sie lässt sich
 * zurückziehen. Erst die Zusage des Gefragten ändert den Plan. Wer kein Konto
 * hat, sieht keine Anfrage: Mit ihm tauscht man nach mündlicher Absprache
 * gleich (`DirektKnopf`, 30.10.2026).
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
            <p className="tausch-angefragt">{fill(t.tauschAngefragtBei, { name: nameVon(state.persons, offen.an) })}</p>
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
                  <AngebotText
                    titel={nameVon(state.persons, a.personId)}
                    wann={zeile}
                    schonHeute={[]}
                    hinweis={a.konto ? undefined : t.tauschOhneKonto}
                  />
                  {a.konto ? (
                    <button type="button" className="knopf-pille" disabled={tausch.laeuft} onClick={() => ausfuehren(() => tausch.anfragen(task.id, a))}>
                      {t.tauschAnfragen}
                    </button>
                  ) : (
                    <DirektKnopf gesperrt={tausch.laeuft} onTauschen={() => ausfuehren(() => tausch.direkt(task.id, a))} />
                  )}
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
        {!offen && angebote?.some((a) => !a.konto) && <p className="klein-text">{t.tauschHinweisOhneKonto}</p>}
      </div>
    </Sheet>
  )
}

/**
 * „Tauschen" mit jemandem ohne Konto (30.10.2026): Er sieht keine Anfrage, die
 * beiden sprechen sich mündlich ab. Der erste Tipp fragt „Abgesprochen?", erst
 * der zweite tauscht — wie beim Löschen (`useZweiTipp`), aber in Minze statt
 * Rot: Es geht nichts verloren. Eigener Baustein, weil jede Zeile ihren
 * eigenen Zustand braucht.
 */
function DirektKnopf({ gesperrt, onTauschen }: { gesperrt: boolean; onTauschen: () => void }) {
  const { t } = useT()
  const knopf = useZweiTipp(onTauschen)
  return (
    <button
      type="button"
      className={knopf.armed ? 'knopf-pille knopf-pille--akzent' : 'knopf-pille'}
      disabled={gesperrt}
      onClick={knopf.onClick}
      onBlur={knopf.onBlur}
    >
      {knopf.armed ? t.tauschDirektSicher : t.tauschAktion}
    </button>
  )
}
