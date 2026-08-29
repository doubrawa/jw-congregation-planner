/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import React from 'react'
import { DE } from '../i18n/de'
import { clearSnapshot } from '../lib/snapshot'
import { useApp, type HydratePayload } from './context'
import { AppProvider } from './store'

// Ohne Supabase: initialState liefert die Demo-Daten, der Session-Effekt und
// persist() steigen früh aus — getestet wird allein der dispatch-Wächter.
vi.mock('../lib/supabase', () => ({ supabase: null, isSupabaseConfigured: false }))
vi.mock('../lib/snapshot', () => ({
  saveSnapshot: vi.fn(),
  readSnapshot: vi.fn(() => null),
  clearSnapshot: vi.fn(),
}))

const payload: HydratePayload = {
  congregationId: 'c1',
  userId: 'u1',
  empty: false,
  congregation: { name: 'Alt', hall: '', meetings: '' },
  planner: true,
  personId: null,
  persons: [],
  services: [],
  groups: [],
  weeks: [],
  fsRules: [],
  fsWeeks: [],
  fsBase: null,
  absences: [],
  notifications: [],
  confirmations: {},
  sentLog: {},
  reminders: { first: 7, last: 1, repeat: false },
  congLang: 'Deutsch',
  progLangs: [],
  members: [],
  invites: [],
  auxClass: false,
}

function setup() {
  const wrapper = ({ children }: { children: React.ReactNode }) => <AppProvider>{children}</AppProvider>
  return renderHook(() => useApp(), { wrapper })
}

describe('AppProvider – Schreibschutz im Offline-Stand', () => {
  it('lässt Schreib-Aktionen durch, solange der Stand aktuell ist', () => {
    const { result } = setup()
    act(() => result.current.dispatch({ type: 'hydrate', payload }))
    act(() => result.current.dispatch({ type: 'updateCongregation', patch: { name: 'Neu' } }))
    expect(result.current.state.congregation.name).toBe('Neu')
    expect(result.current.state.toast).toBeNull()
  })

  it('weist Schreib-Aktionen im Offline-Stand ab und erklärt es per Hinweis', () => {
    const { result } = setup()
    act(() => result.current.dispatch({ type: 'hydrate', payload, staleAt: 1_700_000_000_000 }))
    act(() => result.current.dispatch({ type: 'updateCongregation', patch: { name: 'Neu' } }))
    expect(result.current.state.congregation.name).toBe('Alt') // unverändert
    expect(result.current.state.toast?.text).toBe(DE.offlineReadOnly)
  })

  it('erlaubt im Offline-Stand weiter Navigation und Ansichtswechsel', () => {
    const { result } = setup()
    act(() => result.current.dispatch({ type: 'hydrate', payload, staleAt: 1 }))
    act(() => result.current.dispatch({ type: 'navigate', screen: 'programm' }))
    expect(result.current.state.screen).toBe('programm')
    act(() => result.current.dispatch({ type: 'setTab', tab: 'fs' }))
    expect(result.current.state.tab).toBe('fs')
    expect(result.current.state.toast).toBeNull() // kein Hinweis für reines Lesen
  })

  it('löscht die Momentaufnahme beim Abmelden', () => {
    const { result } = setup()
    act(() => result.current.dispatch({ type: 'logout' }))
    expect(clearSnapshot).toHaveBeenCalled()
  })
})

describe('AppProvider – fehlgeschlagenes Nachladen', () => {
  // Nach einem Deployment sind die alten Lazy-Chunks weg; der dynamische
  // Import des Sprach-Overlays scheitert dann. Ohne `.catch()` war das eine
  // unbehandelte Rejection — die Sprache blieb still auf Englisch, ohne jede
  // Meldung. Eine Error Boundary greift hier nicht: die Ablehnung entsteht
  // außerhalb des Renderns.
  it('fängt einen abgelehnten Overlay-Import ab, statt ihn unbehandelt zu lassen', async () => {
    const ui = await import('../i18n/ui')
    const fehler = new Error('Failed to fetch dynamically imported module')
    const overlay = vi.spyOn(ui, 'loadOverlay').mockRejectedValue(fehler)
    const konsole = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const { result } = setup()
      await act(async () => {
        result.current.dispatch({ type: 'setLang', lang: 'it' })
        // Zwei Mikrotask-Runden: eine für den Import, eine für das catch.
        await Promise.resolve()
        await Promise.resolve()
      })
      expect(overlay).toHaveBeenCalled()
      // Erreicht diese Meldung die Konsole, ist die Ablehnung behandelt —
      // ohne `.catch()` liefe sie am Effekt vorbei ins Leere.
      expect(konsole).toHaveBeenCalledWith('[overlay]', 'it', fehler)
    } finally {
      overlay.mockRestore()
      konsole.mockRestore()
    }
  })
})
