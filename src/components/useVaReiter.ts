import { useMemo } from 'react'
import { useApp } from '../app/context'
import { useKalendertag } from '../app/useKalendertag'
import { vaKonflikte, vaReiterSichtbar, type VaKonflikt } from '../data/auswaerts'
import { fromIso } from '../data/meeting-dates'

/**
 * Der Reiter „Redner auswärts" der Zusammenkünfte (T120, Phase 4): Steht er
 * da, und ist er gewählt? Eine Antwort für die Reiterleiste und die beiden
 * Bildschirme — ist er gewählt, aber nicht (mehr) da, zeigen sie die
 * Zusammenkunft, wie beim Predigtdienst (`aktiverFsBereich`).
 */
export function useVaReiter(): { sichtbar: boolean; aktiv: boolean } {
  const { state } = useApp()
  const tag = useKalendertag()
  const sichtbar = vaReiterSichtbar({
    planen: state.screen === 'planen',
    planner: state.planner,
    vortraege: state.auswaerts,
    heute: fromIso(tag),
  })
  return { sichtbar, aktiv: sichtbar && state.tab === 'va' }
}

/**
 * Die möglichen Konflikte der Vorträge auswärts — einmal gerechnet für die
 * Zahl am Reiter, das Banner und die Zeilen darunter. Dieselbe Rechnung zählt
 * die Planungs-Karte auf Start (`vaStand`).
 */
export function useVaKonflikte(): VaKonflikt[] {
  const { state } = useApp()
  const tag = useKalendertag()
  const { auswaerts, weeks, persons, absences, services, congregation } = state
  return useMemo(
    () =>
      vaKonflikte({
        vortraege: auswaerts,
        weeks,
        persons,
        absences,
        services,
        zeiten: congregation.times,
        heute: fromIso(tag),
      }),
    [auswaerts, weeks, persons, absences, services, congregation.times, tag],
  )
}
