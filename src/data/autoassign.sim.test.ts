import { describe, expect, it } from 'vitest'
import { buildImportWeek, DEMO_SERVICES } from './demo'
import { displayName, isSong, partWorkload, serviceQualKey, workloadOf } from './helpers'
import { autoAssignMeeting, clearAssignments } from './planning'
import type { Group, Meeting, PartItem, Person, Qualifications, Service, Week } from './types'

/**
 * Simulation der Auto-Zuteilung mit einer großen Versammlung (~100 Personen)
 * über mehrere Wochen. Prüft die Kernregeln (kein Helfer+Aufgabe am selben
 * Tag, Vorsitz betet, fixer WT-Leiter/Vertreter, offen bleibende Slots) und
 * die Ausgewogenheit der Verteilung.
 */

/** Bereiche der Demo-Hilfsdienste (je Dienst einer). */
const TON = serviceQualKey('ton')
const MIK = serviceQualKey('mik')
const ZOOM = serviceQualKey('zoom')
/** Die drei Ordner-Dienste sind eigene Bereiche — „Ordner“ heißt hier: alle drei. */
const ORDNER = [serviceQualKey('ord'), serviceQualKey('saal'), serviceQualKey('rund')]

let counter = 0
function priv(on: string[]): Qualifications {
  const base: Qualifications = {
    vorsitzMid: false, vorsitzWe: false, vortrag: false, gebet: false, bibellesung: false, leser: false,
    schulung: false, studium: false,
  }
  for (const key of on) base[key] = true
  return base
}
function mk(
  quals: string[],
  opts: { absent?: number[]; wtLeiter?: boolean; wtVertreter?: boolean; female?: boolean } = {},
): Person {
  counter += 1
  const pv = priv(quals)
  if (opts.wtLeiter) pv.wtLeiter = true
  if (opts.wtVertreter) pv.wtVertreter = true
  return {
    id: `s${counter}`,
    fn: 'Test',
    ln: `P${counter}`, // eindeutiger Anzeigename "T. P<n>"
    role: 'verkuendiger',
    tel: '',
    mail: '',
    absent: opts.absent ?? [],
    priv: pv,
    ...(opts.female ? { female: true } : {}),
  }
}
function many(n: number, quals: string[]): Person[] {
  return Array.from({ length: n }, () => mk(quals))
}

/** Belegte Programmpunkt-Namen einer Zusammenkunft (ohne Lieder/Externe). */
function partNames(meeting: Meeting): string[] {
  const names: string[] = []
  for (const section of meeting.sections) {
    for (const item of section.items) {
      if (isSong(item)) continue
      for (const slot of item.names) {
        if (slot.name && !/Gastredner|Kreisaufseher/.test(slot.rolle ?? '')) names.push(slot.name)
      }
    }
  }
  return names
}
/** Belegte Hilfsdienst-Namen (ohne Gruppen-Rotation). */
function helperNames(meeting: Meeting, services: Service[]): string[] {
  const names: string[] = []
  for (const svc of services) {
    if (svc.groups) continue
    for (const name of meeting.helpers[svc.key] ?? []) if (name) names.push(name)
  }
  return names
}
function openingSlot(meeting: Meeting, rolle: string): string {
  const opening = meeting.sections.find((s) => s.label === 'ERÖFFNUNG')
  const slots = (opening?.items ?? []).flatMap((i) => (isSong(i) ? [] : i.names))
  return slots.find((s) => s.rolle === rolle)?.name ?? ''
}
function wtLeiterName(meeting: Meeting): string {
  const sec = meeting.sections.find((s) => s.label === 'WACHTTURM-STUDIUM')
  const slots = (sec?.items ?? []).flatMap((i) => (isSong(i) ? [] : i.names))
  return slots.find((s) => s.rolle === 'Leiter')?.name ?? ''
}

