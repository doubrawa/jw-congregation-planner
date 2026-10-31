/** @vitest-environment happy-dom */
import { describe, expect, it } from 'vitest'
import { demoZustand } from '../../tests/testdaten/demo-start'
import type { AppState } from '../app/context'
import type { SlotSelection } from '../data/types'
import { auswahlImPlan, istGewaehlt, planArt, zuteilenInSpalte } from './planen-raster'

/**
 * **Zuteilen am Desktop** (T121, Phase 5d-2 und 5e): Welcher Plan ist zu
 * sehen, steht das Zuteilen in der Spalte daneben, und welcher Platz ist darin
 * gewählt? Fragen, an denen die Leiste, die Spalte, das Blatt in AppShell und
 * die Markierung im Plan hängen — antworteten sie verschieden, stünde ein
 * Platz doppelt da oder gar nicht.
 */

const TEIL: SlotSelection = { kind: 'part', wi: 0, tab: 'mid', si: 1, ii: 2, ni: 0, label: 'Punkt', priv: null, groups: false }
const TREFFPUNKT: SlotSelection = { kind: 'fs', wi: 0, instId: 'x', label: 'Treffpunkt', priv: 'treffpunkt', groups: false }

describe('istGewaehlt', () => {
  it('trifft genau den Platz der Auswahl — Raum eingeschlossen', () => {
    expect(istGewaehlt(TEIL, { kind: 'part', wi: 0, tab: 'mid', si: 1, ii: 2, ni: 0 })).toBe(true)
    expect(istGewaehlt(TEIL, { kind: 'part', wi: 0, tab: 'mid', si: 1, ii: 2, ni: 1 }), 'Partner').toBe(false)
    expect(istGewaehlt(TEIL, { kind: 'part', wi: 0, tab: 'mid', si: 1, ii: 2, ni: 0, aux: true }), 'Klasse').toBe(false)
    expect(istGewaehlt({ ...TEIL, aux: true }, { kind: 'part', wi: 0, tab: 'mid', si: 1, ii: 2, ni: 0, aux: true })).toBe(true)
  })

  it('eine andere Woche oder Zusammenkunft ist ein anderer Platz', () => {
    expect(istGewaehlt(TEIL, { kind: 'part', wi: 1, tab: 'mid', si: 1, ii: 2, ni: 0 })).toBe(false)
    expect(istGewaehlt(TEIL, { kind: 'part', wi: 0, tab: 'we', si: 1, ii: 2, ni: 0 })).toBe(false)
  })

  it('Hilfsdienst nach Dienst und Platz, Ratgeber je Zusammenkunft', () => {
    const helfer: SlotSelection = { kind: 'helper', wi: 0, tab: 'mid', svc: 'mik', pos: 1, label: 'Mikrofone', priv: null, groups: false }
    expect(istGewaehlt(helfer, { kind: 'helper', wi: 0, tab: 'mid', svc: 'mik', pos: 1 })).toBe(true)
    expect(istGewaehlt(helfer, { kind: 'helper', wi: 0, tab: 'mid', svc: 'mik', pos: 0 })).toBe(false)
    const ratgeber: SlotSelection = { kind: 'ratgeber', wi: 0, tab: 'mid', label: 'Ratgeber', priv: 'ratgeber', groups: false }
    expect(istGewaehlt(ratgeber, { kind: 'ratgeber', wi: 0, tab: 'mid' })).toBe(true)
    expect(istGewaehlt(ratgeber, { kind: 'helper', wi: 0, tab: 'mid', svc: 'mik', pos: 1 })).toBe(false)
  })

  it('ein Treffpunkt nach seiner Kennung — und nie ein Platz der Zusammenkunft', () => {
    expect(istGewaehlt(TREFFPUNKT, { kind: 'fs', wi: 0, instId: 'x' })).toBe(true)
    expect(istGewaehlt(TREFFPUNKT, { kind: 'fs', wi: 0, instId: 'y' })).toBe(false)
    expect(istGewaehlt(TREFFPUNKT, { kind: 'fs', wi: 1, instId: 'x' }), 'andere Woche').toBe(false)
    expect(istGewaehlt(TREFFPUNKT, { kind: 'ratgeber', wi: 0, tab: 'mid' })).toBe(false)
  })

  it('ohne Auswahl ist nichts gewählt', () => {
    expect(istGewaehlt(null, { kind: 'ratgeber', wi: 0, tab: 'mid' })).toBe(false)
  })
})

