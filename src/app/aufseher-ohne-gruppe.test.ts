/** @vitest-environment happy-dom */
import { describe, expect, it } from 'vitest'
import { demoZustand } from '../../tests/testdaten/demo-start'
import { erlaubteScreens, rechteVon } from '../data/rechte'
import { fsBereiche } from '../planen/fs-bereiche'
import { reducer } from './reducer'

/**
 * **Der Aufseher der gelöschten Gruppe plant danach nichts mehr** — kein
 * Planen, kein Grundplan. Das entscheidet der Eingang (`rechteVon`,
 * `erlaubteScreens`, `fsBereiche`): Seine Gruppe kommt aus demselben Zustand,
 * und mit ihr geht sie.
 *
 * Bis zum 16.10.2026 prüfte der Grundplan (`FsRulesPanel`) zusätzlich, ob es
 * die Gruppe noch gibt. Die Frage kam dort nie auf, und ihr Test stellte einen
 * Zustand nach, den die App nicht erzeugt (Review, Planen #3).
 */
describe('Der Aufseher der gelöschten Gruppe', () => {
  it('plant danach nichts mehr — weder Planen noch Grundplan', () => {
    const demo = demoZustand()
    const gruppe = demo.groups.find((g) => g.overseerId)
    if (!gruppe?.overseerId) throw new Error('Demo-Bestand ohne Gruppenaufseher')
    const vorher = { ...demo, screen: 'planen' as const, personId: gruppe.overseerId, planner: false, zuteiler: false }
    expect(rechteVon(vorher).gruppe).toBe(gruppe.id)
    expect(fsBereiche(vorher)).toContain('grundplan')

    const nachher = reducer(vorher, { type: 'removeGroup', id: gruppe.id })
    expect(rechteVon(nachher).gruppe).toBeNull()
    expect(erlaubteScreens(rechteVon(nachher))).not.toContain('planen')
    expect(fsBereiche(nachher)).not.toContain('grundplan')
  })
})