function simulate(persons: Person[], services: Service[], nWeeks: number): Week[] {
  let weeks: Week[] = Array.from({ length: nWeeks }, () => buildImportWeek())
  for (let wi = 0; wi < nWeeks; wi++) {
    weeks = autoAssignMeeting(weeks, wi, 'mid', persons, services).weeks
    weeks = autoAssignMeeting(weeks, wi, 'we', persons, services).weeks
  }
  return weeks
}

describe('Auto-Zuteilung — getrennter Umfang (Aufgaben / Hilfsdienste)', () => {
  const people: Person[] = [
    mk(['vorsitzMid', 'vorsitzWe', 'vortrag', 'gebet', 'studium', 'bibellesung', 'leser', 'schulung']),
    ...many(6, ['vortrag', 'gebet', 'bibellesung', 'leser', 'schulung']),
    ...many(6, [TON, MIK, ...ORDNER]),
  ]
  const week = () => [buildImportWeek()]

  it("scope 'parts' besetzt Programmpunkte, lässt Hilfsdienste offen", () => {
    const m = autoAssignMeeting(week(), 0, 'mid', people, DEMO_SERVICES, [], 'parts').weeks[0].mid
    expect(partNames(m).length).toBeGreaterThan(0)
    expect(helperNames(m, DEMO_SERVICES)).toEqual([])
  })

  it("scope 'helpers' besetzt Hilfsdienste, lässt Programmpunkte offen", () => {
    const m = autoAssignMeeting(week(), 0, 'mid', people, DEMO_SERVICES, [], 'helpers').weeks[0].mid
    expect(helperNames(m, DEMO_SERVICES).length).toBeGreaterThan(0)
    expect(partNames(m)).toEqual([])
  })
})

describe('Zuteilungen leeren (clearAssignments)', () => {
  const people: Person[] = [
    mk(['vorsitzMid', 'vorsitzWe', 'vortrag', 'gebet', 'studium', 'bibellesung', 'leser', 'schulung']),
    ...many(6, ['vortrag', 'gebet', 'bibellesung', 'leser', 'schulung']),
    ...many(6, [TON, MIK, ...ORDNER]),
  ]
  const planned = (tab: 'mid' | 'we') =>
    autoAssignMeeting([buildImportWeek()], 0, tab, people, DEMO_SERVICES).weeks

  it("scope 'parts' leert Programmpunkte, lässt Hilfsdienste stehen", () => {
    const w = planned('mid')
    const before = w[0].mid
    expect(partNames(before).length).toBeGreaterThan(0)
    expect(helperNames(before, DEMO_SERVICES).length).toBeGreaterThan(0)
    const { weeks, count } = clearAssignments(w, 0, 'mid', 'parts')
    expect(count).toBeGreaterThan(0)
    expect(partNames(weeks[0].mid)).toEqual([])
    expect(helperNames(weeks[0].mid, DEMO_SERVICES)).toEqual(helperNames(before, DEMO_SERVICES))
  })

  it("scope 'helpers' leert Hilfsdienste, lässt Programmpunkte stehen", () => {
    const w = planned('mid')
    const before = w[0].mid
    const { weeks, count } = clearAssignments(w, 0, 'mid', 'helpers')
    expect(count).toBeGreaterThan(0)
    expect(helperNames(weeks[0].mid, DEMO_SERVICES)).toEqual([])
    expect(partNames(weeks[0].mid)).toEqual(partNames(before))
  })

  it("scope 'parts' lässt externe Redner (Gastredner) unangetastet", () => {
    const w = [buildImportWeek()]
    const talk = w[0].we.sections.find((s) => s.label === 'ÖFFENTLICHER VORTRAG')
    const slot = talk && !isSong(talk.items[0]) ? (talk.items[0] as PartItem).names[0] : undefined
    if (slot) slot.name = 'M. Extern'
    const { weeks } = clearAssignments(w, 0, 'we', 'parts')
    const after = weeks[0].we.sections.find((s) => s.label === 'ÖFFENTLICHER VORTRAG')
    const nameAfter = after && !isSong(after.items[0]) ? (after.items[0] as PartItem).names[0].name : ''
    expect(nameAfter).toBe('M. Extern')
  })

  it('leert nur die gewählte Zusammenkunft (Tab), nicht die andere', () => {
    let w = planned('mid')
    w = autoAssignMeeting(w, 0, 'we', people, DEMO_SERVICES).weeks
    const { weeks } = clearAssignments(w, 0, 'mid', 'parts')
    expect(partNames(weeks[0].mid)).toEqual([])
    expect(partNames(weeks[0].we).length).toBeGreaterThan(0)
  })

  it('lässt die Eingabe unverändert (pur)', () => {
    const w = planned('mid')
    const snapshot = JSON.stringify(w)
    clearAssignments(w, 0, 'mid', 'parts')
    expect(JSON.stringify(w)).toBe(snapshot)
  })
})

