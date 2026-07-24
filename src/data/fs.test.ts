import { describe, expect, it } from 'vitest'
import { buildFsWeeks, fsDate, genFsWeek } from './fs'
import type { FsRule } from './types'

/** Montag der Woche 0 = 7. September 2026 (wie im Demo). */
const BASE = new Date(2026, 8, 7, 12)

/** Grundplan wie im Design-Seed: Versammlung Mo/Mi wöchentlich + 1. Sa im Monat; je Gruppe Sa. */
const RULES: FsRule[] = [
  { id: 'r1', grp: '', wd: 1, time: '14:00', place: 'Königreichssaal', monthly: 0, skipCong: false },
  { id: 'r2', grp: '', wd: 3, time: '09:30', place: 'Königreichssaal', monthly: 0, skipCong: false },
  { id: 'r3', grp: '', wd: 6, time: '09:30', place: 'Königreichssaal', monthly: 1, skipCong: false },
  { id: 'r4', grp: 'g1', wd: 6, time: '09:30', place: 'Bei Familie Albrecht', monthly: 0, skipCong: true },
  { id: 'r5', grp: 'g2', wd: 6, time: '09:15', place: 'Nebenraum', monthly: 0, skipCong: true },
  { id: 'r6', grp: 'g3', wd: 6, time: '10:00', place: 'Videokonferenz', monthly: 0, skipCong: true },
  { id: 'r7', grp: 'g4', wd: 6, time: '09:30', place: 'Bei Familie Vogel', monthly: 0, skipCong: true },
]

const ids = (insts: { ruleId: string | null }[]) => insts.map((i) => i.ruleId)

describe('fsDate', () => {
  it('bildet Wochentage ab dem Montag der Woche ab', () => {
    expect(fsDate(BASE, 0, 1).getDate()).toBe(7) // Mo 7. Sep
    expect(fsDate(BASE, 0, 3).getDate()).toBe(9) // Mi 9. Sep
    expect(fsDate(BASE, 0, 6).getDate()).toBe(12) // Sa 12. Sep
    expect(fsDate(BASE, 0, 0).getDate()).toBe(13) // So 13. Sep (Ende der Woche)
    expect(fsDate(BASE, 1, 1).getDate()).toBe(14) // Mo der Folgewoche
  })
})

describe('genFsWeek', () => {
  it('Woche 0: wöchentliche Versammlung (Mo/Mi) + alle Gruppen-Samstage; kein 1.-Sa (fällt auf 12.9.)', () => {
    const w0 = genFsWeek(BASE, 0, RULES)
    expect(ids(w0)).toContain('r1')
    expect(ids(w0)).toContain('r2')
    expect(ids(w0)).not.toContain('r3') // 12.9. ist der 2. Samstag
    for (const g of ['r4', 'r5', 'r6', 'r7']) expect(ids(w0)).toContain(g)
  })

  it('Woche 3: 1. Samstag im Monat (3.10.) → Versammlungstreffpunkt, Gruppen-Samstage entfallen (skipCong)', () => {
    const w3 = genFsWeek(BASE, 3, RULES)
    expect(fsDate(BASE, 3, 6).getDate()).toBe(3) // Sa 3. Oktober = 1. Samstag
    expect(ids(w3)).toContain('r3')
    for (const g of ['r4', 'r5', 'r6', 'r7']) expect(ids(w3)).not.toContain(g)
    expect(ids(w3)).toContain('r1') // wöchentliche bleiben
  })

  it('skipCong greift nur bei Versammlungstreffpunkt am selben Wochentag', () => {
    // Ohne die 1.-Sa-Regel bleiben die Gruppen-Samstage in jeder Woche.
    const noCongSat = RULES.filter((r) => r.id !== 'r3')
    const w3 = genFsWeek(BASE, 3, noCongSat)
    for (const g of ['r4', 'r5', 'r6', 'r7']) expect(ids(w3)).toContain(g)
  })

  it('sortiert nach Wochentag (Mo vor Sa)', () => {
    const w0 = genFsWeek(BASE, 0, RULES)
    const wds = w0.map((i) => (i.wd + 6) % 7)
    expect([...wds]).toEqual([...wds].sort((a, b) => a - b))
  })
})

describe('buildFsWeeks', () => {
  it('materialisiert alle Wochen und belegt Seed-Leiter', () => {
    const seed = { '0|r1': 'Thomas Lindner', '3|r3': 'Simon Krüger' }
    const weeks = buildFsWeeks(BASE, 4, RULES, seed)
    expect(weeks).toHaveLength(4)
    expect(weeks[0].find((i) => i.id === '0|r1')?.leader).toBe('Thomas Lindner')
    expect(weeks[3].find((i) => i.id === '3|r3')?.leader).toBe('Simon Krüger')
    // Nicht geseedete Instanzen bleiben offen.
    expect(weeks[0].find((i) => i.id === '0|r2')?.leader).toBe('')
  })
})
