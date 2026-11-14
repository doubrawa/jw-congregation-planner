import { useState, type ReactNode } from 'react'
import { useApp } from '../app/context'
import { nichtMehrPassend, type KuenftigerPlatz } from '../data/freiwerden'
import type { Person } from '../data/types'
import { FreiwerdenBlatt } from './FreiwerdenBlatt'

/** Eine Änderung, die erst nach der Frage gilt. */
interface Offen {
  person: Person
  patch: Partial<Person>
  plaetze: KuenftigerPlatz[]
}

/**
 * **Eine Person ändern — und fragen, wenn künftige Plätze nicht mehr passen**
 * (T182).
 *
 * `aendern` gilt sofort wie `updatePerson`, solange die Person danach an jedem
 * ihrer künftigen Plätze noch passt. Sonst hält es die Änderung an und zeigt
 * `blatt`: die Plätze, dazu freigeben, stehen lassen oder abbrechen. Der
 * Aufrufer setzt `blatt` irgendwo hin; es liegt über dem Blatt, in dem er
 * ändert (Aufgabenbereiche, Person bearbeiten, ein Hilfsdienst).
 *
 * Ein Haken, keine Sperre: Wer einschaltet, verliert nie einen Platz — die
 * Frage kommt nur, wo eine Änderung einen nimmt.
 */
export function useAendernMitPlaetzen(): {
  aendern: (person: Person, patch: Partial<Person>) => void
  blatt: ReactNode
} {
  const { state, dispatch } = useApp()
  const [offen, setOffen] = useState<Offen | null>(null)

  const aendern = (person: Person, patch: Partial<Person>): void => {
    const plaetze = nichtMehrPassend(state, person, { ...person, ...patch })
    if (plaetze.length === 0) dispatch({ type: 'updatePerson', id: person.id, patch })
    else setOffen({ person, patch, plaetze })
  }

  const ausfuehren = (freigeben: boolean): void => {
    if (!offen) return
    dispatch({ type: 'updatePerson', id: offen.person.id, patch: offen.patch })
    if (freigeben) {
      dispatch({ type: 'plaetzeFreigeben', personId: offen.person.id, keys: offen.plaetze.map((p) => p.key) })
    }
    setOffen(null)
  }

  const blatt = offen && (
    <FreiwerdenBlatt
      art="aendern"
      person={offen.person}
      plaetze={offen.plaetze}
      ueberBlatt
      onFreigeben={() => ausfuehren(true)}
      onStehenLassen={() => ausfuehren(false)}
      onClose={() => setOffen(null)}
    />
  )
  return { aendern, blatt }
}
