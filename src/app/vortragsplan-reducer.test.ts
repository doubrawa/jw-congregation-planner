/** @vitest-environment happy-dom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reducer } from './reducer'
import type { AppState, HydratePayload } from './context'
import { demoZustand } from '../../tests/testdaten/demo-start'
import { punktKey } from '../../supabase/functions/_shared/aufgaben-schluessel.ts'
import { tagNach } from '../data/meeting-dates'
import type { PartItem, Week } from '../data/types'
import {
  vortragDerWoche,
  vortragsPlatz,
  type PlanVortrag,
  type VorgemerkterVortrag,
  type Vortragsplan,
} from '../data/vortragsplan'
import { DE } from '../i18n/de'

/**
 * **Der Vortragsplan im Reducer** (T122). Die Logik prüft
 * `data/vortragsplan.test.ts`; hier geht es darum, dass die Aktion sie mit dem
 * Zustand von jetzt benutzt, die Zusage eines verdrängten Redners abräumt, und
 * um die Wege ohne eigene Aktion: eine später geholte Woche, eine gelöschte
 * Person, eine alte Momentaufnahme.
 */

/** Demo-Bestand: Wochen vom 7. bis 28. September 2026, der Planer ist Admin. */
function zustand(over: Partial<AppState> = {}): AppState {
  return { ...demoZustand(), planner: true, confirmations: {}, ...over }
}

/** Ein Vortrag am Sonntag der Woche. */
const vortrag = (woche: string, extra: Partial<PlanVortrag> = {}): PlanVortrag => ({
  datum: tagNach(woche, 6),
  redner: 'Max Mustermann',
  versammlung: 'Musterstadt',
  eigener: false,
  thema: 'Demo-Thema 1',
  lied: '151',
  ...extra,
})

const plan = (vortraege: PlanVortrag[], von = vortraege[0]?.datum ?? '', bis = vortraege.at(-1)?.datum ?? ''): Vortragsplan => ({
  von,
  bis,
  vortraege,
})

/** Der Schlüssel, unter dem die Zusage des Redners einer Woche liegt. */
function rednerKey(w: Week): string {
  const platz = vortragsPlatz(w)!
  return punktKey(w.start, 'we', (w.we.sections[platz.si]!.items[platz.ii] as PartItem).iid!, 0)
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 8, 7, 9, 0)) // Montag der ersten Demo-Woche
})
afterEach(() => vi.useRealTimers())

describe('Vortragsplan übernehmen', () => {
  it('schreibt in die geladene Woche, merkt die spätere vor und meldet sich', () => {
    const s = zustand()
    const w0 = s.weeks[0]!.start
    const next = reducer(s, { type: 'vortragsplanUebernehmen', plan: plan([vortrag(w0), vortrag('2026-11-02')]) })
    expect(vortragDerWoche(next.weeks[0]!)).toMatchObject({ redner: 'Max Mustermann', versammlung: 'Musterstadt', thema: 'Demo-Thema 1', lied: '151' })
    expect(next.vortraege).toEqual([
      expect.objectContaining({ woche: '2026-11-02', redner: 'Max Mustermann', pid: null, id: expect.stringMatching(/^v.{8,}/) }),
    ])
    expect(next.toast?.text).toBe(DE.toastVortraegeUebernommen)
  })

  it('wer seinen Vortrag verliert, verliert seine Zusage — wie beim Zuteilen von Hand', () => {
    const s = zustand()
    const w0 = s.weeks[0]!.start
    const eigener = s.persons.find((p) => !p.female)!
    const mitRedner = reducer(s, {
      type: 'vortragsplanUebernehmen',
      plan: plan([vortrag(w0, { redner: `${eigener.fn} ${eigener.ln}`, versammlung: '', eigener: true })]),
    })
    expect(vortragDerWoche(mitRedner.weeks[0]!)?.pid).toBe(eigener.id)
    const key = rednerKey(mitRedner.weeks[0]!)
    const bestaetigt = { ...mitRedner, confirmations: { [key]: 'bestätigt' as const } }
    const next = reducer(bestaetigt, { type: 'vortragsplanUebernehmen', plan: plan([vortrag(w0)]) })
    expect(vortragDerWoche(next.weeks[0]!)?.redner).toBe('Max Mustermann')
    expect(next.confirmations).not.toHaveProperty(key)
  })

  it('bringt die Datei nichts Neues, bleiben Wochen und Vormerkungen dieselben', () => {
    const s = zustand()
    const p = plan([vortrag(s.weeks[0]!.start), vortrag('2026-11-02')])
    const einmal = reducer(s, { type: 'vortragsplanUebernehmen', plan: p })
    const zweimal = reducer(einmal, { type: 'vortragsplanUebernehmen', plan: p })
    expect(zweimal.weeks).toBe(einmal.weeks)
    expect(zweimal.vortraege).toBe(einmal.vortraege)
  })
})

describe('Wege ohne eigene Aktion', () => {
  const vorgemerkt: VorgemerkterVortrag = {
    id: 'v1', woche: '2026-10-12', redner: 'Max Mustermann', versammlung: 'Musterstadt', eigener: false, pid: null, thema: 'Demo-Thema 1', lied: '151',
  }

  it('eine später geholte Woche bekommt ihren vorgemerkten Vortrag', () => {
    const s = zustand({ vortraege: [vorgemerkt] })
    const next = reducer(s, { type: 'addImportedWeek', week: { ...structuredClone(s.weeks[0]!), start: '2026-10-12' } })
    expect(vortragDerWoche(next.weeks.at(-1)!)).toEqual({
      redner: 'Max Mustermann', versammlung: 'Musterstadt', eigener: false, thema: 'Demo-Thema 1', lied: '151',
    })
  })

  it('mit einer Person geht nur ihre Id, nicht der Vortrag', () => {
    const s = zustand({ vortraege: [{ ...vorgemerkt, eigener: true, versammlung: '', pid: 'p5' }] })
    const next = reducer(s, { type: 'removePerson', id: 'p5' })
    expect(next.vortraege).toEqual([expect.objectContaining({ id: 'v1', redner: 'Max Mustermann', pid: null })])
  })

  it('eine Momentaufnahme von vor T122 lädt mit leerer Liste', () => {
    const { vortraege: _weg, ...rest } = zustand({ vortraege: [vorgemerkt] })
    // Der Zustand nennt die Mitteilungen `notifs`, die Ladung `notifications` —
    // die trägt jede Ladung, auch jede Momentaufnahme (seit Juli 2026).
    const payload = { ...rest, notifications: [] } as unknown as HydratePayload
    const next = reducer(zustand(), { type: 'hydrate', payload })
    expect(next.vortraege).toEqual([])
  })
})
