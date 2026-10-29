import { useMemo } from 'react'
import { useApp } from '../app/context'
import { useKalendertag } from '../app/useKalendertag'
import { anwesenheitJeMonat, type AnwesenheitMonat } from '../data/anwesenheit'
import { fromIso } from '../data/meeting-dates'

/** Der erste Tag des Monats „JJJJ-MM-01" — `monate` Monate vor dem von `heute`. */
export function monatVor(heute: string, monate: number): string {
  const [jahr = 0, monat = 1] = heute.split('-').map(Number)
  const d = new Date(jahr, monat - 1 - monate, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

/**
 * Die Monate, über die die Auswertung rechnet (T152) — vom ersten des
 * Zeitraums bis zum laufenden. Eigene Datei, damit die Ansicht nur Bausteine
 * ausführt (Fast Refresh, `only-export-components`).
 */
export function useAnwesenheitMonate(zeitraum: number): AnwesenheitMonat[] {
  const { state } = useApp()
  const heute = useKalendertag()
  return useMemo(
    () =>
      anwesenheitJeMonat(state.anwesenheit, state.weeks, state.congregation.times, monatVor(heute, zeitraum - 1), monatVor(heute, 0), fromIso(heute)),
    [state.anwesenheit, state.weeks, state.congregation.times, heute, zeitraum],
  )
}
