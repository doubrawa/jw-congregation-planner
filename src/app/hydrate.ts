/**
 * Lädt die Versammlungsdaten des eingeloggten Nutzers aus Supabase und spielt
 * sie in den State (Hydration). Getrennt vom Provider, damit auch der
 * Erstbefüllungs-Flow (AppShell) sie aufrufen kann.
 */

import type { Dispatch } from 'react'
import { loadCongregationData } from '../lib/data'
import type { AppAction } from './context'

export async function loadAndHydrate(dispatch: Dispatch<AppAction>, userId: string): Promise<void> {
  dispatch({ type: 'setDataStatus', status: 'loading' })
  const res = await loadCongregationData(userId)
  if (res.ok) {
    dispatch({
      type: 'hydrate',
      payload: { ...res.data, congregationId: res.congregationId, userId: res.userId, empty: res.empty },
    })
  } else {
    // userId mitgeben: Retry und Code-Einlösen brauchen es ohne Hydration
    dispatch({
      type: 'setDataStatus',
      status: res.reason === 'no-membership' ? 'no-membership' : 'error',
      userId,
    })
  }
}
