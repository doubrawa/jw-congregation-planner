/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest'
import { demoZustand } from '../../tests/testdaten/demo-start'
import type { AppState } from '../app/context'
import type { SlotSelection } from '../data/types'
import { istGewaehlt, zuteilenInSpalte } from './planen-raster'

/**
 * **Zuteilen am Desktop** (T121, Phase 5d-2): Wann steht es in der Spalte neben
 * dem Plan, und welcher Platz ist darin gewählt? Zwei Fragen, an denen die
 * Spalte, das Blatt in AppShell und die Markierung im Plan hängen — antworteten
 * sie verschieden, stünde ein Platz doppelt da oder gar nicht.
 */

const TEIL: SlotSelection = { kind: 'part', wi: 0, tab: 'mid', si: 1, ii: 2, ni: 0, label: 'Punkt', priv: null, groups: false }

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

  it('ohne Auswahl und beim Treffpunkt ist nichts gewählt', () => {
    expect(istGewaehlt(null, { kind: 'ratgeber', wi: 0, tab: 'mid' })).toBe(false)
    const fs: SlotSelection = { kind: 'fs', wi: 0, instId: 'x', label: 'Treffpunkt', priv: 'treffpunkt', groups: false }
    expect(istGewaehlt(fs, { kind: 'ratgeber', wi: 0, tab: 'mid' })).toBe(false)
  })
})

describe('zuteilenInSpalte', () => {
  const zustand = (over: Partial<AppState> = {}): AppState => ({
    ...demoZustand(),
    screen: 'planen', tab: 'mid', week: 0, planner: true, userId: 'u1', slotSel: TEIL,
    ...over,
  })

  it('am Desktop beim Plan der Zusammenkünfte', () => {
    expect(zuteilenInSpalte(zustand(), true)).toBe(true)
  })

  it('nicht unter 1180 px — dort teilt das Blatt zu', () => {
    expect(zuteilenInSpalte(zustand(), false)).toBe(false)
  })

  it('nicht außerhalb des Planens, nicht in „Woche einrichten", nicht ohne Woche', () => {
    expect(zuteilenInSpalte(zustand({ screen: 'start' }), true)).toBe(false)
    expect(zuteilenInSpalte(zustand({ tab: 'edit' }), true)).toBe(false)
    expect(zuteilenInSpalte(zustand({ weeks: [] }), true)).toBe(false)
  })

  it('der Treffpunkt behält sein Blatt — für ihn gibt es keine Spalte', () => {
    const fs: SlotSelection = { kind: 'fs', wi: 0, instId: 'x', label: 'Treffpunkt', priv: 'treffpunkt', groups: false }
    expect(zuteilenInSpalte(zustand({ tab: 'fs', slotSel: fs }), true)).toBe(false)
  })
})
