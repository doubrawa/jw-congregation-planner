/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEMO_PERSONS, DEMO_PLANNER } from '../data/demo'

// isSupabaseConfigured umschaltbar machen (real ist es im Testenv true).
const cfg = vi.hoisted(() => ({ configured: false }))
vi.mock('../lib/supabase', () => ({
  get isSupabaseConfigured() {
    return cfg.configured
  },
  supabase: null,
}))

import { initialState } from './init'

beforeEach(() => {
  cfg.configured = false
  localStorage.clear()
  location.hash = ''
  document.documentElement.removeAttribute('data-theme')
})
afterEach(() => vi.unstubAllEnvs())

describe('initialState – Demo-Modus (ohne Supabase)', () => {
  it('liefert die In-Memory-Demo-Daten', () => {
    const s = initialState()
    expect(s.dataStatus).toBe('demo')
    expect(s.screen).toBe('login')
    expect(s.persons).toBe(DEMO_PERSONS)
    expect(s.weeks.length).toBeGreaterThan(0)
    expect(s.planner).toBe(DEMO_PLANNER)
  })
})

describe('initialState – konfiguriert (leerer Start bis Hydration)', () => {
  it('startet leer, dataStatus ready, fsBase = Montag dieser Woche (12:00)', () => {
    cfg.configured = true
    const s = initialState()
    expect(s.dataStatus).toBe('ready')
    expect(s.persons).toEqual([])
    expect(s.weeks).toEqual([])
    expect(s.planner).toBe(false)
    expect(s.congregation).toEqual({ name: '', hall: '', meetings: '' })
    expect(s.fsBase.getDay()).toBe(1) // Montag
    expect(s.fsBase.getHours()).toBe(12)
  })
})

describe('Theme / Sprache aus localStorage', () => {
  it('übernimmt ein gültiges Theme und mappt Alt-Werte', () => {
    localStorage.setItem('theme', 'graphit')
    expect(initialState().theme).toBe('graphit')
    localStorage.setItem('theme', 'dark') // Alt-Wert → graphit
    expect(initialState().theme).toBe('graphit')
    localStorage.setItem('theme', 'light') // Alt-Wert → weiss
    expect(initialState().theme).toBe('weiss')
  })

  it('ungültiges Theme → Systempräferenz aus dem data-theme-Attribut', () => {
    localStorage.setItem('theme', 'quatsch')
    document.documentElement.dataset.theme = 'graphit'
    expect(initialState().theme).toBe('graphit')
  })

  it('übernimmt eine gültige App-Sprache, sonst de', () => {
    localStorage.setItem('lang', 'en')
    expect(initialState().lang).toBe('en')
    localStorage.setItem('lang', 'klingonisch')
    expect(initialState().lang).toBe('de')
  })
})

describe('Debug-Hash (nur DEV) erzwingt Demo + springt einen Screen an', () => {
  it('liest s/l/c/t/p aus dem Hash', () => {
    vi.stubEnv('DEV', true)
    cfg.configured = true // trotz Konfiguration erzwingt der Hash den Demo-Modus
    location.hash = '#s=programm&l=en&c=Englisch&t=graphit&p=p9'
    const s = initialState()
    expect(s.dataStatus).toBe('demo')
    expect(s.screen).toBe('programm')
    expect(s.lang).toBe('en')
    expect(s.congLang).toBe('Englisch')
    expect(s.theme).toBe('graphit')
    expect(s.selectedPersonId).toBe('p9')
  })

  it('ohne Hash bleibt es (bei DEV) beim konfigurierten Leerstart', () => {
    vi.stubEnv('DEV', true)
    cfg.configured = true
    const s = initialState()
    expect(s.dataStatus).toBe('ready')
    expect(s.screen).toBe('login')
  })
})