describe('Auto-Zuteilung — Simulation (~100 Personen, 12 Wochen)', () => {
  // Konduktor Woche 3 abwesend → Vertreter muss übernehmen.
  const conductor = mk(['studium', 'vorsitzMid', 'vorsitzWe', 'vortrag', 'gebet', 'bibellesung', 'leser', 'schulung'], { wtLeiter: true, absent: [3] })
  const deputy = mk(['studium', 'vorsitzMid', 'vorsitzWe', 'vortrag', 'gebet', 'bibellesung', 'leser', 'schulung'], { wtVertreter: true })
  const elders = many(10, ['vorsitzMid', 'vorsitzWe', 'vortrag', 'gebet', 'studium', 'bibellesung', 'leser', 'schulung'])
  const servants = many(20, ['vortrag', 'gebet', 'bibellesung', 'leser', 'schulung', MIK, ...ORDNER])
  const tonPool = many(4, [TON]) // nur Ton → für den Balance-Test
  const mikPool = many(12, [MIK])
  const ordPool = many(16, ORDNER)
  const sisters = Array.from({ length: 24 }, () => mk(['schulung'], { female: true }))
  const readers = many(10, ['bibellesung', 'leser'])
  const speakers = many(6, ['vortrag', 'gebet'])

  const persons: Person[] = [
    conductor, deputy, ...elders, ...servants, ...tonPool, ...mikPool,
    ...ordPool, ...sisters, ...readers, ...speakers,
  ]
  const weeks = simulate(persons, DEMO_SERVICES, 12)

  it('stellt ~100 Personen bereit', () => {
    expect(persons.length).toBeGreaterThanOrEqual(100)
    // eindeutige Anzeigenamen (sonst wären Auslastung/Konflikte falsch)
    const names = persons.map(displayName)
    expect(new Set(names).size).toBe(names.length)
  })

  it('niemand hat Hilfsdienst UND Programmpunkt am selben Tag', () => {
    for (const week of weeks) {
      for (const meeting of [week.mid, week.we]) {
        const parts = new Set(partNames(meeting))
        for (const helper of helperNames(meeting, DEMO_SERVICES)) {
          expect(parts.has(helper)).toBe(false)
        }
      }
    }
  })

  it('einzige Doppel-Aufgabe ist Vorsitz + Anfangsgebet', () => {
    for (const week of weeks) {
      for (const meeting of [week.mid, week.we]) {
        const counts = new Map<string, number>()
        for (const name of partNames(meeting)) counts.set(name, (counts.get(name) ?? 0) + 1)
        const vorsitz = openingSlot(meeting, 'Vorsitz')
        for (const [name, count] of counts) {
          if (count > 1) {
            expect(name).toBe(vorsitz) // nur die Vorsitz-Person darf doppelt sein
            expect(count).toBe(2)
          }
        }
      }
    }
  })

  it('Vorsitz betet zu Beginn (Anfangsgebet = Vorsitz-Person)', () => {
    for (const week of weeks) {
      for (const meeting of [week.mid, week.we]) {
        const vorsitz = openingSlot(meeting, 'Vorsitz')
        if (vorsitz) expect(openingSlot(meeting, 'Gebet')).toBe(vorsitz)
      }
    }
  })

  it('fester WT-Studium-Leiter, Vertreter nur bei dessen Abwesenheit', () => {
    weeks.forEach((week, wi) => {
      const expected = wi === 3 ? displayName(deputy) : displayName(conductor)
      expect(wtLeiterName(week.we)).toBe(expected)
    })
  })

  it('verteilt die Ton-Aufgaben gleichmäßig (Strichliste)', () => {
    const tonNames = new Set(tonPool.map(displayName))
    const counts = new Map<string, number>()
    for (const name of tonNames) counts.set(name, 0)
    for (const week of weeks) {
      for (const meeting of [week.mid, week.we]) {
        const t = meeting.helpers.ton?.[0]
        if (t && counts.has(t)) counts.set(t, (counts.get(t) ?? 0) + 1)
      }
    }
    const values = [...counts.values()]
    expect(Math.min(...values)).toBeGreaterThan(0)
    expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(1)
  })

  it('lässt nicht besetzbare Slots offen (statt zu erzwingen)', () => {
    // Nur ein einziger Zoom-Ordner-fähiger Mensch, der obendrein abwesend ist
    const solo = mk([ZOOM], { absent: [0] })
    const zoomOnly: Service[] = [{ key: 'zoom', name: 'Zoom-Ordner', count: 1, groups: false }]
    const w = simulate([solo], zoomOnly, 1)
    expect(w[0].mid.helpers.zoom?.[0] ?? '').toBe('') // bleibt offen
  })
})

