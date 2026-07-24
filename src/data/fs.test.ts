import { describe, expect, it } from 'vitest'
import {
  buildFsWeeks,
  fsAddInst,
  fsBaseFromWeeks,
  fsDate,
  fsLeaderValue,
  fsRemoveInst,
  fsSetLeader,
  fsSort,
  fsUpdateInst,
  genFsWeek,
  regenFsWeeks,
} from './fs'
import type { FsInstance, FsRule } from './types'

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

describe('fsBaseFromWeeks', () => {
  const friday = new Date(2026, 6, 24, 15) // Fr 24. Juli 2026 (Woche Mo 20. – So 26.)

  // Regelfall: die Wochen tragen ihr echtes ISO-Startdatum (jw.org-Import). Die
  // Basis MUSS allein daraus kommen — unabhängig von `today` UND vom
  // gespeicherten `current`-Flag. Genau hier lag der Wochenversatz-Bug: die alte
  // Logik verankerte an `current`+`today` und driftete bei veraltetem Flag.
  // Diese Fälle sind bewusst so gewählt, dass die alte Logik ein ANDERES
  // (falsches) Ergebnis liefern würde — sonst würden sie den Bug nicht abfangen.
  describe('aus dem echten week.start', () => {
    it('ignoriert `today` vollständig (Basis rein aus start)', () => {
      // today absichtlich weit weg + inkonsistent: hinge die Basis daran, käme
      // der Versatz zurück. Die alte Logik hätte hier ein 2029/2030-Datum ergeben.
      const base = fsBaseFromWeeks(
        [{ current: false, start: '2026-07-20' }, { current: false, start: '2026-07-27' }],
        new Date(2030, 0, 1, 12),
      )
      expect(base.getFullYear()).toBe(2026)
      expect(base.getMonth()).toBe(6) // Juli
      expect(base.getDate()).toBe(20) // Mo 20. Juli
    })

    it('ignoriert ein veraltetes current-Flag (der eigentliche Bug)', () => {
      // Produktionsfall: today (Fr 24.7.) liegt in der Woche 20.–26.7., aber das
      // gespeicherte current-Flag steht noch auf der Vorwoche (13.–19.7.). Die
      // alte Logik nahm die current-Woche als „heute" → Basis 20.7. statt 13.7.,
      // alles eine Woche zu spät.
      const base = fsBaseFromWeeks(
        [
          { current: true, start: '2026-07-13' }, // veraltet – NICHT die Woche von today
          { current: false, start: '2026-07-20' }, // enthält today
          { current: false, start: '2026-07-27' },
        ],
        friday,
      )
      expect(base.getMonth()).toBe(6)
      expect(base.getDate()).toBe(13) // Montag der Woche 0 = start[0], nicht 20.
      // Die Woche, die today enthält (Index 1), zeigt korrekt IHREN Samstag:
      expect(fsDate(base, 1, 6).getDate()).toBe(25) // Sa 25.7., nicht 1.8.
    })

    it('rechnet vom ersten vorhandenen start auf Woche 0 zurück', () => {
      // Führende Wochen ohne start (Index 0/1), erst Index 2 hat eins (3.8.).
      const base = fsBaseFromWeeks(
        [{ current: false }, { current: true }, { current: false, start: '2026-08-03' }],
        new Date(2030, 0, 1, 12), // today irrelevant, sobald ein start existiert
      )
      expect(base.getMonth()).toBe(6) // Juli
      expect(base.getDate()).toBe(20) // 3.8. − 14 Tage = Mo 20.7.
    })
  })

  // Fallback nur für Wochen OHNE Startdatum (Demo/Vorlagen): dann bleibt als
  // einziger Anhalt das current-Flag relativ zu `today`.
  describe('Fallback ohne week.start (Demo/Vorlagen)', () => {
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

describe('fsSort', () => {
  const inst = (wd: number, time: string, grp = ''): FsInstance => ({
    id: `${wd}${time}`, ruleId: null, grp, wd, time, place: '', leader: '',
  })
  it('ordnet Mo→So, dann Uhrzeit, dann Gruppe', () => {
    // Sonntag (0) muss ans Ende, Montag (1) an den Anfang.
    expect([...[inst(0, '09:00'), inst(1, '09:00')]].sort(fsSort).map((i) => i.wd)).toEqual([1, 0])
    // gleicher Tag → nach Uhrzeit
    expect([inst(6, '10:00'), inst(6, '09:00')].sort(fsSort).map((i) => i.time)).toEqual(['09:00', '10:00'])
    // gleicher Tag + Zeit → nach Gruppe
    expect([inst(6, '09:00', 'g2'), inst(6, '09:00', 'g1')].sort(fsSort).map((i) => i.grp)).toEqual(['g1', 'g2'])
  })
})

describe('fs-Wochenbearbeitung (Planen)', () => {
  const RULE: FsRule[] = [
    { id: 'r1', grp: '', wd: 1, time: '14:00', place: 'Saal', monthly: 0, skipCong: false },
    { id: 'r2', grp: '', wd: 3, time: '09:30', place: 'Saal', monthly: 0, skipCong: false },
  ]
  const build = () => buildFsWeeks(BASE, 2, RULE)

  it('fsLeaderValue liest den Leiter ("" wenn offen/unbekannt)', () => {
    const w = build()
    expect(fsLeaderValue(w, 0, '0|r1')).toBe('')
    expect(fsLeaderValue(w, 0, 'gibtsnicht')).toBe('')
    expect(fsLeaderValue(w, 99, '0|r1')).toBe('') // Woche außerhalb
  })

  it('fsSetLeader setzt und entfernt den Leiter, nur in der Zielwoche', () => {
    const w = build()
    const set = fsSetLeader(w, 0, '0|r1', 'A. Leiter')
    expect(fsLeaderValue(set, 0, '0|r1')).toBe('A. Leiter')
    expect(set[1]).toBe(w[1]) // andere Wochen behalten ihre Referenz
    expect(w[0][0].leader).toBe('') // Original unverändert (rein)
    expect(fsLeaderValue(fsSetLeader(set, 0, '0|r1', ''), 0, '0|r1')).toBe('')
  })

  it('fsUpdateInst ändert Zeit/Ort und sortiert neu', () => {
    const w = build()
    // r2 (Mi 09:30) auf Mo-Zeit vorziehen → bleibt aber Mi; nur Zeit/Ort ändern
    const upd = fsUpdateInst(w, 0, '0|r2', { time: '08:00', place: 'Neu' })
    const r2 = upd[0].find((i) => i.id === '0|r2')!
    expect(r2.time).toBe('08:00')
    expect(r2.place).toBe('Neu')
  })

  it('fsRemoveInst entfernt genau eine Instanz der Woche', () => {
    const w = build()
    const rm = fsRemoveInst(w, 0, '0|r1')
    expect(rm[0].some((i) => i.id === '0|r1')).toBe(false)
    expect(rm[0].some((i) => i.id === '0|r2')).toBe(true)
  })

  it('fsAddInst fügt eine manuelle Instanz ein und sortiert', () => {
    const w = build()
    const manual: FsInstance = { id: 'xM', ruleId: null, grp: '', wd: 2, time: '07:00', place: 'X', leader: '', manual: true }
    const add = fsAddInst(w, 0, manual)
    expect(add[0].some((i) => i.id === 'xM')).toBe(true)
    // wd 2 (Di) liegt zwischen Mo(1) und Mi(3) → einsortiert
    const wds = add[0].map((i) => (i.wd + 6) % 7)
    expect([...wds]).toEqual([...wds].sort((a, b) => a - b))
  })
})
