import { describe, expect, it } from 'vitest'
import {
  buildFsWeeks,
  fsAddInst,
  fsAutoAssign,
  fsClear,
  fsLeaderValue,
  fsRemoveInst,
  fsSetLeader,
  fsSort,
  fsTag,
  fsUpdateInst,
  FS_LOAD_WEEKS,
  genFsWeek,
  regenFsWeeks,
  deriveMyFsTasks,
  fsVerwaisteZusagen,
  fsVerwaisteZusagenAller,
  fsWeekConflicts,
} from './fs'
import { emptyQualifications } from './helpers'
import { montagNach } from './meeting-dates'
import type { Absence, FsInstance, FsRule, Person } from './types'

/** Treffpunkt-qualifizierte Person (priv.treffpunkt gesetzt). */
function tpLeader(patch: Partial<Person>): Person {
  return {
    id: 'x', fn: 'Max', ln: 'Muster', role: 'verkuendiger', female: false,
    tel: '', mail: '',
    priv: { ...emptyQualifications(), treffpunkt: true },
    ...patch,
  }
}

/** Minimaler Treffpunkt für die Auto-Zuteilungs-Tests. */
function inst(patch: Partial<FsInstance>): FsInstance {
  return { id: 'i', ruleId: null, grp: null, wd: 1, time: '09:30', place: 'KH', leader: '', ...patch }
}

/** Montag der Woche 0 = 7. September 2026 (wie im Demo). */
const MONTAG_0 = '2026-09-07'
/**
 * Die Wochenkennungen ab MONTAG_0 — seit T100 hängen Schlüssel und Datum daran
 * und nicht mehr an der Ordnungszahl. Hier lückenlos, also genau `wi` Wochen
 * nach dem ersten Montag.
 */
const KENN = Array.from({ length: 8 }, (_unused, wi) => montagNach(MONTAG_0, wi))

/** Grundplan wie im Design-Seed: Versammlung Mo/Mi wöchentlich + 1. Sa im Monat; je Gruppe Sa. */
const RULES: FsRule[] = [
  { id: 'r1', grp: null, wd: 1, time: '14:00', place: 'Königreichssaal', monthly: 0, skipCong: false },
  { id: 'r2', grp: null, wd: 3, time: '09:30', place: 'Königreichssaal', monthly: 0, skipCong: false },
  { id: 'r3', grp: null, wd: 6, time: '09:30', place: 'Königreichssaal', monthly: 1, skipCong: false },
  { id: 'r4', grp: 'g1', wd: 6, time: '09:30', place: 'Bei Familie Albrecht', monthly: 0, skipCong: true },
  { id: 'r5', grp: 'g2', wd: 6, time: '09:15', place: 'Nebenraum', monthly: 0, skipCong: true },
  { id: 'r6', grp: 'g3', wd: 6, time: '10:00', place: 'Videokonferenz', monthly: 0, skipCong: true },
  { id: 'r7', grp: 'g4', wd: 6, time: '09:30', place: 'Bei Familie Vogel', monthly: 0, skipCong: true },
]

const ids = (insts: { ruleId: string | null }[]) => insts.map((i) => i.ruleId)

/**
 * Wochentag `wd` in Woche `wi` bei lückenlosem Bestand.
 *
 * Bis T101 gab es dafür `fsDate(base, wi, wd)`. Die Rechnung ist jetzt zerlegt:
 * die Woche bringt ihren Montag mit (`Week.start`), `fsTag` den Versatz darin —
 * damit die Wochen ihren Montag auch dann aus der eigenen Zeile nehmen, wenn im
 * Bestand eine fehlt. Ohne Lücke kommt hier dasselbe heraus wie vorher.
 */
const tagIn = (wi: number, wd: number): Date => fsTag(KENN[wi]!, wd)!

describe('Wochentag im Wochenraster', () => {
  it('bildet Wochentage ab dem Montag der Woche ab', () => {
    expect(tagIn(0, 1).getDate()).toBe(7) // Mo 7. Sep
    expect(tagIn(0, 3).getDate()).toBe(9) // Mi 9. Sep
    expect(tagIn(0, 6).getDate()).toBe(12) // Sa 12. Sep
    expect(tagIn(0, 0).getDate()).toBe(13) // So 13. Sep (Ende der Woche)
    expect(tagIn(1, 1).getDate()).toBe(14) // Mo der Folgewoche
  })
})

