import { useMemo } from 'react'
import { useApp } from './context'
import { buildAbsences, buildAuswaerts, nichtVerfuegbar, type AbsenceSet } from '../data/absence'

/**
 * Wer an einer Zusammenkunft **nicht zur Verfügung** steht, in der Form, in der
 * Planung und Anzeige fragen: „fehlt Person X in Woche Y, Zusammenkunft Z?".
 * Abwesende und — seit T120, Phase 4 — wer an dem Tag als Redner in einer
 * anderen Versammlung spricht (`useAuswaerts`).
 *
 * Einmal je Zustandsänderung gerechnet statt in jeder Komponente von Hand — und
 * an einer Stelle, damit Zuteilungs-Sheet, Konflikthinweise und Dashboard nicht
 * versehentlich auseinanderlaufen.
 */
export function useAbwesend(): AbsenceSet {
  const { state } = useApp()
  const { absences, weeks, congregation } = state
  const auswaerts = useAuswaerts()
  return useMemo(
    () => nichtVerfuegbar(buildAbsences(absences, weeks, congregation.times), auswaerts),
    [absences, weeks, congregation.times, auswaerts],
  )
}

/**
 * Nur die Redner auswärts — für das Konflikt-Banner, das den Grund nennt
 * („hält an diesem Tag einen Vortrag auswärts" statt „abwesend").
 */
export function useAuswaerts(): AbsenceSet {
  const { state } = useApp()
  const { auswaerts, weeks, congregation } = state
  return useMemo(() => buildAuswaerts(auswaerts, weeks, congregation.times), [auswaerts, weeks, congregation.times])
}
