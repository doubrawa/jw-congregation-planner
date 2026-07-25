/**
 * Lädt die Versammlungsdaten des eingeloggten Nutzers aus Supabase und spielt
 * sie in den State (Hydration). Getrennt vom Provider, damit auch der
 * Erstbefüllungs-Flow (AppShell) sie aufrufen kann.
 *
 * Jeder erfolgreiche Ladevorgang legt zusätzlich eine Momentaufnahme ab
 * (lib/snapshot.ts). Scheitert das Laden (typischerweise ohne Netz), wird sie
 * zurückgespielt: die App zeigt den letzten Stand mit Zeitangabe und lässt
 * keine Änderungen zu (staleAt), statt eine Fehlerseite zu zeigen.
 */

import type { Dispatch } from 'react'
import { loadCongregationData } from '../lib/data'
import { clearSnapshot, readSnapshot, saveSnapshot } from '../lib/snapshot'
import type { AppAction, HydratePayload } from './context'

export async function loadAndHydrate(dispatch: Dispatch<AppAction>, userId: string): Promise<void> {
  dispatch({ type: 'setDataStatus', status: 'loading' })
  const res = await loadCongregationData(userId)
  if (res.ok) {
    const payload: HydratePayload = {
      ...res.data,
      congregationId: res.congregationId,
      userId: res.userId,
      empty: res.empty,
    }
    saveSnapshot(payload)
    dispatch({ type: 'hydrate', payload })
    return
  }

  // Mitgliedschaft ist weg → der alte Stand darf nicht weiterleben.
  if (res.reason === 'no-membership') {
    clearSnapshot()
    dispatch({ type: 'setDataStatus', status: 'no-membership', userId })
    return
  }

  // Ladefehler: letzten Stand nur lesend anzeigen, wenn einer vorliegt.
  const snap = readSnapshot(userId)
  if (snap) {
    dispatch({ type: 'hydrate', payload: snap.payload, staleAt: snap.at })
    return
  }
  // userId mitgeben: Retry und Code-Einlösen brauchen es ohne Hydration
  dispatch({ type: 'setDataStatus', status: 'error', userId })
}
