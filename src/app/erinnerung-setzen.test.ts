import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { demoZustand } from '../../tests/testdaten/demo-start'
import type { Reminders } from '../data/types'
import { type AppAction, type AppState, ERINNERUNG_GRENZEN, type ReminderKey } from './context'

/**
 * **Einen Erinnerungswert unmittelbar setzen** (`setReminder`, T121 Phase
 * 6c-4): die Wahl „Am Tag" / „1 Tag vorher" der Erinnerungen. Neben − und +
 * (`changeReminder`) der zweite Weg zu denselben Werten — mit denselben Grenzen
 * und demselben Speicherweg. Fehlte eins davon, stünde der Wert auf dem
 * Bildschirm und wäre beim nächsten Laden weg, oder die Datenbank wiese ihn ab.
 */

// Supabase vorhanden (sonst schreibt `persist` gar nichts) — aber kein Netz:
// Die Schreibfunktion für die Einstellungen ist eine Attrappe.
vi.mock('../lib/supabase', () => ({ supabase: {} }))
vi.mock('../lib/data', async (importActual) => ({
  ...(await importActual<typeof import('../lib/data')>()),
  saveSettings: vi.fn(),
}))

import * as data from '../lib/data'
import { persist } from './persist'
import { isViewAction } from './readonly'
import { reducer } from './reducer'

// Der Startzustand liest die Gerätevorlieben aus `localStorage`; diese Datei
// läuft ohne DOM (wie in `persist.test.ts`).
beforeAll(() => vi.stubGlobal('localStorage', { getItem: () => null }))
afterAll(() => vi.unstubAllGlobals())

const mit = (reminders: Reminders): AppState => ({ ...demoZustand(), reminders })
const setzen = (s: AppState, key: ReminderKey, value: number): Reminders =>
  reducer(s, { type: 'setReminder', key, value }).reminders

describe('setReminder', () => {
  const STANDARD: Reminders = { first: 7, last: 1, repeat: false }

  it('setzt die letzte Erinnerung auf den Tag selbst und zurück auf den Vortag', () => {
    expect(setzen(mit(STANDARD), 'last', 0)).toEqual({ first: 7, last: 0, repeat: false })
    expect(setzen(mit({ ...STANDARD, last: 0 }), 'last', 1)).toEqual({ first: 7, last: 1, repeat: false })
  })

  it('setzt auch die erste — und lässt die andere und die Wiederholung stehen', () => {
    expect(setzen(mit({ first: 7, last: 0, repeat: true }), 'first', 14)).toEqual({ first: 14, last: 0, repeat: true })
  })

  it.each([
    ['first', 0, 1],
    ['first', -5, 1],
    ['first', 22, 21],
    ['last', -1, 0],
    ['last', 8, 7],
    ['last', 30, 7],
  ] as const)('klemmt an den Grenzen der Datenbank: %s = %i → %i', (key, value, erwartet) => {
    expect(setzen(mit(STANDARD), key, value)[key]).toBe(erwartet)
  })

  it('die Grenzen sind dieselben wie für − und +', () => {
    // Beide Wege an der oberen und unteren Grenze jedes Schlüssels — liefen sie
    // auseinander, ließe die Wahl einen Wert zu, den die Schritte nicht kennen.
    for (const key of ['first', 'last'] as const) {
      const { min, max } = ERINNERUNG_GRENZEN[key]
      const oben = mit({ ...STANDARD, [key]: max })
      const unten = mit({ ...STANDARD, [key]: min })
      expect(reducer(oben, { type: 'changeReminder', key, delta: 1 }).reminders[key]).toBe(setzen(oben, key, max + 1)[key])
      expect(reducer(unten, { type: 'changeReminder', key, delta: -1 }).reminders[key]).toBe(setzen(unten, key, min - 1)[key])
    }
    expect(ERINNERUNG_GRENZEN).toEqual({ first: { min: 1, max: 21 }, last: { min: 0, max: 7 } })
  })

  it('ändert den Zustand nicht an Ort und Stelle', () => {
    const vorher = mit(STANDARD)
    const eingefroren = Object.freeze({ ...vorher, reminders: Object.freeze({ ...STANDARD }) })
    const nachher = reducer(eingefroren, { type: 'setReminder', key: 'last', value: 0 })
    expect(eingefroren.reminders.last).toBe(1)
    expect(nachher.reminders).not.toBe(eingefroren.reminders)
  })
})

describe('setReminder wird gespeichert wie changeReminder', () => {
  beforeEach(() => vi.mocked(data.saveSettings).mockClear())

  const angemeldet = (reminders: Reminders): AppState => ({ ...mit(reminders), congregationId: 'c1', userId: 'u1' })

  it('schreibt die Einstellungen der Versammlung mit dem neuen Wert', () => {
    const vorher = angemeldet({ first: 7, last: 1, repeat: false })
    const action: AppAction = { type: 'setReminder', key: 'last', value: 0 }
    persist(vorher, reducer(vorher, action), action)
    expect(data.saveSettings).toHaveBeenCalledTimes(1)
    expect(data.saveSettings).toHaveBeenCalledWith(
      'c1',
      expect.objectContaining({ reminders: { first: 7, last: 0, repeat: false } }),
    )
  })

  it('offline ist es gesperrt — es schreibt', () => {
    expect(isViewAction('setReminder')).toBe(false)
  })
})
