import { useMemo } from 'react'
import { useApp } from './context'
import { buildAbsences, type AbsenceSet } from '../data/absence'

/**
 * Die Abwesenheiten der Versammlung in der Form, in der Planung und Anzeige
 * fragen: „fehlt Person X in Woche Y, Zusammenkunft Z?".
 *
 * Einmal je Zustandsänderung gerechnet statt in jeder Komponente von Hand — und
 * an einer Stelle, damit Zuteilungs-Sheet, Konflikthinweise und Dashboard nicht
 * versehentlich auseinanderlaufen.
 */
export function useAbwesend(): AbsenceSet {
  const { state } = useApp()
  const { absences, weeks, fsBase, congregation } = state
  return useMemo(
    () => buildAbsences(absences, weeks, fsBase, congregation.meetings),
    [absences, weeks, fsBase, congregation.meetings],
  )
}
