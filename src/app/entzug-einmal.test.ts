/** @vitest-environment happy-dom */
import { describe, expect, it, vi } from 'vitest'

/**
 * **Wem eine Aktion einen Platz nimmt, wird einmal gerechnet** (Review, App #4,
 * 16.10.2026).
 *
 * Der Reducer fragt danach, um Zusagen und Tagebuch abzuräumen
 * (`ohneEntzogene`); `persist.ts` fragt mit denselben Ständen gleich danach
 * noch einmal, um es zu melden — `dispatch` reicht ihm genau den Vorher- und
 * den Nachher-Stand des Reducers (store.tsx). Bis hierher rechnete jeder für
 * sich, bei einer Umbenennung je Tastendruck über alle Wochen der Person.
 *
 * Geprüft wird die Folge, wie `dispatch` sie fährt: Reducer, dann dieselbe
 * Frage mit `prev` und `next`. Die Antwort muss dasselbe Objekt sein.
 */
vi.mock('../data/plan-versand', async (orig) => {
  const echt = await orig<typeof import('../data/plan-versand')>()
  return { ...echt, entzogeneAller: vi.fn(echt.entzogeneAller) }
})

const { reducer } = await import('./reducer')
const { entzogeneAller } = await import('../data/plan-versand')
const { demoZustand } = await import('../../tests/testdaten/demo-start')

describe('Entzogene Plätze: einmal je Aktion', () => {
  it('der Reducer rechnet — persist.ts bekommt dieselbe Antwort', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 8, 7, 9, 0)) // Montag, 7. September 2026
    try {
      const prev = demoZustand()
      const gefragt = vi.mocked(entzogeneAller)
      gefragt.mockClear()
      // Die Woche leeren: Wer zugesagt hatte, verliert seinen Platz.
      const next = reducer(prev, { type: 'clearAssignments', scope: 'all' })
      const imReducer = gefragt.mock.results.at(-1)?.value as ReturnType<typeof entzogeneAller>
      expect(imReducer.length).toBeGreaterThan(0)
      expect(entzogeneAller(prev, next)).toBe(imReducer)
    } finally {
      vi.useRealTimers()
    }
  })

  it('ein anderer Tag rechnet neu — „vorbei" hängt am Kalendertag', () => {
    const prev = demoZustand()
    const next = reducer(prev, { type: 'clearAssignments', scope: 'all' })
    const montag = entzogeneAller(prev, next, new Date(2026, 8, 7, 9, 0))
    expect(entzogeneAller(prev, next, new Date(2026, 8, 7, 22, 0))).toBe(montag)
    expect(entzogeneAller(prev, next, new Date(2026, 8, 8, 9, 0))).not.toBe(montag)
  })
})
