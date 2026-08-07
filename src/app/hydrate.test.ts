import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadAndHydrate } from './hydrate'
import { loadCongregationData, type CongregationData } from '../lib/data'
import { clearSnapshot, readSnapshot, saveSnapshot } from '../lib/snapshot'
import type { AppAction } from './context'

vi.mock('../lib/data', () => ({ loadCongregationData: vi.fn() }))
vi.mock('../lib/snapshot', () => ({
  saveSnapshot: vi.fn(),
  readSnapshot: vi.fn(() => null),
  clearSnapshot: vi.fn(),
}))
const mockLoad = vi.mocked(loadCongregationData)
const mockSave = vi.mocked(saveSnapshot)
const mockRead = vi.mocked(readSnapshot)
const mockClear = vi.mocked(clearSnapshot)

const emptyData: CongregationData = {
  congregation: { name: 'K', hall: '', meetings: '' },
  planner: true,
  personId: null,
  persons: [],
  services: [],
  groups: [],
  weeks: [],
  weekFrom: 0,
  fsRules: [],
  fsWeeks: [],
  fsBase: null,
  absences: [],
  notifications: [],
  confirmations: {},
  reminders: { first: 7, last: 1, repeat: false },
  congLang: 'Deutsch',
  progLangs: [],
  members: [],
  invites: [],
  auxClass: false,
}

/** Sammelt die dispatchten Aktionen. */
function collector() {
  const actions: AppAction[] = []
  return { actions, dispatch: (a: AppAction) => void actions.push(a) }
}

describe('loadAndHydrate', () => {
  beforeEach(() => {
    mockLoad.mockReset()
    mockSave.mockClear()
    mockClear.mockClear()
    mockRead.mockReset()
    mockRead.mockReturnValue(null)
  })

  it('setzt zuerst loading, dann hydrate bei Erfolg (mit congregationId/userId/empty)', async () => {
    mockLoad.mockResolvedValue({ ok: true, empty: false, data: emptyData, congregationId: 'c1', userId: 'u1' })
    const { actions, dispatch } = collector()
    await loadAndHydrate(dispatch, 'u1')
    expect(actions[0]).toEqual({ type: 'setDataStatus', status: 'loading' })
    expect(actions[1].type).toBe('hydrate')
    if (actions[1].type === 'hydrate') {
      expect(actions[1].payload).toMatchObject({ congregationId: 'c1', userId: 'u1', empty: false })
    }
  })

  it('sichert bei Erfolg die Offline-Momentaufnahme (dieselbe Payload)', async () => {
    mockLoad.mockResolvedValue({ ok: true, empty: false, data: emptyData, congregationId: 'c1', userId: 'u1' })
    const { actions, dispatch } = collector()
    await loadAndHydrate(dispatch, 'u1')
    expect(mockSave).toHaveBeenCalledTimes(1)
    if (actions[1].type === 'hydrate') expect(mockSave.mock.calls[0][0]).toEqual(actions[1].payload)
  })

  it('bei fehlender Mitgliedschaft → no-membership (mit userId für Retry), Aufnahme gelöscht', async () => {
    mockLoad.mockResolvedValue({ ok: false, reason: 'no-membership' })
    const { actions, dispatch } = collector()
    await loadAndHydrate(dispatch, 'u9')
    expect(actions[1]).toEqual({ type: 'setDataStatus', status: 'no-membership', userId: 'u9' })
    // Ohne Mitgliedschaft darf der alte Stand nicht offline weiterleben.
    expect(mockClear).toHaveBeenCalled()
  })

  it('bei Ladefehler ohne Aufnahme → error (mit userId)', async () => {
    mockLoad.mockResolvedValue({ ok: false, reason: 'error', message: 'kaputt' })
    const { actions, dispatch } = collector()
    await loadAndHydrate(dispatch, 'u9')
    expect(actions[1]).toEqual({ type: 'setDataStatus', status: 'error', userId: 'u9' })
  })

  it('bei Ladefehler MIT Aufnahme → hydrate aus der Aufnahme samt staleAt', async () => {
    mockLoad.mockResolvedValue({ ok: false, reason: 'error' })
    const stored = { ...emptyData, congregationId: 'c1', userId: 'u9', empty: false }
    mockRead.mockReturnValue({ at: 1_700_000_000_000, payload: stored })
    const { actions, dispatch } = collector()
    await loadAndHydrate(dispatch, 'u9')
    expect(actions[1]).toEqual({ type: 'hydrate', payload: stored, staleAt: 1_700_000_000_000 })
    expect(mockRead).toHaveBeenCalledWith('u9') // nur die eigene Aufnahme
    expect(mockClear).not.toHaveBeenCalled()
  })
})
