/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Ob supabase.ts einen Client baut, hängt an den Env-Variablen. Ohne eigene
// Werte liefe dieser Test lokal (mit .env.local) gegen den konfigurierten und
// in der CI (ohne .env.local) gegen den Demo-Zustand — also nur lokal grün.
// Deshalb hier feste Attrappen-Werte, gesetzt vor dem Import des Moduls.
vi.hoisted(() => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://test.example.invalid')
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key')
})

// createClient durch einen Fake-Auth-Client ersetzen (kein Netz).
const auth = vi.hoisted(() => ({ signOut: vi.fn() }))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ auth }) }))

import * as modul from './supabase'

beforeEach(() => vi.clearAllMocks())

// Das Abmelden steht seit dem 16.10.2026 in `abmelden.ts` (und dort seine Probe).
describe('Konfiguration', () => {
  it('isSupabaseConfigured ist im (gemockten) konfigurierten Zustand true', () => {
    expect(modul.isSupabaseConfigured).toBe(true)
  })
})

describe('Kein Kennwort mehr (T121, Phase 8)', () => {
  it('Anmelden, Registrieren und Zurücksetzen gibt es hier nicht mehr — nur über einen Link', () => {
    // Wer sie zurückholte, öffnete wieder eine Tür, an der kein Admin steht:
    // Registrieren konnte jeder, mit jeder Adresse.
    for (const alt of ['signIn', 'signUp', 'requestPasswordReset', 'updatePassword']) {
      expect(Object.keys(modul), alt).not.toContain(alt)
    }
  })
})
