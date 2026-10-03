/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reducer } from './reducer'
import type { AppState } from './context'
import { demoZustand } from '../../tests/testdaten/demo-start'
import { vaKey } from '../../supabase/functions/_shared/aufgaben-schluessel.ts'
import { VA_ROLLE } from '../../supabase/functions/_shared/zuteilungen.ts'
import { allePlaetze } from '../data/plaetze'
import type { MyTask, VortragAuswaerts } from '../data/types'

/**
 * **Redner auswärts im Reducer** (T120, Phase 4). Die Regeln selbst prüft
 * `data/auswaerts.test.ts`; hier geht es darum, dass jede Aktion sie benutzt —
 * und um die Wege, auf denen eine Zusage verfällt, eine Verhinderung die
 * Planer erreicht und die eigene Zusammenkunft den Redner freihält.
 */

/** Sonntag, 13. September 2026 — die Uhr steht auf Montag, 7. September. */
const SONNTAG = '2026-09-13'
const KEY = (id: string) => vaKey('2026-09-07', id)

const vortrag = (id: string, pid: string | null, datum = SONNTAG): VortragAuswaerts => ({
  id,
  datum,
  zeit: '10:00',
  versammlung: 'Beispielheim',
  nummer: 12,
  pid,
})

/** Jonas Berger (p6) ist angemeldet — er hält Vorträge. */
function zustand(over: Partial<AppState> = {}): AppState {
  return {
    ...demoZustand(),
    planner: true,
    personId: 'p6',
    auswaerts: [],
    confirmations: {},
    notifs: [],
    terminGewaehlt: true,
    ...over,
  }
}

const vaAufgabe = (s: AppState): MyTask | undefined => s.myTasks.find((t) => t.id.startsWith('va|'))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 8, 7, 9, 0))
})
afterEach(() => vi.useRealTimers())

describe('Eintragen, umbesetzen, streichen', () => {
  it('ein neuer Vortrag bekommt eine lesbare Kennung und wird die Aufgabe seines Redners', () => {
    const s = reducer(zustand(), {
      type: 'vaAdd',
      vortrag: { datum: SONNTAG, zeit: '10:00', versammlung: 'Beispielheim', nummer: 12, pid: 'p6' },
    })
    expect(s.auswaerts).toEqual([expect.objectContaining({ datum: SONNTAG, pid: 'p6' })])
    expect(s.auswaerts[0]!.id).toMatch(/^v.{8,}/)
    expect(vaAufgabe(s)).toMatchObject({
      id: KEY(s.auswaerts[0]!.id),
      rolle: VA_ROLLE,
      date: 'Sonntag, 13. September · 10:00 · Vers. Beispielheim',
      status: 'offen',
    })
  })

  it('der Plan bleibt nach Tag geordnet', () => {
    const s = reducer(zustand({ auswaerts: [vortrag('spaet', null, '2026-11-08')] }), {
      type: 'vaAdd',
      vortrag: { datum: SONNTAG, zeit: '10:00', versammlung: 'Beispielheim', nummer: null, pid: null },
    })
    expect(s.auswaerts.map((v) => v.datum)).toEqual([SONNTAG, '2026-11-08'])
  })

  it('ein anderer Redner: Die Zusage des alten verfällt, der neue erbt sie nicht', () => {
    const s = reducer(
      zustand({ auswaerts: [vortrag('v1', 'p6')], confirmations: { [KEY('v1')]: 'bestätigt' } }),
      { type: 'vaRedner', id: 'v1', pid: 'p7' },
    )
    expect(s.auswaerts[0]!.pid).toBe('p7')
    expect(s.confirmations).toEqual({})
    expect(vaAufgabe(s)).toBeUndefined() // Jonas hat ihn nicht mehr
  })

  it('derselbe Redner noch einmal ändert nichts', () => {
    const s = zustand({ auswaerts: [vortrag('v1', 'p6')] })
    expect(reducer(s, { type: 'vaRedner', id: 'v1', pid: 'p6' })).toBe(s)
  })

  it('ein gestrichener Vortrag nimmt seine Zusage mit', () => {
    const s = reducer(
      zustand({ auswaerts: [vortrag('v1', 'p6')], confirmations: { [KEY('v1')]: 'bestätigt' } }),
      { type: 'vaRemove', id: 'v1' },
    )
    expect(s.auswaerts).toEqual([])
    expect(s.confirmations).toEqual({})
    expect(vaAufgabe(s)).toBeUndefined()
  })
})

