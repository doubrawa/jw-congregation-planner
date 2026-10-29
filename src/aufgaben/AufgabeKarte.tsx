import { useApp } from '../app/context'
import { useKalendertag } from '../app/useKalendertag'
import { Punkt } from '../bausteine/Punkt'
import { Saal } from '../bausteine/Saal'
import { displayName } from '../data/helpers'
import { anfrageZu, tauschbar } from '../data/tausch'
import type { MyTask } from '../data/types'
import { aufgabenTitelSprache, aufgabenZeilen, fill, useT } from '../i18n/useT'
import { aufgabeWann } from './aufgabe-anzeige'
import { useSaal } from './useSaal'
import './aufgaben.css'

/**
 * **Die nächste eigene Aufgabe, groß** (T121) — oben auf dem Start und unter
 * „Meine Aufgaben": wann, was, mit wem, und gleich darunter Bestätigen oder
 * Absagen. Über einer Aufgabe in einer Zusammenkunft steht der Saal mit dem
 * eigenen Platz (`saal`).
 */
export function AufgabeKarte({ task, saal = false }: { task: MyTask; saal?: boolean }) {
  const { state } = useApp()
  const i18n = useT()
  const besetzung = useSaal(saal ? task : undefined)
  const { titel, unter } = aufgabenZeilen(task, i18n)
  // Der Titel trennt (`.aufgabe-titel`): Steht oben der Programmpunkt, nach der
  // Sprache des Programms, sonst trägt die Rolle die des Lesers — wie im Blatt.
  const titelSprache = aufgabenTitelSprache(task, state.lang, state.congLang)
  return (
    <section className={besetzung ? 'karte karte--held aufgabe-karte mit-saal' : 'karte karte--held aufgabe-karte'}>
      {/* Je Aufgabe ein eigener Saal: Wechselt die Aufgabe (die nächste ist über
          Nacht eine andere), füllt sich ihr Platz nicht, als hätte man eben
          bestätigt — der Übergang gehört nur zum Bestätigen. */}
      {besetzung && <Saal key={task.id} lagen={besetzung.lagen} label={besetzung.label} du={besetzung.du} />}
      <div className="aufgabe-wann">
        <Punkt art="du" />
        <span>{aufgabeWann(task, state.lang, i18n)}</span>
      </div>
      <h2 className="aufgabe-titel" lang={titelSprache}>{titel}</h2>
      {unter && <div className="aufgabe-unter">{unter}</div>}
      <AufgabeHandlungen task={task} />
    </section>
  )
}

/**
 * Was man mit einer eigenen Aufgabe tun kann, je nach Stand: bestätigen oder
 * absagen; ist sie bestätigt, doch absagen; ist sie abgesagt, doch bestätigen.
 * Bei einem Hilfsdienst daneben „Tauschen" (T153), wo es geht — offline nicht.
 * Daneben der S-89, wo es einen gibt.
 */
export function AufgabeHandlungen({ task }: { task: MyTask }) {
  const { state, dispatch } = useApp()
  const { t } = useT()
  const heute = useKalendertag()
  const bestaetigen = () => dispatch({ type: 'confirmTask', id: task.id })
  const s89 = task.s89
  const kannTauschen = state.staleAt === null && tauschbar(task, state.services, state.sentLog)
  const angefragt = anfrageZu(state.tauschAnfragen, task.id, heute, state.weeks)
  const gefragt = angefragt && state.persons.find((p) => p.id === angefragt.an)
  return (
    <div className="aufgabe-handlungen">
      {task.status === 'offen' && (
        <button type="button" className="knopf-haupt" onClick={bestaetigen}>
          {t.bestaetigen}
        </button>
      )}
      {task.status === 'bestätigt' && <span className="aufgabe-stand">{t.bestaetigt}</span>}
      {task.status === 'verhindert' && <span className="aufgabe-stand is-problem">{t.verhindertChip}</span>}
      {task.status === 'verhindert' ? (
        <button type="button" className="knopf-umriss" onClick={bestaetigen}>
          {t.dochBestaetigen}
        </button>
      ) : (
        <button type="button" className="knopf-umriss" onClick={() => dispatch({ type: 'openAbsage', id: task.id })}>
          {t.kannNicht}
        </button>
      )}
      {kannTauschen && (
        <button type="button" className="knopf-umriss" onClick={() => dispatch({ type: 'openTausch', id: task.id })}>
          {t.tauschAktion}
        </button>
      )}
      {s89 && (
        <button type="button" className="verweis-leise aufgabe-s89" onClick={() => dispatch({ type: 'openS89', payload: s89 })}>
          S-89
        </button>
      )}
      {gefragt && <span className="klein-text aufgabe-tausch">{fill(t.tauschAngefragtBei, { name: displayName(gefragt) })}</span>}
    </div>
  )
}
