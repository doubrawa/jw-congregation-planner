import { useAppDispatch } from '../app/context'
import type { MyTask } from '../data/types'
import { useT } from '../i18n/useT'

/**
 * Die Klassen, mit denen ein Bildschirm die Aktionen gestaltet — der Start
 * zeigt sie kompakt in der Zeitleiste, „Meine Aufgaben" als Pillen. Ganze
 * Klassennamen, keine Präfixe: `tests/css-klassen.test.ts` liest sie als Wörter.
 */
export interface AufgabenAktionenKlassen {
  bestaetigen: string
  bestaetigt: string
  verhindert: string
  s89: string
}

/**
 * Was man mit einer Aufgabe tun kann: bestätigen (solange sie offen ist), den
 * Stand sehen (bestätigt / verhindert) und bei Schülerteilen den S-89 öffnen.
 *
 * Stand auf dem Start und unter „Meine Aufgaben" je einmal ausgeschrieben, mit
 * derselben Fallunterscheidung und denselben Aktionen — nur die Klassen waren
 * andere.
 */
export function AufgabenAktionen({ task, klassen }: { task: MyTask; klassen: AufgabenAktionenKlassen }) {
  const dispatch = useAppDispatch()
  const { t } = useT()
  return (
    <>
      {task.status === 'offen' && (
        <button
          type="button"
          className={klassen.bestaetigen}
          onClick={() => dispatch({ type: 'confirmTask', id: task.id })}
        >
          ✓ {t.bestaetigen}
        </button>
      )}
      {task.status === 'bestätigt' && <span className={klassen.bestaetigt}>✓ {t.bestaetigt}</span>}
      {task.status === 'verhindert' && <span className={klassen.verhindert}>{t.verhindertChip}</span>}
      {task.s89 && (
        <button
          type="button"
          className={klassen.s89}
          onClick={() => task.s89 && dispatch({ type: 'openS89', payload: task.s89 })}
        >
          {t.s89Open} ›
        </button>
      )}
    </>
  )
}