/* ---- Hilfsbauten für Fenster-/Asymmetrie-Tests -------------------------- */

function named(fn: string, ln: string, quals: string[]): Person {
  return { id: `n-${ln}`, fn, ln, role: 'verkuendiger', tel: '', mail: '', absent: [], priv: priv(quals) }
}
function emptyMeeting(): Meeting {
  return { date: '', end: '', sections: [], helpers: {} }
}
/** Meeting mit `n` Programmpunkten, die alle `name` zugeteilt sind (Historie). */
function partHistoryMeeting(name: string, n: number): Meeting {
  const names = Array.from({ length: n }, () => ({ name, bereichsKey: 'vortrag' }))
  return { date: '', end: '', sections: [{ label: 'X', farbe: 'neutral', items: [{ title: 'T', names }] }], helpers: {} }
}
function wk(mid: Meeting, we: Meeting): Week {
  return { range: '', book: '', current: false, mid, we }
}
const MIK1: Service[] = [{ key: 'mik', name: 'Mikrofone', count: 1, groups: false }]

describe('Gleitendes Fenster (±3 Wochen)', () => {
  it('zählt nur Einteilungen innerhalb des Fensters', () => {
    const a = named('Anton', 'Anton', [MIK]) // "A. Anton"
    const b = named('Bruno', 'Bruno', [MIK]) // "B. Bruno"
    const weeks: Week[] = Array.from({ length: 6 }, () => wk(emptyMeeting(), emptyMeeting()))
    weeks[0].mid.helpers.mik = ['Anton Anton'] // weit weg → außerhalb des Fensters von Woche 5
    weeks[4].mid.helpers.mik = ['Bruno Bruno'] // nah dran → innerhalb des Fensters
    // Fenster für Woche 5 = [2..5]: A zählt als 0, B als 1 → A wird gewählt
    const res = autoAssignMeeting(weeks, 5, 'mid', [a, b], MIK1)
    expect(res.weeks[5].mid.helpers.mik?.[0]).toBe('Anton Anton')
  })
})

