import { useMemo } from 'react'
import { useApp } from '../app/context'
import { besuchsLage, type BesuchsLage } from '../data/gruppenbesuche'

/**
 * Die Lage der Gruppenbesuche (`besuchsLage`) — gemerkt, solange sich ihre vier
 * Felder nicht ändern. Planen, Ansehen und die Planungs-Karte rechnen damit;
 * mit dem ganzen Zustand als Eingabe hätte jede Zeile davon einen anderen
 * Abhängigkeitsvermerk gebraucht als das, was sie wirklich liest.
 */
export function useBesuchsLage(): BesuchsLage {
  const { state } = useApp()
  const { weeks, fsWeeks, fsRules, absences } = state
  return useMemo(() => besuchsLage({ weeks, fsWeeks, fsRules, absences }), [weeks, fsWeeks, fsRules, absences])
}
