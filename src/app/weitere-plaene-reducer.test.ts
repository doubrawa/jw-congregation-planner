/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reducer } from './reducer'
import type { AppState } from './context'
import { demoZustand } from '../../tests/testdaten/demo-start'
import type { PlanEintrag, WeitererPlan } from '../data/types'

/**
 * **Weitere Pläne im Reducer** (T120, Phase 5). Die Regeln selbst prüft
 * `data/weitere-plaene.test.ts`; hier geht es darum, dass jede Aktion sie
 * benutzt — und um das dritte Thema in der Navigation.
 */

const SAAL: WeitererPlan = { id: 'pl-s', name: 'Winterdienst', von: '2026-09-07', bis: '2026-10-04', entwurf: true }
const SPAETER: WeitererPlan = { id: 'pl-w', name: '', von: '2026-11-30', bis: '2027-02-28', entwurf: false }
const woche = (datum: string, grp: string): PlanEintrag => ({ id: `e-${datum}`, planId: 'pl-s', datum, grp })

function zustand(over: Partial<AppState> = {}): AppState {
  return { ...demoZustand(), planner: true, personId: 'p6', plaene: [], planEintraege: [], terminGewaehlt: true, ...over }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 8, 7, 9, 0)) // Montag, 7. September 2026
})
afterEach(() => vi.useRealTimers())

describe('Pläne anlegen, ändern, löschen', () => {
  it('ein neuer Plan wird nach Beginn eingereiht — dieselbe Kennung nicht zweimal', () => {
    let s = reducer(zustand({ plaene: [SPAETER] }), { type: 'wpPlanAnlegen', plan: SAAL })
    expect(s.plaene.map((p) => p.id)).toEqual(['pl-s', 'pl-w'])
    const nochmal = reducer(s, { type: 'wpPlanAnlegen', plan: SAAL })
    expect(nochmal).toBe(s)
    s = reducer(s, { type: 'wpPlanAendern', id: 'pl-s', patch: { name: 'Grundreinigung' } })
    expect(s.plaene[0]!.name).toBe('Grundreinigung')
  })

  it('veröffentlichen und zurückziehen sagen es an', () => {
    const s = reducer(zustand({ plaene: [SAAL] }), { type: 'wpPlanAendern', id: 'pl-s', patch: { entwurf: false } })
    expect(s.plaene[0]!.entwurf).toBe(false)
    expect(s.toast?.text).toBe('Plan veröffentlicht')
    expect(reducer(s, { type: 'wpPlanAendern', id: 'pl-s', patch: { entwurf: true } }).toast?.text).toBe('Plan zurück im Entwurf')
  })

  it('ein kürzerer Zeitraum nimmt die Einträge außerhalb mit — einer, der vor dem Anfang endet, ist keiner', () => {
    const s0 = zustand({ plaene: [SAAL], planEintraege: [woche('2026-09-14', 'g1'), woche('2026-09-28', 'g2')] })
    const s = reducer(s0, { type: 'wpPlanAendern', id: 'pl-s', patch: { bis: '2026-09-20' } })
    expect(s.planEintraege.map((e) => e.datum)).toEqual(['2026-09-14'])
    expect(reducer(s0, { type: 'wpPlanAendern', id: 'pl-s', patch: { bis: '2026-09-01' } })).toBe(s0)
  })

  it('ein gelöschter Plan nimmt seine Einträge mit', () => {
    const s = reducer(zustand({ plaene: [SAAL], planEintraege: [woche('2026-09-14', 'g1')] }), {
      type: 'wpPlanLoeschen',
      id: 'pl-s',
    })
    expect(s.plaene).toEqual([])
    expect(s.planEintraege).toEqual([])
    expect(s.toast?.text).toBe('Plan gelöscht')
  })
})

describe('Plätze', () => {
  it('reihum verteilen: die Wochen an die Gruppen, mit Ansage — ein Plan, den es nicht gibt, ändert nichts', () => {
    const s = reducer(zustand({ plaene: [SAAL] }), { type: 'wpGruppenVerteilen', planId: 'pl-s', abGruppe: 'g2' })
    expect(s.planEintraege.map((e) => e.grp)).toEqual(['g2', 'g3', 'g4', 'g1'])
    expect(s.toast?.text).toBe('Verteilte Wochen: 4')
    const ohne = zustand({ plaene: [SAAL] })
    expect(reducer(ohne, { type: 'wpGruppenVerteilen', planId: 'pl-weg', abGruppe: 'g2' })).toBe(ohne)
  })

  it('die Gruppe einer Woche setzen, ändern, räumen', () => {
    const setzen = (grp: string | null) => ({ type: 'wpEintragSetzen', planId: 'pl-s', datum: '2026-09-14', grp }) as const
    let s = reducer(zustand({ plaene: [SAAL] }), setzen('g1'))
    const id = s.planEintraege[0]!.id
    s = reducer(s, setzen('g2'))
    expect(s.planEintraege).toEqual([expect.objectContaining({ id, grp: 'g2' })])
    s = reducer(s, setzen(null))
    expect(s.planEintraege).toEqual([])
  })

  it('eine gelöschte Gruppe verlässt ihre Woche — die Woche bleibt (wie `on delete set null`)', () => {
    const w = woche('2026-09-14', 'g4')
    const s = reducer(zustand({ plaene: [SAAL], planEintraege: [w] }), { type: 'removeGroup', id: 'g4' })
    expect(s.planEintraege).toEqual([{ ...w, grp: null }])
  })
})

describe('Das dritte Thema', () => {
  it('das Menü führt mit dem Thema zu seinem Reiter — und wieder zurück zur Zusammenkunft', () => {
    let s = reducer(zustand({ screen: 'start', tab: 'mid' }), { type: 'navigate', screen: 'planen', thema: 'weitere' })
    expect(s).toMatchObject({ screen: 'planen', tab: 'wp' })
    s = reducer(s, { type: 'navigate', screen: 'planen', thema: 'zusammenkuenfte' })
    expect(['mid', 'we']).toContain(s.tab)
  })

  it('planen darf es nur ein Planer — ein Verkündiger landet beim Ansehen', () => {
    const s = reducer(zustand({ planner: false, personId: 'p9', screen: 'start' }), {
      type: 'navigate',
      screen: 'planen',
      thema: 'weitere',
    })
    expect(s).toMatchObject({ screen: 'programm', tab: 'wp' })
  })

  it('ein stilles Nachladen lässt die Weiteren Pläne stehen', () => {
    const s = reducer(zustand({ screen: 'start' }), { type: 'navigate', screen: 'programm', thema: 'weitere' })
    const basis = demoZustand()
    const nachgeladen = reducer({ ...s, terminGewaehlt: false }, {
      type: 'hydrate',
      payload: {
        congregationId: 'c1',
        userId: 'u1',
        empty: false,
        congregation: basis.congregation,
        planner: true,
        personId: 'p6',
        persons: basis.persons,
        services: basis.services,
        groups: basis.groups,
        weeks: basis.weeks,
        fsRules: basis.fsRules,
        fsWeeks: basis.fsWeeks,
        gruppenbesuche: [],
        ozTermine: [],
        ozEintraege: [],
        plaene: [],
        planEintraege: [],
        absences: [],
        notifications: [],
        confirmations: {},
        sentLog: {},
        reminders: basis.reminders,
        congLang: basis.congLang,
        progLangs: [],
        auxClass: false,
        members: [],
        invites: [],
      },
    })
    expect(nachgeladen.tab).toBe('wp')
  })
})