describe('Asymmetrie Aufgaben ↔ Hilfsdienste', () => {
  it('wer viele Aufgaben hat, bekommt weniger Hilfsdienste', () => {
    // P hat in der Historie 3 Programmpunkte; drei reine Mikrofon-Leute sind frei.
    const p = named('Paul', 'Part', ['vortrag', MIK]) // "P. Part"
    const mikOnly = [named('Max', 'Mik1', [MIK]), named('Mia', 'Mik2', [MIK]), named('Mio', 'Mik3', [MIK])]
    const weeks: Week[] = [
      wk(partHistoryMeeting('Paul Part', 3), emptyMeeting()),
      wk(emptyMeeting(), emptyMeeting()),
    ]
    const mik2: Service[] = [{ key: 'mik', name: 'Mikrofone', count: 2, groups: false }]
    const res = autoAssignMeeting(weeks, 1, 'mid', [p, ...mikOnly], mik2)
    const mik = res.weeks[1].mid.helpers.mik ?? []
    expect(mik).not.toContain('Paul Part') // hohe Gesamtlast → kein Hilfsdienst
    expect(mik.some((n) => n.endsWith('Mik1') || n.endsWith('Mik2') || n.endsWith('Mik3'))).toBe(true) // freie Leute übernehmen
  })

  it('Hilfsdienst-Last verringert die Aufgaben-Zuteilung NICHT', () => {
    // Q hat viele Hilfsdienste, aber 0 Aufgaben-Last → volle Chance auf Aufgaben.
    const q = named('Quirin', 'Quell', ['vortrag', MIK]) // "Q. Quell"
    const history = emptyMeeting()
    history.helpers.mik = ['Quirin Quell']
    const weeks: Week[] = [wk(history, emptyMeeting()), wk(history, emptyMeeting()), wk(history, emptyMeeting())]
    // Aufgaben-Last (partWorkload) bleibt 0 trotz vieler Hilfsdienste
    expect(partWorkload(weeks, 'Quirin Quell')).toBe(0)
    expect(workloadOf(weeks, 'Quirin Quell')).toBeGreaterThan(0)
    // In einer Aufgaben-Auswahl ist Q gleichauf mit einem frischen vortrag-Leut:
    const fresh = named('Rolf', 'Rein', ['vortrag']) // "R. Rein"
    const plan: Week[] = [...weeks, wk(partHistoryMeeting('', 0), emptyMeeting())]
    plan[3].mid = { date: '', end: '', sections: [{ label: 'X', farbe: 'neutral', items: [{ title: 'T', names: [{ name: '', bereichsKey: 'vortrag' }] }] }], helpers: {} }
    const res = autoAssignMeeting(plan, 3, 'mid', [q, fresh], [])
    // Fenster für Woche 3 = [0..3]; Q hat partLoad 0 wie R → einer von beiden
    // bekommt die Aufgabe (nicht durch Hilfsdienste ausgeschlossen).
    const assigned = (res.weeks[3].mid.sections[0].items[0] as PartItem).names[0].name
    expect(['Quirin Quell', 'Rolf Rein']).toContain(assigned)
  })
})

