import { describe, expect, it } from 'vitest'
import { buildFsWeeks, fsBaseFromWeeks, fsDate, genFsWeek, regenFsWeeks } from './fs'
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

describe('fsBaseFromWeeks (echtes Startdatum bevorzugt)', () => {
  const friday = new Date(2026, 6, 24, 15) // Fr 24. Juli 2026 (Woche Mo 20. – So 26.)

  it('leitet die Basis aus week.start ab, unabhängig vom current-Flag', () => {
    // Wochen 20.7. / 27.7. / 3.8.; `current` steht (veraltet) auf Woche 0,
    // obwohl heute (24.7.) in Woche 0 liegt — die Basis muss trotzdem der
    // Montag der Woche 0 sein, nicht davon verschoben.
    const base = fsBaseFromWeeks(
      [
        { current: true, start: '2026-07-20' },
        { current: false, start: '2026-07-27' },
        { current: false, start: '2026-08-03' },
      ],
      friday,
    )
    expect(base.getFullYear()).toBe(2026)
    expect(base.getMonth()).toBe(6) // Juli
    expect(base.getDate()).toBe(20) // Mo 20. Juli
  })

  it('rechnet vom ersten Startdatum auf Woche 0 zurück (Vorwochen ohne start)', () => {
    // Erst ab Index 2 gibt es ein Startdatum (3.8.) → Woche 0 = 2 Wochen davor.
    const base = fsBaseFromWeeks(
      [{ current: false }, { current: false }, { current: false, start: '2026-08-03' }],
      friday,
    )
    expect(base.getMonth()).toBe(6) // Juli
    expect(base.getDate()).toBe(20) // Mo 20. Juli (3.8. − 14 Tage)
  })

  it('die fs-Daten der angezeigten Woche stimmen mit deren Header-Datum überein', () => {
    // Regressionsschutz für den Wochenversatz: der Samstag der Woche „20.–26.7."
    // muss der 25.7. sein (nicht der 1.8. der Folgewoche).
    const base = fsBaseFromWeeks(
      [{ current: true, start: '2026-07-20' }, { current: false, start: '2026-07-27' }],
      friday,
    )
    expect(fsDate(base, 0, 1).getDate()).toBe(20) // Mo 20. Juli
    expect(fsDate(base, 0, 6).getDate()).toBe(25) // Sa 25. Juli
    expect(fsDate(base, 1, 6).getDate()).toBe(1) // Sa der Folgewoche = 1. August
  })

  it('current-Woche bei Index 0 → Montag dieser Woche', () => {
    const base = fsBaseFromWeeks([{ current: true }, { current: false }], friday)
    expect(base.getMonth()).toBe(6)
    expect(base.getDate()).toBe(20) // Mo 20. Juli
  })

  it('current-Woche bei Index 2 → zwei Wochen davor', () => {
    const base = fsBaseFromWeeks(
      [{ current: false }, { current: false }, { current: true }, { current: false }],
      friday,
    )
    expect(base.getMonth()).toBe(6)
    expect(base.getDate()).toBe(6) // Mo 6. Juli (20. − 14 Tage)
  })

  it('Datum der current-Woche stimmt mit der realen Woche überein', () => {
    // current bei Index 1 → fsDate(base, 1, Sa) muss der Samstag dieser Woche sein.
    const base = fsBaseFromWeeks([{ current: false }, { current: true }], friday)
    expect(fsDate(base, 1, 6).getDate()).toBe(25) // Sa 25. Juli
  })
})

describe('regenFsWeeks (Neu-Ausrichtung)', () => {
  const RULE: FsRule[] = [
    { id: 'r1', grp: '', wd: 1, time: '14:00', place: 'Königreichssaal', monthly: 0, skipCong: false },
  ]
  it('preserveEdits behält wochenspezifische Zeit/Ort + Leiter', () => {
    const built = buildFsWeeks(BASE, 1, RULE, { '0|r1': 'A. Leiter' })
    const edited = built.map((wk) => wk.map((i) => ({ ...i, place: 'Anderswo', time: '15:30' })))
    const keep = regenFsWeeks(BASE, edited, RULE, true)
    expect(keep[0][0].place).toBe('Anderswo')
    expect(keep[0][0].time).toBe('15:30')
    expect(keep[0][0].leader).toBe('A. Leiter')
  })
  it('ohne preserveEdits: Zeit/Ort auf Regelwerte zurück, Leiter bleibt', () => {
    const built = buildFsWeeks(BASE, 1, RULE, { '0|r1': 'A. Leiter' })
    const edited = built.map((wk) => wk.map((i) => ({ ...i, place: 'Anderswo' })))
    const reset = regenFsWeeks(BASE, edited, RULE, false)
    expect(reset[0][0].place).toBe('Königreichssaal')
    expect(reset[0][0].leader).toBe('A. Leiter')
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
