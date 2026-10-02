/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { initialState } from './init'
import { STANDARD_ZEITEN } from '../data/vorgaben'

beforeEach(() => {
  localStorage.clear()
  location.hash = ''
  document.documentElement.removeAttribute('data-theme')
})
afterEach(() => vi.unstubAllEnvs())

describe('initialState – leer bis zur Hydration', () => {
  it('startet leer, dataStatus ready', () => {
    const s = initialState()
    expect(s.dataStatus).toBe('ready')
    expect(s.screen).toBe('login')
    expect(s.persons).toEqual([])
    expect(s.weeks).toEqual([])
    expect(s.planner).toBe(false)
    expect(s.congregation).toEqual({ name: '', hall: '', times: STANDARD_ZEITEN })
  })

  it('auch im Dev-Build mit dem Hash von früher: keine Testdaten, kein Sprung', () => {
    /*
     * Bis zum 2.10.2026 erzwang ein Hash wie dieser im Dev-Build den
     * Demo-Modus — mit erfundenen Personen und Wochen. Das gibt es in der App
     * nicht mehr; die erfundenen Daten zeigt allein die Entwicklerseite
     * (`/demo.html`, `tests/testdaten/demo-start.ts`).
     */
    vi.stubEnv('DEV', true)
    location.hash = '#s=programm&p=p9&me=p9&pl=1'
    const s = initialState()
    expect(s.dataStatus).toBe('ready')
    expect(s.screen).toBe('login')
    expect(s.persons).toEqual([])
    expect(s.weeks).toEqual([])
    expect(s.personId).toBeNull()
    expect(s.selectedPersonId).toBeNull()
    expect(s.planner).toBe(false)
  })
})

describe('Theme / Sprache aus localStorage', () => {
  it('übernimmt ein gültiges Theme', () => {
    localStorage.setItem('theme', 'graphit')
    expect(initialState().theme).toBe('graphit')
  })

  it('ein unbekannter Name gilt nicht — auch nicht „dark"/„light"', () => {
    // Die beiden waren die gespeicherten Werte, bevor es die acht Farbschemata
    // gab. Sie wurden beim Laden umgesetzt; der Griff ist mit den Altlasten
    // weggefallen. Was jetzt in `localStorage` steht, muss ein Schema sein.
    for (const alt of ['dark', 'light']) {
      localStorage.setItem('theme', alt)
      expect(initialState().theme).toBe('weiss') // Standard
    }
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