describe('Hilfsdienst-Bereiche (1:1 zum Dienst)', () => {
  const oneWeek = (): Week[] => [wk(emptyMeeting(), emptyMeeting())]

  it('trennt Dienste, die früher einen Bereich teilten (Eingangs- vs. Saalordner)', () => {
    const entranceOnly = named('Erik', 'Eingang', [serviceQualKey('ord')])
    const services: Service[] = [
      { key: 'ord', name: 'Eingangsordner', count: 1, groups: false },
      { key: 'saal', name: 'Saalordner', count: 1, groups: false },
    ]
    const res = autoAssignMeeting(oneWeek(), 0, 'mid', [entranceOnly], services)
    expect(res.weeks[0].mid.helpers.ord?.[0]).toBe('Erik Eingang')
    expect(res.weeks[0].mid.helpers.saal?.[0] ?? '').toBe('') // eigener Bereich → offen
    expect(res.unfilled).toBe(1)
  })

  it('ein neu angelegter Dienst bringt seinen eigenen Bereich mit', () => {
    const parking: Service[] = [{ key: 'svc-parkplatz', name: 'Parkplatz', count: 1, groups: false }]
    const nobody = named('Otto', 'Ohne', [MIK]) // qualifiziert, aber nicht für Parkplatz
    const willing = named('Werner', 'Wagen', [serviceQualKey('svc-parkplatz')])

    const without = autoAssignMeeting(oneWeek(), 0, 'mid', [nobody], parking)
    expect(without.weeks[0].mid.helpers['svc-parkplatz']?.[0] ?? '').toBe('')

    const with_ = autoAssignMeeting(oneWeek(), 0, 'mid', [nobody, willing], parking)
    expect(with_.weeks[0].mid.helpers['svc-parkplatz']?.[0]).toBe('Werner Wagen')
  })

  it('keine Geschlechts-Sperre: Schwestern mit aktiviertem Bereich werden zugeteilt', () => {
    const sister = mk([MIK], { female: true })
    const res = autoAssignMeeting(oneWeek(), 0, 'mid', [sister], MIK1)
    expect(res.weeks[0].mid.helpers.mik?.[0] ?? '').not.toBe('')
  })
})

describe('Predigtdienstgruppen (Reinigung)', () => {
  const emptyMeeting = (): Meeting => ({ date: '', end: '', sections: [], helpers: {} })
  const wk1 = (): Week => ({ range: '', book: '', current: false, mid: emptyMeeting(), we: emptyMeeting() })
  const REIN: Service[] = [{ key: 'rein', name: 'Reinigung', count: 1, groups: true }]

  it('Reinigung rotiert über die konfigurierten Gruppen (mod Anzahl)', () => {
    const groups: Group[] = [
      { id: 'g1', name: 'Gruppe 1', ov: null, as: null },
      { id: 'g2', name: 'Gruppe 2', ov: null, as: null },
    ]
    const weeks: Week[] = Array.from({ length: 3 }, wk1)
    const w0 = autoAssignMeeting(weeks, 0, 'mid', [], REIN, groups).weeks
    const w1 = autoAssignMeeting(weeks, 1, 'mid', [], REIN, groups).weeks
    const w2 = autoAssignMeeting(weeks, 2, 'mid', [], REIN, groups).weeks
    expect(w0[0].mid.helpers.rein?.[0]).toBe('Gruppe 1')
    expect(w1[1].mid.helpers.rein?.[0]).toBe('Gruppe 2')
    expect(w2[2].mid.helpers.rein?.[0]).toBe('Gruppe 1') // 2 % 2 = 0
  })

  it('Aufseher/Gehilfe der reinigenden Gruppe bekommen möglichst keinen weiteren Hilfsdienst', () => {
    // Woche 0 → Gruppe 1 reinigt. Aufseher (Otto) und ein freier Bruder können
    // beide Mikrofon; der Aufseher soll den Mikro-Dienst NICHT bekommen.
    const overseer: Person = {
      id: 'ov1', fn: 'Otto', ln: 'Overseer', role: 'aeltester', tel: '', mail: '', absent: [], priv: priv([MIK]),
    }
    const free = named('Frank', 'Frei', [MIK])
    const groups: Group[] = [{ id: 'g1', name: 'Gruppe 1', ov: 'ov1', as: null }]
    const services: Service[] = [
      { key: 'mik', name: 'Mikrofone', count: 1, groups: false },
      { key: 'rein', name: 'Reinigung', count: 1, groups: true },
    ]
    const res = autoAssignMeeting([wk1()], 0, 'mid', [overseer, free], services, groups)
    expect(res.weeks[0].mid.helpers.mik?.[0]).toBe('Frank Frei')

    // Ohne Alternative bekommt der Aufseher den Dienst trotzdem (weiche Regel).
    const solo = autoAssignMeeting([wk1()], 0, 'mid', [overseer], services, groups)
    expect(solo.weeks[0].mid.helpers.mik?.[0]).toBe('Otto Overseer')
  })
})
