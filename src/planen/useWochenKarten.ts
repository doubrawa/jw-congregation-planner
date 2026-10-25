import { useMemo } from 'react'
import { useApp } from '../app/context'
import { useAbwesend } from '../app/useAbwesend'
import { useKalendertag } from '../app/useKalendertag'
import { fromIso } from '../data/meeting-dates'
import { wochenKarten, type WochenKarte } from './wochen-uebersicht'

/**
 * **Die Karten der Wochen** — für die Liste (`WochenListe`) und für die Karte
 * „Zusammenkünfte" auf der Wahl von „Planung" (T144), die ihre Probleme
 * zusammenzählt.
 *
 * Gemerkt, weil teuer und der Anlass häufig: je Woche Konflikte, Engpässe,
 * Versand-Vorschau und Zusagen über alle Plätze — für jede geladene Woche.
 */
export function useWochenKarten(): WochenKarte[] {
  const { state } = useApp()
  const abwesend = useAbwesend()
  // Der Tag gehört zu den Abhängigkeiten: Am Montag rückt die Liste weiter.
  const tag = useKalendertag()
  // Offline geht nichts hinaus — dann steht auch nirgends „Bereit zum Senden".
  const sendenMoeglich = state.staleAt === null
  return useMemo(
    () =>
      wochenKarten(
        {
          weeks: state.weeks,
          fsWeeks: state.fsWeeks,
          persons: state.persons,
          services: state.services,
          absences: state.absences,
          abwesend,
          confirmations: state.confirmations,
          persoenlich: state.persoenlich,
          sentLog: state.sentLog,
          zeiten: state.congregation.times,
          sendenMoeglich,
        },
        fromIso(tag),
      ),
    [
      state.weeks,
      state.fsWeeks,
      state.persons,
      state.services,
      state.absences,
      abwesend,
      state.confirmations,
      state.persoenlich,
      state.sentLog,
      state.congregation.times,
      sendenMoeglich,
      tag,
    ],
  )
}
