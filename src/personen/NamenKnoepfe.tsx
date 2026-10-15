import { useApp } from '../app/context'
import { listName } from '../data/helpers'
import type { Person } from '../data/types'

/**
 * Namen als Knöpfe: Ein Tipp öffnet die Person — in einem Hinweis über der
 * Personenliste die, bei der sich die Ursache beheben lässt, in „Links senden"
 * die, um die es geht. Chips statt Zeilen, damit auch eine lange Liste nicht
 * alles darunter unter sich begräbt.
 *
 * `onGewaehlt`: Steht die Liste in einem Blatt, schließt es sich dabei — am
 * Desktop stünde es sonst über der eben geöffneten Person.
 */
export function NamenKnoepfe({ personen, onGewaehlt }: { personen: readonly Person[]; onGewaehlt?: () => void }) {
  const { dispatch } = useApp()
  return (
    <div className="personen-namen">
      {personen.map((person) => (
        <button
          key={person.id}
          type="button"
          className="personen-name-knopf"
          dir="auto"
          onClick={() => {
            dispatch({ type: 'selectPerson', id: person.id })
            onGewaehlt?.()
          }}
        >
          {listName(person)}
        </button>
      ))}
    </div>
  )
}
