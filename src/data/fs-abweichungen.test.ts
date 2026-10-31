import { describe, expect, it } from 'vitest'
import { fsAbweichungen, genFsWeek } from './fs'
import type { FsRule } from './types'

/**
 * **Was in einer Woche anders ist als sonst** (T121, Phase 9; Entwurf
 * `GDruckTreffpunkte`, Kasten „Anders als sonst"): gemessen am Grundplan ohne
 * die ausgesetzten Wochen.
 */

const WOCHE = '2026-09-07' // Montag; der Samstag ist der 12. September — der 2. im Monat
const regel = (over: Partial<FsRule>): FsRule => ({
  id: 'r1', grp: 'g1', wd: 6, time: '09:30', place: 'Bei Familie A', monthly: 0, skipCong: false, ...over,
})

describe('fsAbweichungen', () => {
  it('nach Plan: nichts anders', () => {
    const regeln = [regel({})]
    expect(fsAbweichungen(WOCHE, regeln, genFsWeek(WOCHE, regeln))).toEqual([])
  })

  it('ein für die Woche entfernter Treffpunkt entfällt', () => {
    const regeln = [regel({ aus: [WOCHE] })]
    const ist = genFsWeek(WOCHE, regeln)
    expect(ist).toEqual([])
    expect(fsAbweichungen(WOCHE, regeln, ist)).toEqual([
      expect.objectContaining({ art: 'entfaellt', regel: regeln[0], inst: expect.objectContaining({ ruleId: 'r1' }) }),
    ])
  })

  it('eine Monatsregel, die in dieser Woche gar nicht greift, entfällt nicht', () => {
    // Jeden 3. Samstag — der 12. September ist der zweite.
    const regeln = [regel({ monthly: 3 })]
    expect(fsAbweichungen(WOCHE, regeln, [])).toEqual([])
  })

  it('ein Treffpunkt nur für diese Woche kommt dazu', () => {
    const extra = { id: 'x0930', ruleId: null, grp: null, wd: 3, time: '09:30', place: 'Marktplatz', leader: '' }
    expect(fsAbweichungen(WOCHE, [], [extra])).toEqual([{ art: 'zusaetzlich', inst: extra }])
  })

  it('anderer Ort, andere Zeit: anders — mit der Regel, die sonst gilt', () => {
    const regeln = [regel({})]
    const ist = genFsWeek(WOCHE, regeln).map((i) => ({ ...i, place: 'Per Video' }))
    expect(fsAbweichungen(WOCHE, regeln, ist)).toEqual([
      expect.objectContaining({ art: 'anders', regel: regeln[0], inst: expect.objectContaining({ place: 'Per Video' }) }),
    ])
  })

  it('mehrere Abweichungen stehen in der Folge der Woche — Mittwoch vor Samstag, früh vor spät, gleich welcher Art', () => {
    // Der Kasten „Anders als sonst" liest sie vor, wie die Woche verläuft.
    // Gesammelt werden sie nach Art (erst was entfällt, dann der Rest).
    const regeln = [regel({ aus: [WOCHE] }), regel({ id: 'r2', grp: null, wd: 3, time: '18:00', place: 'Saal' })]
    const ist = genFsWeek(WOCHE, regeln).map((i) => (i.ruleId === 'r2' ? { ...i, place: 'Per Video' } : i))
    const frueh = { id: 'x0700', ruleId: null, grp: null, wd: 3, time: '07:00', place: 'Marktplatz', leader: '' }
    expect(fsAbweichungen(WOCHE, regeln, [...ist, frueh]).map((a) => [a.art, a.inst.wd, a.inst.time])).toEqual([
      ['zusaetzlich', 3, '07:00'],
      ['anders', 3, '18:00'],
      ['entfaellt', 6, '09:30'],
    ])
  })
})