describe('Der Redner sagt zu oder ist verhindert', () => {
  it('bestätigen wie jede andere Aufgabe', () => {
    const s = reducer(zustand({ planner: false, auswaerts: [vortrag('v1', 'p6')] }), { type: 'confirmTask', id: KEY('v1') })
    expect(s.confirmations[KEY('v1')]).toBe('bestätigt')
    expect(vaAufgabe(s)?.status).toBe('bestätigt')
  })

  it('verhindert: Der Vortrag bleibt stehen, die Planer erfahren es mit Tag und Versammlung', () => {
    const s = reducer(zustand({ planner: false, auswaerts: [vortrag('v1', 'p6')] }), { type: 'declineTask', id: KEY('v1') })
    expect(s.auswaerts).toEqual([vortrag('v1', 'p6')])
    expect(s.confirmations[KEY('v1')]).toBe('verhindert')
    expect(s.notifs[0]).toMatchObject({ type: 'verhindert', title: 'Verhinderung gemeldet', local: true })
    expect(s.notifs[0]!.text).toContain(`${VA_ROLLE} · Sonntag, 13. September · 10:00 · Vers. Beispielheim — `)
  })
})

describe('Personen löschen', () => {
  it('der Vortrag bleibt, nur ohne Redner — und ohne dessen Zusage', () => {
    const s = reducer(
      zustand({ auswaerts: [vortrag('v1', 'p7')], confirmations: { [KEY('v1')]: 'bestätigt' } }),
      { type: 'removePerson', id: 'p7' },
    )
    expect(s.auswaerts).toEqual([vortrag('v1', null)])
    expect(s.confirmations).toEqual({})
  })
})

describe('Die eigene Zusammenkunft hält den Redner frei', () => {
  /*
   * Das Wochenende der Woche 1 (Sonntag, 20. September) geleert. Hält **jeder**
   * an diesem Tag einen Vortrag auswärts, bleibt es beim automatischen
   * Zuteilen leer — ohne die Vorträge wird es gefüllt.
   */
  const SONNTAG_WOCHE_1 = '2026-09-20'
  const leerAmSonntag = (over: Partial<AppState> = {}): AppState =>
    reducer(zustand({ week: 1, tab: 'we', ...over }), { type: 'clearAssignments', scope: 'parts' })
  /** Plätze mit einer Person aus der Versammlung (der Gastredner zählt nicht). */
  const besetzt = (s: AppState): number =>
    [...allePlaetze(s.weeks[1]!.we)].filter((p) => p.slot.pid).length

  // „Leeren" lässt stehen, was nicht zum Zuteilen gehört (etwa den festen
  // Wachtturm-Leiter) — gezählt wird deshalb, was die Auto-Zuteilung dazutut.
  it('ohne Vorträge füllt die Auto-Zuteilung das Wochenende', () => {
    const leer = leerAmSonntag()
    expect(besetzt(reducer(leer, { type: 'autoAssign' }))).toBeGreaterThan(besetzt(leer))
  })

  it('mit Vortrag am selben Tag bleibt jeder Redner außen vor', () => {
    const basis = demoZustand()
    const alle = basis.persons.map((p, i) => vortrag(`v${i}`, p.id, SONNTAG_WOCHE_1))
    const leer = leerAmSonntag({ auswaerts: alle })
    expect(besetzt(reducer(leer, { type: 'autoAssign' }))).toBe(besetzt(leer))
  })
})
