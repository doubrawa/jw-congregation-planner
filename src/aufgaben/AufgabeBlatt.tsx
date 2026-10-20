import { useApp } from '../app/context'
import { Saal } from '../bausteine/Saal'
import { Sheet } from '../components/Sheet'
import type { MyTask } from '../data/types'
import { aufgabenLabel, aufgabenSprache, aufgabenZeilen, useT } from '../i18n/useT'
import { AufgabeHandlungen } from './AufgabeKarte'
import { aufgabeWann } from './aufgabe-anzeige'
import { useSaal } from './useSaal'
import './aufgaben.css'

/**
 * **Eine eigene Aufgabe im Blatt** — geöffnet aus einer Zeile auf dem Start,
 * unter „Meine Aufgaben" oder aus einer Mitteilung. Dieselben Zeilen und
 * Knöpfe wie die große Karte (`AufgabeKarte`), nur für jede Aufgabe, nicht
 * bloß die nächste. Absagen öffnet das Absage-Blatt an seiner Stelle.
 */
export function AufgabeBlatt({ task }: { task: MyTask }) {
  const { state, dispatch } = useApp()
  const i18n = useT()
  const saal = useSaal(task)
  const { titel, unter, titelIstPunkt } = aufgabenZeilen(task, i18n)
  return (
    <Sheet
      label={aufgabenLabel(task, i18n)}
      eyebrow={<div className="aufgabe-wann">{aufgabeWann(task, state.lang, i18n)}</div>}
      // Der Titel trennt (`.sheet-title`): Steht oben der Programmpunkt, nach
      // der Sprache des Programms, sonst trägt die Rolle die des Lesers (T128).
      title={titelIstPunkt ? <span lang={aufgabenSprache(task, state.lang, state.congLang)}>{titel}</span> : titel}
      sub={unter || undefined}
      onClose={() => dispatch({ type: 'closeMyTask' })}
    >
      <div className="sheet-inhalt">
        {saal && <Saal lagen={saal.lagen} label={saal.label} />}
        <AufgabeHandlungen task={task} />
      </div>
    </Sheet>
  )
}
