/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearSnapshot, readSnapshot, saveSnapshot } from './snapshot'
import type { HydratePayload } from '../app/context'

const payload = (over: Partial<HydratePayload> = {}): HydratePayload => ({
  congregationId: 'c1',
  userId: 'u1',
  empty: false,
  congregation: { name: 'Musterstadt', hall: '', meetings: '' },
  planner: true,
  personId: 'p1',
  persons: [],
  services: [],
  groups: [],
  weeks: [],
  fsRules: [],
  fsWeeks: [],
  fsBase: '2026-07-20',
  absences: [],
  notifications: [],
  confirmations: {},
  sentLog: {},
  reminders: { first: 7, last: 1, repeat: false },
  congLang: 'Deutsch',
  progLangs: [],
  auxClass: false,
  members: [],
  invites: [],
  ...over,
})

beforeEach(() => localStorage.clear())
afterEach(() => vi.restoreAllMocks())

describe('saveSnapshot / readSnapshot', () => {
  it('speichert die Payload unverändert und liefert sie mit Zeitstempel zurück', () => {
    vi.setSystemTime(new Date('2026-07-25T10:30:00Z'))
    const p = payload()
    saveSnapshot(p)
    const snap = readSnapshot('u1')
    expect(snap?.at).toBe(Date.parse('2026-07-25T10:30:00Z'))
    // Bis auf die Abwesenheitsgründe 1:1, damit `hydrate` sie direkt annehmen
    // kann (siehe „Was liegen bleibt, ist beschnitten" unten).
    expect(snap?.payload).toEqual(p)
    vi.useRealTimers()
  })

  it('liefert null ohne Aufnahme', () => {
    expect(readSnapshot('u1')).toBeNull()
  })

  it('gibt die Aufnahme NICHT an ein anderes Konto heraus — und räumt sie weg', () => {
    /*
      **Verwerfen genügt nicht** (S6). Das geteilte Saal-Tablet aus dem Kopf von
      `snapshot.ts`: Wer sich nicht abmeldet, hinterlässt seine Aufnahme —
      Namen, Zuteilungen, Telefon, E-Mail im Klartext. Meldet sich danach
      jemand anders an, ist dieser Griff die Gelegenheit, sie loszuwerden;
      andernfalls läge sie bis zum Verfallsdatum weiter da.
    */
    saveSnapshot(payload({ userId: 'u1' }))
    expect(readSnapshot('u2')).toBeNull()
    expect(localStorage.getItem('snapshot'), 'die fremde Aufnahme liegt noch da').toBeNull()
  })

  it('verwirft eine Aufnahme mit fremder Fassungsnummer — und räumt sie weg', () => {
    saveSnapshot(payload())
    const raw = JSON.parse(localStorage.getItem('snapshot') as string)
    localStorage.setItem('snapshot', JSON.stringify({ ...raw, v: 99 }))
    expect(readSnapshot('u1')).toBeNull()
    expect(localStorage.getItem('snapshot')).toBeNull()
  })

  it('verwirft beschädigten Inhalt statt zu werfen — und räumt ihn weg', () => {
    localStorage.setItem('snapshot', '{kein json')
    expect(readSnapshot('u1')).toBeNull()
    expect(localStorage.getItem('snapshot')).toBeNull()
  })

  it('übersteht ein volles Kontingent und lässt keinen Rest zurück', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    expect(() => saveSnapshot(payload())).not.toThrow()
    setItem.mockRestore()
    expect(readSnapshot('u1')).toBeNull()
  })
})

describe('Was liegen bleibt, ist beschnitten (S6)', () => {
  const mitGrund = (): HydratePayload =>
    payload({
      persons: [
        {
          id: 'p1', fn: 'Xavo', ln: 'Quintus', role: 'verkuendiger',
          tel: '+49 170 1234567', mail: 'x@example.com',
          priv: {} as HydratePayload['persons'][number]['priv'],
        },
      ],
      absences: [
        { id: 'a1', personId: 'p1', userId: 'u1', from: '2026-07-01', to: '2026-07-14', reason: 'Reha' },
        { id: 'a2', personId: 'p1', userId: 'u1', from: '2026-08-01', to: '2026-08-03', reason: '' },
      ],
    })

  it('der Abwesenheitsgrund bleibt draußen', () => {
    // Der einzige Freitext im Bestand, der Gesundheitsangaben tragen kann —
    // und der einzige, den offline niemand braucht.
    saveSnapshot(mitGrund())
    const roh = localStorage.getItem('snapshot') as string
    expect(roh, 'der Grund steht im Klartext im localStorage').not.toContain('Reha')
    expect(readSnapshot('u1')?.payload.absences.map((a) => a.reason)).toEqual(['', ''])
  })

  it('Telefon und E-Mail bleiben — offline ist die Nummer oft der Grund für die App', () => {
    saveSnapshot(mitGrund())
    const person = readSnapshot('u1')?.payload.persons[0]
    expect(person?.tel).toBe('+49 170 1234567')
    expect(person?.mail).toBe('x@example.com')
  })

  it('die Nutzlast des Aufrufers bleibt unangetastet', () => {
    // Dieselbe Nutzlast geht gleich danach in den Zustand — dort **mit** Grund,
    // denn dort ist sie frisch aus der Datenbank.
    const p = mitGrund()
    saveSnapshot(p)
    expect(p.absences[0]!.reason).toBe('Reha')
  })
})

describe('Eine Aufnahme läuft ab (S6)', () => {
  const tage = (n: number) => n * 24 * 3600 * 1000

  it('nach 13 Tagen gilt sie noch', () => {
    vi.setSystemTime(new Date('2026-07-01T10:00:00Z'))
    saveSnapshot(payload())
    vi.setSystemTime(new Date(Date.parse('2026-07-01T10:00:00Z') + tage(13)))
    expect(readSnapshot('u1')).not.toBeNull()
    vi.useRealTimers()
  })

  it('nach 15 Tagen nicht mehr — und sie wird dabei gelöscht', () => {
    /*
      Das Verwerfen allein genügt nicht: Es geht ja gerade darum, dass die Daten
      nicht liegen bleiben. Wer nur `null` zurückgäbe, hätte die Anzeige
      abgeschaltet und den Bestand behalten.
    */
    vi.setSystemTime(new Date('2026-07-01T10:00:00Z'))
    saveSnapshot(payload())
    vi.setSystemTime(new Date(Date.parse('2026-07-01T10:00:00Z') + tage(15)))
    expect(readSnapshot('u1')).toBeNull()
    expect(localStorage.getItem('snapshot'), 'die Aufnahme liegt weiter da').toBeNull()
    vi.useRealTimers()
  })
})

describe('clearSnapshot', () => {
  it('entfernt die Aufnahme', () => {
    saveSnapshot(payload())
    clearSnapshot()
    expect(readSnapshot('u1')).toBeNull()
  })
})
