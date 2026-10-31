import { useMemo } from 'react'
import { useApp } from '../app/context'
import { useKalendertag } from '../app/useKalendertag'
import { anwesenheitJeMonat, monatVor, type AnwesenheitMonat } from '../data/anwesenheit'
import { fromIso } from '../data/meeting-dates'

/** Über so viele Monate blickt die Auswertung zurück, den laufenden eingeschlossen. */
const JAHR_MONATE = 12

/**
 * Die Monate, über die die Auswertung rechnet (T152) — vom ersten des Jahres
 * zurück bis zum laufenden. Eigene Datei, damit die Ansicht nur Bausteine
 * ausführt (Fast Refresh, `only-export-components`).
 */
export function useAnwesenheitMonate(): AnwesenheitMonat[] {
  const { state } = useApp()
  const heute = useKalendertag()
  return useMemo(
    () =>
      anwesenheitJeMonat(state.anwesenheit, state.weeks, state.congregation.times, monatVor(heute, JAHR_MONATE - 1), monatVor(heute, 0), fromIso(heute)),
    [state.anwesenheit, state.weeks, state.congregation.times, heute],
  )
}