const zustand = (over: Partial<AppState> = {}): AppState => ({
  ...demoZustand(),
  screen: 'planen', tab: 'mid', week: 0, planner: true, userId: 'u1', slotSel: TEIL,
  ...over,
})
/** Aufseher von Gruppe 1, ohne Admin und ohne Zuteilen. */
const gruppenaufseher = (over: Partial<AppState> = {}): AppState => {
  const s = zustand(over)
  return { ...s, planner: false, zuteiler: false, personId: 'p-ov', groups: [{ id: 'g1', name: 'Gruppe 1', overseerId: 'p-ov', assistantId: null }] }
}

describe('planArt — welche Leiste der Plan trägt (T121, Phase 5e)', () => {
  it('die Zusammenkünfte für den, der zuteilt — nicht „Woche einrichten", nicht die Zusagen', () => {
    expect(planArt(zustand())).toBe('zusammenkuenfte')
    expect(planArt(zustand({ tab: 'we' }))).toBe('zusammenkuenfte')
    expect(planArt(zustand({ planner: false, zuteiler: true }))).toBe('zusammenkuenfte')
    expect(planArt(zustand({ tab: 'edit' }))).toBeNull()
    expect(planArt(zustand({ tab: 'zusagen' }))).toBeNull()
  })

  it('die Treffpunkte der Woche — auch für den Gruppenaufseher, gleich welcher Reiter stehen blieb', () => {
    expect(planArt(zustand({ tab: 'fs' }))).toBe('treffpunkte')
    expect(planArt(gruppenaufseher({ tab: 'mid' }))).toBe('treffpunkte')
  })

  it('die Bereiche ohne Woche haben keine Leiste', () => {
    for (const fsBereich of ['gruppenbesuche', 'grundplan'] as const) {
      expect(planArt(zustand({ tab: 'fs', fsBereich })), fsBereich).toBeNull()
    }
  })

  it('ohne Woche und ohne Recht keine', () => {
    expect(planArt(zustand({ weeks: [] }))).toBeNull()
    expect(planArt(zustand({ planner: false, zuteiler: false, personId: null }))).toBeNull()
  })
})

describe('zuteilenInSpalte', () => {
  it('am Desktop beim Plan der Zusammenkünfte', () => {
    expect(zuteilenInSpalte(zustand(), true)).toBe(true)
  })

  it('auch bei den Treffpunkten der Woche (Phase 5e)', () => {
    expect(zuteilenInSpalte(zustand({ tab: 'fs', slotSel: TREFFPUNKT }), true)).toBe(true)
  })

  it('nicht unter 1180 px — dort teilt das Blatt zu', () => {
    expect(zuteilenInSpalte(zustand(), false)).toBe(false)
  })

  it('nicht außerhalb des Planens, nicht in „Woche einrichten" oder den Zusagen, nicht ohne Woche', () => {
    expect(zuteilenInSpalte(zustand({ screen: 'start' }), true)).toBe(false)
    expect(zuteilenInSpalte(zustand({ tab: 'edit' }), true)).toBe(false)
    // Von den Zusagen aus teilt das Blatt zu — als Fenster in der Mitte.
    expect(zuteilenInSpalte(zustand({ tab: 'zusagen' }), true)).toBe(false)
    expect(zuteilenInSpalte(zustand({ weeks: [] }), true)).toBe(false)
  })

  it('nicht bei den Gruppenbesuchen — ihr Besucher behält sein Blatt', () => {
    expect(zuteilenInSpalte(zustand({ tab: 'fs', fsBereich: 'gruppenbesuche' }), true)).toBe(false)
  })
})

describe('auswahlImPlan — die Spalte zeigt nur, was der Plan zeigt', () => {
  it('ein Platz der gezeigten Zusammenkunft dieser Woche', () => {
    expect(auswahlImPlan(zustand(), TEIL)).toBe(true)
    expect(auswahlImPlan(zustand({ tab: 'we' }), TEIL), 'andere Zusammenkunft').toBe(false)
    expect(auswahlImPlan(zustand({ week: 1 }), TEIL), 'andere Woche').toBe(false)
  })

  it('ein Treffpunkt nur beim Plan der Treffpunkte', () => {
    expect(auswahlImPlan(zustand({ tab: 'fs' }), TREFFPUNKT)).toBe(true)
    expect(auswahlImPlan(zustand(), TREFFPUNKT)).toBe(false)
    expect(auswahlImPlan(zustand({ tab: 'fs' }), TEIL)).toBe(false)
  })

  it('ohne Auswahl nichts', () => {
    expect(auswahlImPlan(zustand(), null)).toBe(false)
  })
})
