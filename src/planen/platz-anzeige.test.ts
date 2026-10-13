import { describe, expect, it } from 'vitest'
import type { Conflict } from '../data/planning'
import type { FsInstance } from '../data/types'
import { dict } from '../i18n/ui'
import { leiterAnzeige } from './platz-anzeige'
import type { ZusageStand } from './useZusage'

/**
 * **Der Leiter eines Treffpunkts als Platz** (T121, Phase 5e): dieselbe Lage
 * wie ein Platz der Zusammenkunft — und kein Zusagepunkt, wo niemand zusagen
 * kann. Der Freitext-Leiter (meist der Kreisaufseher) hat die App nicht; ein
 * blasser Punkt stünde bei ihm für immer auf „wartet".
 */

const t = dict('de')
const wartet: ZusageStand = { stufe: 'offen', label: t.zusageWartet }
const inst = (over: Partial<FsInstance> = {}): FsInstance => ({
  id: 'f1', ruleId: null, grp: null, wd: 6, time: '09:30', place: 'Saal', leader: '', ...over,
})
const doppelt = (name: string, kennung: string): Conflict => ({ kind: 'fsDouble', name, kennung, wd: 6, count: 2 })

describe('leiterAnzeige', () => {
  it('ohne Leiter ist der Platz offen', () => {
    expect(leiterAnzeige(inst(), () => wartet, undefined, t).lage).toBe('offen')
  })

  it('ein Bruder der Versammlung zeigt den Stand seiner Zusage', () => {
    const a = leiterAnzeige(inst({ leader: 'Theo Treff', lpid: 'p-t' }), () => wartet, undefined, t)
    expect(a.lage).toBe('wartet')
    expect(a.status).toBe(t.zusageWartet)
  })

  it('ein Freitext-Leiter ist besetzt und voll — nach einer Zusage wird gar nicht gefragt', () => {
    let gefragt = false
    const stand = (): ZusageStand => {
      gefragt = true
      return wartet
    }
    const a = leiterAnzeige(inst({ leader: 'Kreisaufseher', lext: true }), stand, undefined, t)
    expect(a.lage).toBe('voll')
    expect(a.status).toBeUndefined()
    expect(gefragt).toBe(false)
  })

  it('zweimal am selben Tag steht aber auch er als Problem da', () => {
    const ks = inst({ leader: 'Kreisaufseher', lext: true })
    const a = leiterAnzeige(ks, () => wartet, doppelt('Kreisaufseher', 'name:Kreisaufseher'), t)
    expect(a.lage).toBe('problem')
    expect(a.hinweis).toBe(t.sheetSchonHeute)
  })

  it('abwesend am Tag des Treffpunkts: ein Problem, mit dem Grund', () => {
    const abwesend: Conflict = { kind: 'fsAbsent', name: 'Theo Treff', kennung: 'p-t', wd: 6 }
    const a = leiterAnzeige(inst({ leader: 'Theo Treff', lpid: 'p-t' }), () => wartet, abwesend, t)
    expect(a.lage).toBe('problem')
    expect(a.hinweis).toBe(t.abwesendChip)
  })

  it('zweimal am selben Tag: ein Problem, „An diesem Tag schon"', () => {
    const a = leiterAnzeige(inst({ leader: 'Theo Treff', lpid: 'p-t' }), () => wartet, doppelt('Theo Treff', 'p-t'), t)
    expect(a.lage).toBe('problem')
    expect(a.hinweis).toBe(t.sheetSchonHeute)
  })
})
