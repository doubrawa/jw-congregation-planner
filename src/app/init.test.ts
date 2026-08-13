/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEMO_PERSONS, DEMO_PLANNER } from '../data/testdaten'

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
  document.documentElement.removeAttribute('data-shot')
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

  it('ungültiges/fehlendes Theme → Reinweiß (Standard, unabhängig vom System)', () => {
    localStorage.setItem('theme', 'quatsch')
    // Selbst wenn das System dunkel ist (data-theme=graphit vorbelegt): Standard weiss.
    document.documentElement.dataset.theme = 'graphit'
    expect(initialState().theme).toBe('weiss')
    localStorage.removeItem('theme')
    expect(initialState().theme).toBe('weiss')
  })

  it('übernimmt eine gültige App-Sprache, sonst de', () => {
    localStorage.setItem('lang', 'en')
    expect(initialState().lang).toBe('en')
    localStorage.setItem('lang', 'klingonisch')
    expect(initialState().lang).toBe('de')
  })

  it('übernimmt eine gültige Schriftgröße, sonst Standard 1', () => {
    localStorage.setItem('fontScale', '1.3')
    expect(initialState().fontScale).toBe(1.3)
    localStorage.setItem('fontScale', '1.1') // nicht auf der Skala
    expect(initialState().fontScale).toBe(1)
    localStorage.removeItem('fontScale')
    expect(initialState().fontScale).toBe(1)
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

  it('tab und pl (Rechte) steuern Reiter und Rolle für Doku-Screenshots', () => {
    vi.stubEnv('DEV', true)
    cfg.configured = true
    location.hash = '#s=planen&tab=fs&pl=0'
    const s = initialState()
    expect(s.tab).toBe('fs')
    expect(s.planner).toBe(false) // pl=0 → Verkündiger-Ansicht
    location.hash = '#s=planen&pl=1'
    expect(initialState().planner).toBe(true)
  })

  it('fs=<Faktor> setzt die Schriftgröße (Doku-Screenshots)', () => {
    vi.stubEnv('DEV', true)
    location.hash = '#s=profil&fs=1.45'
    expect(initialState().fontScale).toBe(1.45)
    location.hash = '#s=profil&fs=1.1' // nicht auf der Skala → ignoriert (Standard)
    expect(initialState().fontScale).toBe(1)
  })

  it('shot=1 aktiviert den Screenshot-Modus (data-shot am <html>)', () => {
    vi.stubEnv('DEV', true)
    cfg.configured = true
    location.hash = '#s=start&shot=1'
    initialState()
    expect(document.documentElement.dataset.shot).toBe('1')
  })

  it('stale=<Stunden> täuscht den Offline-Stand vor (staleAt entsprechend alt)', () => {
    vi.stubEnv('DEV', true)
    location.hash = '#s=programm&stale=5'
    // staleAt = Date.now()(innerhalb) - 5h. Der reale Aufruf-Zeitpunkt liegt
    // zwischen before und after, deshalb das Alter einklammern statt gegen einen
    // einzelnen Zeitpunkt zu prüfen (sonst Sub-ms-Race → ageHours knapp < 5).
    const before = Date.now()
    const s = initialState()
    const after = Date.now()
    expect(s.staleAt).not.toBeNull()
    const staleAt = s.staleAt as number
    expect((after - staleAt) / 3600_000).toBeGreaterThanOrEqual(5)
    expect((before - staleAt) / 3600_000).toBeLessThanOrEqual(5)
    expect((after - staleAt) / 3600_000).toBeLessThan(5.01)
  })

  it('ohne stale bleibt der Stand aktuell', () => {
    vi.stubEnv('DEV', true)
    location.hash = '#s=programm'
    expect(initialState().staleAt).toBeNull()
  })

  it('ohne Hash bleibt es (bei DEV) beim konfigurierten Leerstart', () => {
    vi.stubEnv('DEV', true)
    cfg.configured = true
    const s = initialState()
    expect(s.dataStatus).toBe('ready')
    expect(s.screen).toBe('login')
  })
})
