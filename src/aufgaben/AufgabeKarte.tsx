import { useApp } from '../app/context'
import { Punkt } from '../bausteine/Punkt'
import { Saal } from '../bausteine/Saal'
import type { MyTask } from '../data/types'
import { aufgabenZeilen, useT } from '../i18n/useT'
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
  return (
    <section className={besetzung ? 'karte karte--held aufgabe-karte mit-saal' : 'karte karte--held aufgabe-karte'}>
      {besetzung && <Saal lagen={besetzung.lagen} label={besetzung.label} />}
      <div className="aufgabe-wann">
        <Punkt art="du" />
        <span>{aufgabeWann(task, state.lang, i18n)}</span>
      </div>
      <h2 className="aufgabe-titel">{titel}</h2>
      {unter && <div className="aufgabe-unter">{unter}</div>}
      <AufgabeHandlungen task={task} />
    </section>
  )
}

/**
 * Was man mit einer eigenen Aufgabe tun kann, je nach Stand: bestätigen oder
 * absagen; ist sie bestätigt, doch absagen; ist sie abgesagt, doch bestätigen.
 * Daneben der S-89, wo es einen gibt.
 */
export function AufgabeHandlungen({ task }: { task: MyTask }) {
  const { dispatch } = useApp()
  const { t } = useT()
  const bestaetigen = () => dispatch({ type: 'confirmTask', id: task.id })
  const s89 = task.s89
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
      {s89 && (
        <button type="button" className="verweis-leise aufgabe-s89" onClick={() => dispatch({ type: 'openS89', payload: s89 })}>
          S-89
        </button>
      )}
    </div>
  )
}