describe('genFsWeek', () => {
  it('Woche 0: wöchentliche Versammlung (Mo/Mi) + alle Gruppen-Samstage; kein 1.-Sa (fällt auf 12.9.)', () => {
    const w0 = genFsWeek(KENN[0]!, RULES)
    expect(ids(w0)).toContain('r1')
    expect(ids(w0)).toContain('r2')
    expect(ids(w0)).not.toContain('r3') // 12.9. ist der 2. Samstag
    for (const g of ['r4', 'r5', 'r6', 'r7']) expect(ids(w0)).toContain(g)
  })

  it('Woche 3: 1. Samstag im Monat (3.10.) → Versammlungstreffpunkt, Gruppen-Samstage entfallen (skipCong)', () => {
    const w3 = genFsWeek(KENN[3]!, RULES)
    expect(tagIn(3, 6).getDate()).toBe(3) // Sa 3. Oktober = 1. Samstag
    expect(ids(w3)).toContain('r3')
    for (const g of ['r4', 'r5', 'r6', 'r7']) expect(ids(w3)).not.toContain(g)
    expect(ids(w3)).toContain('r1') // wöchentliche bleiben
  })

  it('skipCong greift nur bei Versammlungstreffpunkt am selben Wochentag', () => {
    // Ohne die 1.-Sa-Regel bleiben die Gruppen-Samstage in jeder Woche.
    const noCongSat = RULES.filter((r) => r.id !== 'r3')
    const w3 = genFsWeek(KENN[3]!, noCongSat)
    for (const g of ['r4', 'r5', 'r6', 'r7']) expect(ids(w3)).toContain(g)
  })

  it('sortiert nach Wochentag (Mo vor Sa)', () => {
    const w0 = genFsWeek(KENN[0]!, RULES)
    const wds = w0.map((i) => (i.wd + 6) % 7)
    expect([...wds]).toEqual([...wds].sort((a, b) => a - b))
  })
})

/*
 * Hier stand bis zum 25.9.2026 `fsBaseFromWeeks`: der Montag der Woche 0,
 * zurückgerechnet aus der ersten Woche mit Startdatum, mit `heute` als Rückfall
 * für Wochen ohne. Seit `Week.start` Pflicht ist, gibt es keine Woche ohne
 * Montag — und damit weder Basis noch Rückfall. Jede Woche nennt ihren Montag
 * selbst; was daran hängt, prüfen `genFsWeek` darüber und `fs-kennung.test.ts`.
 */

describe('regenFsWeeks (Neu-Ausrichtung)', () => {
  const RULE: FsRule[] = [
    { id: 'r1', grp: null, wd: 1, time: '14:00', place: 'Königreichssaal', monthly: 0, skipCong: false },
  ]
  it('preserveEdits behält wochenspezifische Zeit/Ort + Leiter', () => {
    const built = buildFsWeeks(KENN.slice(0, 1), RULE, { '0|r1': 'A. Leiter' })
    const edited = built.map((wk) => wk.map((i) => ({ ...i, place: 'Anderswo', time: '15:30' })))
    const keep = regenFsWeeks(KENN, edited, RULE, true)
    expect(keep[0][0].place).toBe('Anderswo')
    expect(keep[0][0].time).toBe('15:30')
    expect(keep[0][0].leader).toBe('A. Leiter')
  })
  it('ohne preserveEdits: Zeit/Ort auf Regelwerte zurück, Leiter bleibt', () => {
    const built = buildFsWeeks(KENN.slice(0, 1), RULE, { '0|r1': 'A. Leiter' })
    const edited = built.map((wk) => wk.map((i) => ({ ...i, place: 'Anderswo' })))
    const reset = regenFsWeeks(KENN, edited, RULE, false)
    expect(reset[0][0].place).toBe('Königreichssaal')
    expect(reset[0][0].leader).toBe('A. Leiter')
  })

  it('der Leiter bleibt mit seiner Person-Id — nicht nur mit dem Namen', () => {
    // Ohne Id fiele jede spätere Zuordnung auf den Namen zurück: Umbenennen
    // kostete die Zusage, und ein Namensvetter erbte sie (`dieselbePerson`).
    const mitId = [[{ ...buildFsWeeks(KENN.slice(0, 1), RULE)[0]![0]!, leader: 'Anton Muster', lpid: 'p1' }]]
    for (const erhalten of [true, false]) {
      const [woche] = regenFsWeeks(KENN, mitId, [{ ...RULE[0]!, place: 'Markt' }], erhalten)
      expect(woche?.[0], `preserveEdits=${erhalten}`).toMatchObject({ leader: 'Anton Muster', lpid: 'p1' })
    }
  })

  it('eine Woche, die die Regeländerung nicht betrifft, bleibt dieselbe — auch mit zugeteilten Leitern', () => {
    // An der Referenz erkennt `persist.ts`, was es schreiben muss. Ging die
    // Person-Id beim Neuerzeugen verloren, galt jede besetzte Woche als
    // geändert — und jeder Tastenanschlag im Ort einer Regel schrieb sie alle.
    const regeln: FsRule[] = [...RULE, { id: 'r2', grp: null, wd: 3, time: '10:00', place: 'Saal', monthly: 0, skipCong: false }]
    const wochen = regenFsWeeks(KENN, buildFsWeeks(KENN.slice(0, 1), regeln), regeln)
    const besetzt = [wochen[0]!.map((i) => ({ ...i, leader: 'Anton Muster', lpid: 'p1' }))]
    expect(regenFsWeeks(KENN, besetzt, regeln)[0]).toBe(besetzt[0])
  })
})

