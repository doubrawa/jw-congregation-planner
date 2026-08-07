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
  weekFrom: 0,
  fsRules: [],
  fsWeeks: [],
  fsBase: '2026-07-20',
  absences: [],
  notifications: [],
  confirmations: {},
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
    expect(snap?.payload).toEqual(p) // 1:1, damit hydrate sie direkt annehmen kann
    vi.useRealTimers()
  })

  it('liefert null ohne Aufnahme', () => {
    expect(readSnapshot('u1')).toBeNull()
  })

  it('gibt die Aufnahme NICHT an ein anderes Konto heraus', () => {
    saveSnapshot(payload({ userId: 'u1' }))
    expect(readSnapshot('u2')).toBeNull()
  })

  it('verwirft eine Aufnahme mit fremder Fassungsnummer', () => {
    saveSnapshot(payload())
    const raw = JSON.parse(localStorage.getItem('snapshot') as string)
    localStorage.setItem('snapshot', JSON.stringify({ ...raw, v: 99 }))
    expect(readSnapshot('u1')).toBeNull()
  })

  it('verwirft beschädigten Inhalt statt zu werfen', () => {
    localStorage.setItem('snapshot', '{kein json')
    expect(readSnapshot('u1')).toBeNull()
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

describe('clearSnapshot', () => {
  it('entfernt die Aufnahme', () => {
    saveSnapshot(payload())
    clearSnapshot()
    expect(readSnapshot('u1')).toBeNull()
  })
})
