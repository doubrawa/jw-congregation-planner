import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadAndHydrate } from './hydrate'
import { loadCongregationData, type CongregationData } from '../lib/data'
import type { AppAction } from './context'

vi.mock('../lib/data', () => ({ loadCongregationData: vi.fn() }))
const mockLoad = vi.mocked(loadCongregationData)

const emptyData: CongregationData = {
  congregation: { name: 'K', hall: '', meetings: '' },
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
  reminders: { first: 7, last: 1, repeat: false },
  congLang: 'Deutsch',
  progLangs: [],
  members: [],
  invites: [],
}

/** Sammelt die dispatchten Aktionen. */
function collector() {
  const actions: AppAction[] = []
  return { actions, dispatch: (a: AppAction) => void actions.push(a) }
}

describe('loadAndHydrate', () => {
  beforeEach(() => mockLoad.mockReset())

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

  it('bei fehlender Mitgliedschaft → no-membership (mit userId für Retry)', async () => {
    mockLoad.mockResolvedValue({ ok: false, reason: 'no-membership' })
    const { actions, dispatch } = collector()
    await loadAndHydrate(dispatch, 'u9')
    expect(actions[1]).toEqual({ type: 'setDataStatus', status: 'no-membership', userId: 'u9' })
  })

  it('bei Ladefehler → error (mit userId)', async () => {
    mockLoad.mockResolvedValue({ ok: false, reason: 'error', message: 'kaputt' })
    const { actions, dispatch } = collector()
    await loadAndHydrate(dispatch, 'u9')
    expect(actions[1]).toEqual({ type: 'setDataStatus', status: 'error', userId: 'u9' })
  })
})
