/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppState } from './context'

/**
 * **Getauscht: der Weg durch Reducer und `persist`** (T153) — mit dem, was im
 * Betrieb dasteht: Beide hatten ihren Platz zugesagt, beiden war er gemeldet.
 *
 * Genau so fiel es auf (Durchsicht vom 30.10.2026): Mit leeren Zusagen und
 * leerem Tagebuch, wie in `tausch-reducer.test.ts`, wusste niemand von seinem
 * Platz, und kein Entzug war zu sehen. Im Betrieb hielt die App beide Plätze
 * für „entzogen" — der Reducer räumte die eben gesetzten Zusagen wieder ab, und
 * `persist` schickte beiden „Zuteilung zurückgezogen" (`OHNE_ENTZUG`).
 */

vi.mock('../lib/supabase', () => ({ supabase: {}, isSupabaseConfigured: true }))
vi.mock('../lib/data', async (importActual) => ({
  ...(await importActual<typeof import('../lib/data')>()),
  saveWeek: vi.fn(),
  saveConfirmation: vi.fn(),
  deleteConfirmationRows: vi.fn(),
  sendPlanEntzug: vi.fn(),
  sendPlanZeugnisAenderung: vi.fn(),
  notifyPlanners: vi.fn(),
}))

const data = await import('../lib/data')
const { persist } = await import('./persist')
const { aufgabenAbgeleitet, reducer } = await import('./reducer')
const { initialState } = await import('./init')
const { emptyQualifications } = await import('../data/helpers')
const { helferKey, sentKey } = await import('../data/planning')

const W1 = '2026-09-07' // Sonntag 13.9.
const W2 = '2026-09-14' // Sonntag 20.9.
const A = helferKey(W1, 'we', 'mik', 0)
const B = helferKey(W2, 'we', 'mik', 0)

const person = (id: string, fn: string, ln: string) => ({
  id, fn, ln, role: 'verkuendiger' as const, mail: '', priv: { ...emptyQualifications(), 'svc:mik': true },
})
const woche = (start: string, name: string, pid: string) => ({
  range: '', book: '', start,
  mid: { date: '', end: '', sections: [], helpers: {} },
  we: { date: '', end: '', sections: [], helpers: { mik: [{ name, pid }] } },
})

/** Jonas nimmt an — als Planer, damit „zurückgezogen" überhaupt hinausginge. */
function start(): AppState {
  return aufgabenAbgeleitet({
    ...initialState(),
    dataStatus: 'ready',
    congregationId: 'c1',
    userId: 'u-jonas',
    personId: 'p-jonas',
    planner: true,
    persons: [person('p-simon', 'Simon', 'Krüger'), person('p-jonas', 'Jonas', 'Berger')],
    services: [{ key: 'mik', name: 'Mikrofone', count: 1, groups: false }],
    congregation: { name: 'Nordheim', hall: '', times: { mid: { wd: 2, time: '19:00' }, we: { wd: 0, time: '10:00' } } },
    weeks: [woche(W1, 'Simon Krüger', 'p-simon'), woche(W2, 'Jonas Berger', 'p-jonas')],
    // Wie im Betrieb: Beide haben zugesagt, beiden war der Platz gemeldet.
    confirmations: { [A]: 'bestätigt', [B]: 'bestätigt' },
    sentLog: { [sentKey(A, 'Simon Krüger')]: '2026-09-01T10:00:00Z', [sentKey(B, 'Jonas Berger')]: '2026-09-01T10:00:00Z' },
    tauschAnfragen: [{ id: 'a1', von: 'p-simon', an: 'p-jonas', gibtAb: A, nimmt: B, bis: '2026-09-13' }],
  })
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 8, 7, 9, 0)) // Montag, 7. September 2026
  vi.clearAllMocks()
})
afterEach(() => vi.useRealTimers())

describe('Getauscht', () => {
  const tauschen = () => {
    const prev = start()
    const action = { type: 'getauscht' as const, tausch: prev.tauschAnfragen[0]! }
    const next = reducer(prev, action)
    persist(prev, next, action)
    return next
  }

  it('beide Plätze getauscht, beide zugesagt — die Zusagen bleiben stehen', () => {
    const next = tauschen()
    expect(next.weeks[0]?.we.helpers.mik?.[0]).toEqual({ name: 'Jonas Berger', pid: 'p-jonas' })
    expect(next.weeks[1]?.we.helpers.mik?.[0]).toEqual({ name: 'Simon Krüger', pid: 'p-simon' })
    expect(next.confirmations).toMatchObject({ [A]: 'bestätigt', [B]: 'bestätigt' })
    // „Meine Aufgaben" zeigt den neuen Platz als zugesagt, nicht als offen.
    expect(next.myTasks.find((t) => t.id === A)?.status).toBe('bestätigt')
  })

  it('niemand bekommt „zurückgezogen", nichts wird von hier geschrieben oder gelöscht', () => {
    tauschen()
    expect(data.sendPlanEntzug).not.toHaveBeenCalled()
    expect(data.saveWeek).not.toHaveBeenCalled()
    expect(data.saveConfirmation).not.toHaveBeenCalled()
    expect(data.deleteConfirmationRows).not.toHaveBeenCalled()
  })

  it('das Tagebuch kennt die neuen Inhaber — wie die Function es schrieb', () => {
    const next = tauschen()
    expect(Object.keys(next.sentLog)).toEqual(expect.arrayContaining([sentKey(A, 'Jonas Berger'), sentKey(B, 'Simon Krüger')]))
  })
})
