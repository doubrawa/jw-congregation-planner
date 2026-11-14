import { useMemo } from 'react'
import { nichtMehrPassend, type KuenftigerPlatz } from '../data/freiwerden'
import type { Person } from '../data/types'
import { useApp } from './context'

/** Ohne Person keine Plätze — dieselbe leere Liste bei jedem Aufruf. */
const KEINE: readonly KuenftigerPlatz[] = []

/**
 * **Die künftigen Plätze einer Person** (T181, T182), nach Termin — was frei
 * würde, wenn sie ginge (`nichtMehrPassend` ohne Person danach).
 *
 * Gefragt beim Entfernen (`PersonDetail`) und beim Eintragen einer Abwesenheit
 * für eine andere Person (`AbwesenheitBlatt`). Neu gerechnet wird nur, wenn
 * sich eines der Felder ändert, aus denen die Liste entsteht.
 */
export function useKuenftigePlaetze(person: Person | undefined): readonly KuenftigerPlatz[] {
  const { state } = useApp()
  const { weeks, fsWeeks, services, persons, congregation, confirmations } = state
  return useMemo(
    () => (person ? nichtMehrPassend({ weeks, fsWeeks, services, persons, congregation, confirmations }, person, null) : KEINE),
    [person, weeks, fsWeeks, services, persons, congregation, confirmations],
  )
}