describe('buildFsWeeks', () => {
  it('materialisiert alle Wochen und belegt Seed-Leiter', () => {
    const seed = { '0|r1': 'Thomas Lindner', '3|r3': 'Simon Krüger' }
    const weeks = buildFsWeeks(KENN.slice(0, 4), RULES, seed)
    expect(weeks).toHaveLength(4)
    expect(weeks[0].find((i) => i.id === 'r1')?.leader).toBe('Thomas Lindner')
    expect(weeks[3].find((i) => i.id === 'r3')?.leader).toBe('Simon Krüger')
    // Nicht geseedete Instanzen bleiben offen.
    expect(weeks[0].find((i) => i.id === 'r2')?.leader).toBe('')
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
    { id: 'r1', grp: null, wd: 1, time: '14:00', place: 'Saal', monthly: 0, skipCong: false },
    { id: 'r2', grp: null, wd: 3, time: '09:30', place: 'Saal', monthly: 0, skipCong: false },
  ]
  const build = () => buildFsWeeks(KENN.slice(0, 2), RULE)

  it('fsLeaderValue liest den Leiter ("" wenn offen/unbekannt)', () => {
    const w = build()
    expect(fsLeaderValue(w, 0, 'r1')).toBe('')
    expect(fsLeaderValue(w, 0, 'gibtsnicht')).toBe('')
    expect(fsLeaderValue(w, 99, 'r1')).toBe('') // Woche außerhalb
  })

  it('fsSetLeader setzt und entfernt den Leiter, nur in der Zielwoche', () => {
    const w = build()
    const set = fsSetLeader(w, 0, 'r1', 'A. Leiter')
    expect(fsLeaderValue(set, 0, 'r1')).toBe('A. Leiter')
    expect(set[1]).toBe(w[1]) // andere Wochen behalten ihre Referenz
    expect(w[0][0].leader).toBe('') // Original unverändert (rein)
    expect(fsLeaderValue(fsSetLeader(set, 0, 'r1', ''), 0, 'r1')).toBe('')
  })

  it('fsUpdateInst ändert Zeit/Ort und sortiert neu', () => {
    const w = build()
    // r2 (Mi 09:30) auf Mo-Zeit vorziehen → bleibt aber Mi; nur Zeit/Ort ändern
    const upd = fsUpdateInst(w, 0, 'r2', { time: '08:00', place: 'Neu' })
    const r2 = upd[0].find((i) => i.id === 'r2')!
    expect(r2.time).toBe('08:00')
    expect(r2.place).toBe('Neu')
  })

  it('fsRemoveInst entfernt genau eine Instanz der Woche', () => {
    const w = build()
    const rm = fsRemoveInst(w, 0, 'r1')
    expect(rm[0].some((i) => i.id === 'r1')).toBe(false)
    expect(rm[0].some((i) => i.id === 'r2')).toBe(true)
  })

  it('fsAddInst fügt eine manuelle Instanz ein und sortiert', () => {
    const w = build()
    const manual: FsInstance = { id: 'xM', ruleId: null, grp: null, wd: 2, time: '07:00', place: 'X', leader: '', manual: true }
    const add = fsAddInst(w, 0, manual)
    expect(add[0].some((i) => i.id === 'xM')).toBe(true)
    // wd 2 (Di) liegt zwischen Mo(1) und Mi(3) → einsortiert
    const wds = add[0].map((i) => (i.wd + 6) % 7)
    expect([...wds]).toEqual([...wds].sort((a, b) => a - b))
  })
})

describe('fsAutoAssign (Treffpunkt-Leiter automatisch)', () => {
  it('besetzt offene Leiter ausgewogen mit qualifizierten Personen', () => {
    const week = [inst({ id: 'a', wd: 1 }), inst({ id: 'b', wd: 3 })]
    const persons = [tpLeader({ id: 'p1', fn: 'Anton' }), tpLeader({ id: 'p2', fn: 'Bernd' })]
    const { fsWeeks, count } = fsAutoAssign([week], 0, persons)
    expect(count).toBe(2)
    const leaders = fsWeeks[0].map((i) => i.leader)
    expect(leaders.every(Boolean)).toBe(true)
    expect(new Set(leaders).size).toBe(2) // Lastausgleich → zwei verschiedene
  })

  it('überspringt am Tag des Treffpunkts abwesende Personen', () => {
    // Basis-Montag 7.9.2026; wd 1 = Montag der Woche 0, also der 7.9.
    const week = [inst({ id: 'a', wd: 1 })]
    const persons = [tpLeader({ id: 'p1', fn: 'Anton' }), tpLeader({ id: 'p2', fn: 'Bernd' })]
    const abw: Absence[] = [
      { id: 'x', personId: 'p1', userId: '', from: '2026-09-05', to: '2026-09-09', reason: '' },
    ]
    const { fsWeeks } = fsAutoAssign([week], 0, persons, null, abw, '2026-09-07')
    expect(fsWeeks[0][0].leader).toBe('Bernd Muster')
  })

  it('sperrt nur den Tag, nicht die ganze Woche', () => {
    // Anton ist am Wochenende weg — den Treffpunkt am Montag kann er leiten.
    const week = [inst({ id: 'a', wd: 1 })] // Montag, 7.9.
    const persons = [tpLeader({ id: 'p1', fn: 'Anton' })]
    const abw: Absence[] = [
      { id: 'x', personId: 'p1', userId: '', from: '2026-09-12', to: '2026-09-13', reason: '' },
    ]
    const { fsWeeks } = fsAutoAssign([week], 0, persons, null, abw, '2026-09-07')
    expect(fsWeeks[0][0].leader).toBe('Anton Muster')
  })

  it('wechselt die Reihenfolge bei Gleichstand von Woche zu Woche', () => {
    // Der Tie-Break entscheidet, solange alle gleich ausgelastet sind. Die
    // frühere eigene Hash-Fassung ohne Avalanche schrieb die Woche nur in die
    // niedrigsten Bits, den Namen in die hohen — die Rangfolge war damit in
    // JEDER Woche dieselbe, und wer hinten stand, leitete nie. Hier startet
    // jede Woche mit leerer Grundlast, damit wirklich nur der Tie-Break zählt.
    const persons = ['Anton', 'Bernd', 'Cäsar', 'Dieter', 'Emil'].map((fn, i) =>
      tpLeader({ id: `p${i}`, fn }),
    )
    const ersteWahl = new Set<string>()
    for (let wi = 0; wi < 20; wi++) {
      // Davor lauter leere Wochen: die Grundlast bleibt für alle null, es
      // entscheidet ausschließlich der Tie-Break für dieses `wi`.
      const wochen = Array.from({ length: wi }, (): ReturnType<typeof inst>[] => [])
      wochen.push([inst({ id: 'a', wd: 1 })])
      const { fsWeeks } = fsAutoAssign(wochen, wi, persons)
      const leiter = fsWeeks[wi][0].leader
      expect(leiter).toBeTruthy()
      ersteWahl.add(leiter)
    }
    // Gemessen über diese 20 Wochen: die alte Fassung erreichte 2 der 5
    // Kandidaten (und bei gleicher Stringlänge, wi 0–9, genau EINEN — die
    // zweite Rangliste entsteht erst, wenn die Wochennummer zweistellig wird
    // und den Hash verlängert). Die gemischte erreicht alle 5.
    expect(ersteWahl.size).toBeGreaterThanOrEqual(4)
  })

  it('setzt nicht dieselbe Person zweimal am selben Wochentag', () => {
    const week = [inst({ id: 'a', grp: null, wd: 6 }), inst({ id: 'b', grp: 'g1', wd: 6 })]
    const persons = [tpLeader({ id: 'p1', fn: 'Anton' }), tpLeader({ id: 'p2', fn: 'Bernd' })]
    const { fsWeeks } = fsAutoAssign([week], 0, persons)
    expect(new Set(fsWeeks[0].map((i) => i.leader)).size).toBe(2)
  })

  it('lässt bereits gesetzte Leiter unangetastet; ohne Kandidaten bleibt offen', () => {
    const week = [inst({ id: 'a', wd: 1, leader: 'Fix Belegt' }), inst({ id: 'b', wd: 3 })]
    const { fsWeeks, count } = fsAutoAssign([week], 0, []) // keine qualifizierten Kandidaten
    expect(count).toBe(0)
    expect(fsWeeks[0][0].leader).toBe('Fix Belegt')
    expect(fsWeeks[0][1].leader).toBe('')
  })

  it('onlyGroup besetzt nur Treffpunkte der Gruppe', () => {
    const week = [inst({ id: 'a', grp: null, wd: 1 }), inst({ id: 'b', grp: 'g1', wd: 3 })]
    const persons = [tpLeader({ id: 'p1', fn: 'Anton' })]
    const { fsWeeks, count } = fsAutoAssign([week], 0, persons, 'g1')
    expect(count).toBe(1)
    expect(fsWeeks[0].find((i) => i.grp == null)?.leader).toBe('')
    expect(fsWeeks[0].find((i) => i.grp === 'g1')?.leader).toBe('Anton Muster')
  })
})

describe('fsClear (Treffpunkt-Leiter leeren)', () => {
  it('leert alle Leiter der Woche', () => {
    const week = [inst({ id: 'a', leader: 'X' }), inst({ id: 'b', leader: 'Y' })]
    const { fsWeeks, count } = fsClear([week], 0)
    expect(count).toBe(2)
    expect(fsWeeks[0].every((i) => !i.leader)).toBe(true)
  })

  it('onlyGroup leert nur die Gruppe', () => {
    const week = [inst({ id: 'a', grp: null, leader: 'X' }), inst({ id: 'b', grp: 'g1', leader: 'Y' })]
    const { fsWeeks, count } = fsClear([week], 0, 'g1')
    expect(count).toBe(1)
    expect(fsWeeks[0].find((i) => i.grp == null)?.leader).toBe('X')
    expect(fsWeeks[0].find((i) => i.grp === 'g1')?.leader).toBe('')
  })
})

describe('Person-Id des Leiters (lpid)', () => {
  it('fsSetLeader schreibt die Id mit', () => {
    const weeks = [[inst({ id: 'a' })]]
    const next = fsSetLeader(weeks, 0, 'a', 'Anton Muster', 'p1')
    expect(next[0][0]).toMatchObject({ leader: 'Anton Muster', lpid: 'p1' })
  })

  it('beim Leeren verschwindet die Id wieder', () => {
    // Sonst gehörte der freie Platz weiter jemandem und stünde bei ihm in
    // „Meine Aufgaben".
    const weeks = [[inst({ id: 'a', leader: 'Anton Muster', lpid: 'p1' })]]
    expect(fsSetLeader(weeks, 0, 'a', '')[0][0].lpid).toBeUndefined()
    expect(fsClear(weeks, 0).fsWeeks[0][0].lpid).toBeUndefined()
  })

  it('ohne Id (Gast, Altdaten) bleibt nur der Name stehen', () => {
    const next = fsSetLeader([[inst({ id: 'a' })]], 0, 'a', 'Ohne Konto')
    expect(next[0][0].leader).toBe('Ohne Konto')
    expect(next[0][0].lpid).toBeUndefined()
  })

  it('die Auto-Zuteilung setzt die Id ebenfalls', () => {
    const persons = [tpLeader({ id: 'p7', fn: 'Anton' })]
    const { fsWeeks } = fsAutoAssign([[inst({ id: 'a' })]], 0, persons)
    expect(fsWeeks[0][0]).toMatchObject({ leader: 'Anton Muster', lpid: 'p7' })
  })
})

describe('Zuteilungsregeln wie bei den Aufgaben', () => {
  const fuenf = ['Anton', 'Bernd', 'Cäsar', 'Dieter', 'Emil'].map((fn, i) =>
    tpLeader({ id: `p${i}`, fn }),
  )

  it('vergisst Leitungen jenseits von FS_LOAD_WEEKS', () => {
    // Vorher zählten ALLE geladenen Wochen: wer vor zwei Jahren viel geleitet
    // hat, blieb dauerhaft hinten, weil die Strichliste nichts vergaß.
    const wi = FS_LOAD_WEEKS + 2
    const wochen: FsInstance[][] = Array.from({ length: wi + 1 }, () => [])
    // Anton: dreimal ganz früh, weit VOR dem Fenster (Woche 0–2).
    for (const w of [0, 1, 2]) {
      wochen[w] = [inst({ id: `alt${w}`, leader: 'Anton Muster', lpid: 'p0' })]
    }
    // Bernd: einmal in der Vorwoche, also mitten IM Fenster.
    wochen[wi - 1] = [inst({ id: 'neu1', leader: 'Bernd Muster', lpid: 'p1' })]
    wochen[wi] = [inst({ id: 'offen' })]
    const { fsWeeks } = fsAutoAssign(wochen, wi, [fuenf[0], fuenf[1]])
    // Im Fenster: Anton 0, Bernd 1 → Anton. Ohne Fenster wäre es umgekehrt
    // (Anton 3, Bernd 1) und Bernd käme dran, obwohl er gerade erst geleitet hat.
    expect(fsWeeks[wi][0].leader).toBe('Anton Muster')
  })

  it('bei gleicher Last kommt zuerst, wer am längsten nicht geleitet hat', () => {
    // Alle fünf stehen im Lastfenster bei genau einer Leitung. Entscheiden muss
    // dann die Wartezeit — vorher entschied allein der Hash, und niemand
    // fragte, wer am längsten dran ist.
    const wochen: FsInstance[][] = Array.from({ length: 8 }, () => [])
    fuenf.forEach((p, i) => {
      // Anton in Woche 6 (zuletzt dran), Emil in Woche 2 (am längsten her).
      wochen[6 - i] = [inst({ id: `v${i}`, leader: `${p.fn} Muster`, lpid: p.id })]
    })
    wochen[7] = [inst({ id: 'offen' })]
    const { fsWeeks } = fsAutoAssign(wochen, 7, fuenf)
    expect(fsWeeks[7][0].leader).toBe('Emil Muster')
  })

  it('wer gerade drankam, gewinnt die Wartezeit nicht gleich noch einmal', () => {
    // Zwei offene Treffpunkte an verschiedenen Tagen derselben Woche: ohne das
    // Zurücksetzen der Wartezeit stünde dieselbe Person bei beiden vorn.
    const wochen: FsInstance[][] = Array.from({ length: 4 }, () => [])
    wochen[3] = [inst({ id: 'a', wd: 1 }), inst({ id: 'b', wd: 3 })]
    const { fsWeeks } = fsAutoAssign(wochen, 3, fuenf)
    expect(fsWeeks[3][0].leader).not.toBe(fsWeeks[3][1].leader)
  })
})

describe('deriveMyFsTasks — Treffpunkte in „Meine Aufgaben"', () => {
  const wochen = (): FsInstance[][] => [
    [inst({ id: 'a', wd: 1, time: '14:00', place: 'Königreichssaal', leader: 'Anton Muster', lpid: 'p1' })],
    [inst({ id: 'b', wd: 3, leader: 'Bernd Muster', lpid: 'p2' })],
  ]

  it('liefert nur die eigenen Leitungen, zugeordnet über die Id', () => {
    const tasks = deriveMyFsTasks(wochen(), KENN, 'Anton Muster', {}, 'p1', 'Treffpunkt-Leiter')
    expect(tasks).toHaveLength(1)
    expect(tasks[0].id).toBe('fs|2026-09-07|a')
    // „Treffpunkt-Leiter" ist eine Rolle und steht deshalb in `rolle`, nicht
    // im Titel: die Anzeige übersetzt beide Hälften verschieden (MyTask.rolle).
    expect(tasks[0]!.title).toBe('')
    expect(tasks[0]!.rolle).toBe('Treffpunkt-Leiter')
  })

  it('die Id schlägt den Namen — Namensgleiche sehen nichts Fremdes', () => {
    // Zwei Personen heißen gleich; nur die mit der passenden Id ist eingeteilt.
    const tasks = deriveMyFsTasks(wochen(), KENN, 'Anton Muster', {}, 'p9', 'Leiter')
    expect(tasks).toEqual([])
  })

  it('ohne Id (Altdaten) zählt weiter der Name', () => {
    const alt = [[inst({ id: 'a', leader: 'Anton Muster' })]]
    expect(deriveMyFsTasks(alt, KENN, 'Anton Muster', {}, 'p1', 'Leiter')).toHaveLength(1)
  })

  it('Termin kanonisch deutsch, mit echtem Zeitstempel für den Countdown', () => {
    const tasks = deriveMyFsTasks(wochen(), KENN, 'Anton Muster', {}, 'p1', 'Leiter')
    // Montag der Woche 0 ist der 7.9.2026; wd 1 = Montag.
    expect(tasks[0].date).toBe('Montag, 7. September · 14:00 · Königreichssaal')
    /*
      `at` ist der **Kalendertag** als UTC-Mitternacht — dieselbe Form, die
      `meetingDateMs` für die Zusammenkünfte liefert (siehe `MyTask.at`).
      Hier stand der Zeitstempel von `fsTag`, also der örtliche Mittag: eine
      zweite Kodierung derselben Angabe, und der Countdown las daraus östlich
      von UTC+12 den Vortag.
    */
    const tag = tagIn(0, 1)
    expect(tasks[0].at).toBe(Date.UTC(tag.getFullYear(), tag.getMonth(), tag.getDate()))
  })

  it('ohne Ort endet der Termin nicht auf einem Trenner', () => {
    /*
     * Ein Treffpunkt ohne Ort ist erlaubt (der Ort ist ein freies Feld). Der
     * Termin wurde hier fest zusammengesetzt und endete dann auf „ · " — im
     * Entzugs-Text, der dieselbe Datenlage beschreibt, stand er sauber. Seit
     * beide über `fsTerminText` gehen, fallen leere Teile in **beiden** heraus.
     */
    const ohneOrt = [[inst({ id: 'a', wd: 1, time: '14:00', place: '', leader: 'Anton Muster', lpid: 'p1' })]]
    const tasks = deriveMyFsTasks(ohneOrt, KENN, 'Anton Muster', {}, 'p1', 'Leiter')
    expect(tasks[0]!.date).toBe('Montag, 7. September · 14:00')
  })

  it('ohne Kennung kein erfundener Termin', () => {
    const tasks = deriveMyFsTasks(wochen(), [], 'Anton Muster', {}, 'p1', 'Leiter')
    expect(tasks[0].at).toBeNull()
    expect(tasks[0].date).toBe('14:00 · Königreichssaal')
  })

  it('übernimmt den Bestätigungs-Status', () => {
    const conf = { 'fs|2026-09-07|a': 'bestätigt' as const }
    const tasks = deriveMyFsTasks(wochen(), KENN, 'Anton Muster', conf, 'p1', 'Leiter')
    expect(tasks[0].status).toBe('bestätigt')
    expect(deriveMyFsTasks(wochen(), KENN, 'Anton Muster', {}, 'p1', 'L')[0].status).toBe('offen')
  })

  it('offene Treffpunkte gehören niemandem', () => {
    const offen = [[inst({ id: 'a', leader: '' })]]
    expect(deriveMyFsTasks(offen, KENN, 'Anton Muster', {}, 'p1', 'L')).toEqual([])
  })
})

/**
 * **Leitet jemand anderes den Treffpunkt, gehört die Zusage niemandem mehr.**
 *
 * Eine Zusage gibt eine Person, gespeichert wird sie unter dem Schlüssel des
 * Platzes. Bis zum 14. September 2026 blieb sie beim Umteilen stehen: Bernd
 * übernahm Antons Treffpunkt und stand sofort als bestätigt da — ohne gefragt
 * worden zu sein, ohne Erinnerung. Sagte er ab, verdeckte Antons alte Zusage
 * seine Absage. Mit dem Ampel-Punkt wäre das ein grüner Punkt an einem Platz,
 * den niemand zugesagt hat.
 *
 * Geprüft wird hier, **welche** Schlüssel verwaisen; dass Reducer und
 * Datenbank sie wirklich abräumen, in `reducer.test.ts` und `persist.test.ts`.
 */
describe('fsVerwaisteZusagen — wann eine Treffpunkt-Zusage verfällt', () => {
  const MONTAG = '2026-09-07'
  const SCHLUESSEL = 'fs|2026-09-07|a'
  const anton = (over: Partial<FsInstance> = {}): FsInstance =>
    inst({ id: 'a', wd: 6, leader: 'Anton Muster', lpid: 'p1', ...over })

  it('ein anderer Leiter: die Zusage des Vorgängers verfällt', () => {
    const bernd = anton({ leader: 'Bernd Muster', lpid: 'p2' })
    expect(fsVerwaisteZusagen([anton()], [bernd], MONTAG)).toEqual([SCHLUESSEL])
  })

  it('ausgetragen: verfällt — der Platz ist wieder offen', () => {
    expect(fsVerwaisteZusagen([anton()], [inst({ id: 'a', wd: 6, leader: '' })], MONTAG)).toEqual([SCHLUESSEL])
  })

  it('der Treffpunkt ist aus der Woche gelöscht: verfällt mit ihm', () => {
    expect(fsVerwaisteZusagen([anton()], [], MONTAG)).toEqual([SCHLUESSEL])
  })

  it('zum Freitext-Leiter gewechselt: verfällt — der Kreisaufseher sagt in der App nichts zu', () => {
    const gast = inst({ id: 'a', wd: 6, leader: 'Kreisaufseher', lext: true })
    expect(fsVerwaisteZusagen([anton()], [gast], MONTAG)).toEqual([SCHLUESSEL])
  })

  it('auch wenn der Gast so heißt wie der Bruder vorher — beim Freitext ist der Name kein Anhalt', () => {
    // Dieselbe Falle wie beim Gastredner (T29): Ein Auswärtiger, der zufällig
    // Anton Muster heißt, übernähme sonst Antons Zusage.
    const namensvetter = inst({ id: 'a', wd: 6, leader: 'Anton Muster', lext: true })
    expect(fsVerwaisteZusagen([anton()], [namensvetter], MONTAG)).toEqual([SCHLUESSEL])
  })

  it('umbenannt: bleibt — es ist dieselbe Person', () => {
    // Die Person-Id entscheidet. Am Namen gemessen, verlöre jeder seine Zusage,
    // dessen Schreibweise der Planer berichtigt.
    expect(fsVerwaisteZusagen([anton()], [anton({ leader: 'Anton Muster-Neu' })], MONTAG)).toEqual([])
  })

  it('Zeit oder Ort geändert: bleibt — der Leiter ist derselbe', () => {
    expect(fsVerwaisteZusagen([anton()], [anton({ time: '10:00', place: 'Markt' })], MONTAG)).toEqual([])
  })

  it('Altdaten ohne Person-Id: der Name entscheidet', () => {
    const alt = inst({ id: 'a', wd: 6, leader: 'Anton Muster' })
    expect(fsVerwaisteZusagen([alt], [{ ...alt }], MONTAG)).toEqual([])
    expect(fsVerwaisteZusagen([alt], [{ ...alt, leader: 'Bernd Muster' }], MONTAG)).toEqual([SCHLUESSEL])
  })

  it('war der Platz vorher offen, gibt es nichts abzuräumen', () => {
    expect(fsVerwaisteZusagen([inst({ id: 'a', wd: 6, leader: '' })], [anton()], MONTAG)).toEqual([])
  })

  it('über mehrere Wochen: nur die geänderte, unter ihrem eigenen Montag', () => {
    // Mit Lücke im Bestand (T100): Die zweite geladene Woche beginnt am 21.,
    // nicht am 14. — dort steht die Zusage, also dort wird abgeräumt.
    const weeks = [{ start: '2026-09-07' }, { start: '2026-09-21' }]
    const ersteWoche = [anton()]
    const vorher = [ersteWoche, [anton()]]
    const nachher = [ersteWoche, [anton({ leader: 'Bernd Muster', lpid: 'p2' })]]
    expect(fsVerwaisteZusagenAller(weeks, vorher, nachher)).toEqual(['fs|2026-09-21|a'])
    expect(fsVerwaisteZusagenAller(weeks, vorher, vorher)).toEqual([])
  })
})

describe('fsWeekConflicts — Konflikte der Treffpunkte', () => {
  const anton = tpLeader({ id: 'p1', fn: 'Anton' })
  // Basis-Montag 7.9.2026 → wd 1 = Mo 7.9., wd 3 = Mi 9.9.
  const abw = (from: string, to: string, personId = 'p1'): Absence[] => [
    { id: 'a', personId, userId: '', from, to, reason: '' },
  ]

  it('meldet, wer am Tag seines Treffpunkts abwesend ist', () => {
    const weeks = [[inst({ id: 'a', wd: 1, place: 'Saal', leader: 'Anton Muster', lpid: 'p1' })]]
    const c = fsWeekConflicts(weeks, 0, [anton], abw('2026-09-05', '2026-09-09'), KENN[0]!)
    expect(c).toEqual([{ kind: 'fsAbsent', name: 'Anton Muster', kennung: 'p1', wd: 1, ort: 'Saal' }])
  })

  it('sperrt nur den Tag, nicht die ganze Woche', () => {
    // Anton ist am Wochenende weg — den Treffpunkt am Montag kann er leiten.
    const weeks = [[inst({ id: 'a', wd: 1, leader: 'Anton Muster', lpid: 'p1' })]]
    expect(fsWeekConflicts(weeks, 0, [anton], abw('2026-09-12', '2026-09-13'), KENN[0]!)).toEqual([])
  })

  it('ordnet über die Person-Id zu, nicht über den Namen', () => {
    // Zwei Personen heißen gleich. Eingeteilt ist p1, abwesend ist p2. Über den
    // Namen gesucht landet man bei der falschen und meldet einen Konflikt, den
    // es nicht gibt — genau dafür trägt der Treffpunkt jetzt eine Id.
    const zwilling = tpLeader({ id: 'p2', fn: 'Anton' }) // ebenfalls „Anton Muster"
    const weeks = [[inst({ id: 'a', wd: 1, leader: 'Anton Muster', lpid: 'p1' })]]
    const c = fsWeekConflicts(weeks, 0, [anton, zwilling], abw('2026-09-05', '2026-09-09', 'p2'), KENN[0]!)
    expect(c).toEqual([])
  })

  it('ohne Wochenkennung entfällt die Abwesenheitsprüfung', () => {
    const weeks = [[inst({ id: 'a', wd: 1, leader: 'Anton Muster', lpid: 'p1' })]]
    expect(fsWeekConflicts(weeks, 0, [anton], abw('2026-09-05', '2026-09-09'), '')).toEqual([])
  })

  it('meldet dieselbe Person zweimal am selben Wochentag', () => {
    // Die Auto-Zuteilung verhindert das; von Hand ist es weiter möglich.
    const weeks = [
      [
        inst({ id: 'a', wd: 6, leader: 'Anton Muster', lpid: 'p1' }),
        inst({ id: 'b', wd: 6, grp: 'g1', leader: 'Anton Muster', lpid: 'p1' }),
      ],
    ]
    const c = fsWeekConflicts(weeks, 0, [anton])
    expect(c).toEqual([{ kind: 'fsDouble', name: 'Anton Muster', kennung: 'p1', wd: 6, count: 2 }])
  })

  it('zwei Treffpunkte an VERSCHIEDENEN Tagen sind kein Konflikt', () => {
    const weeks = [
      [
        inst({ id: 'a', wd: 1, leader: 'Anton Muster', lpid: 'p1' }),
        inst({ id: 'b', wd: 3, leader: 'Anton Muster', lpid: 'p1' }),
      ],
    ]
    expect(fsWeekConflicts(weeks, 0, [anton])).toEqual([])
  })

  it('offene Treffpunkte und fremde Gruppen bleiben außen vor', () => {
    const weeks = [
      [
        inst({ id: 'a', wd: 1, leader: '' }),
        inst({ id: 'b', wd: 1, grp: 'g2', leader: 'Anton Muster', lpid: 'p1' }),
      ],
    ]
    const alle = fsWeekConflicts(weeks, 0, [anton], abw('2026-09-05', '2026-09-09'), KENN[0]!)
    expect(alle).toHaveLength(1) // ohne Gruppenfilter zählt g2 mit
    // Gruppenaufseher sieht nur die eigene Gruppe.
    expect(fsWeekConflicts(weeks, 0, [anton], abw('2026-09-05', '2026-09-09'), KENN[0]!, 'g1')).toEqual([])
  })

  it('nicht geladene Woche → keine Konflikte', () => {
    expect(fsWeekConflicts([], 5, [anton])).toEqual([])
  })
})
