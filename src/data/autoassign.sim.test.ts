import { describe, expect, it } from 'vitest'
import { buildImportWeek, DEMO_SERVICES } from './demo'
import { displayName, isSong, partWorkload, workloadOf } from './helpers'
import { autoAssignMeeting } from './planning'
import type { Meeting, PartItem, Person, Qualifications, QualificationKey, Service, Week } from './types'

/**
 * Simulation der Auto-Zuteilung mit einer großen Versammlung (~100 Personen)
 * über mehrere Wochen. Prüft die Kernregeln (kein Helfer+Aufgabe am selben
 * Tag, Vorsitz betet, fixer WT-Leiter/Vertreter, offen bleibende Slots) und
 * die Ausgewogenheit der Verteilung.
 */

let counter = 0
function priv(on: QualificationKey[]): Qualifications {
  const base: Qualifications = {
    vorsitz: false, vortrag: false, gebet: false, bibellesung: false, leser: false,
    schulung: false, studium: false, mikrofon: false, ton: false, ordner: false, zoomordner: false,
  }
  for (const key of on) base[key] = true
  return base
}
function mk(
  quals: QualificationKey[],
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
function many(n: number, quals: QualificationKey[]): Person[] {
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

describe('Auto-Zuteilung — Simulation (~100 Personen, 12 Wochen)', () => {
  // Konduktor Woche 3 abwesend → Vertreter muss übernehmen.
  const conductor = mk(['studium', 'vorsitz', 'vortrag', 'gebet', 'bibellesung', 'leser', 'schulung'], { wtLeiter: true, absent: [3] })
  const deputy = mk(['studium', 'vorsitz', 'vortrag', 'gebet', 'bibellesung', 'leser', 'schulung'], { wtVertreter: true })
  const elders = many(10, ['vorsitz', 'vortrag', 'gebet', 'studium', 'bibellesung', 'leser', 'schulung'])
  const servants = many(20, ['vortrag', 'gebet', 'bibellesung', 'leser', 'schulung', 'mikrofon', 'ordner'])
  const tonPool = many(4, ['ton']) // nur Ton → für den Balance-Test
  const mikPool = many(12, ['mikrofon'])
  const ordPool = many(16, ['ordner'])
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
    const solo = mk(['ordner'], { absent: [0] })
    const zoomOnly: Service[] = [{ key: 'zoom', name: 'Zoom-Ordner', count: 1, priv: 'ordner', groups: false }]
    const w = simulate([solo], zoomOnly, 1)
    expect(w[0].mid.helpers.zoom?.[0] ?? '').toBe('') // bleibt offen
  })
})

/* ---- Hilfsbauten für Fenster-/Asymmetrie-Tests -------------------------- */

function named(fn: string, ln: string, quals: QualificationKey[]): Person {
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
const MIK1: Service[] = [{ key: 'mik', name: 'Mikrofone', count: 1, priv: 'mikrofon', groups: false }]

describe('Gleitendes Fenster (±3 Wochen)', () => {
  it('zählt nur Einteilungen innerhalb des Fensters', () => {
    const a = named('Anton', 'Anton', ['mikrofon']) // "A. Anton"
    const b = named('Bruno', 'Bruno', ['mikrofon']) // "B. Bruno"
    const weeks: Week[] = Array.from({ length: 6 }, () => wk(emptyMeeting(), emptyMeeting()))
    weeks[0].mid.helpers.mik = ['A. Anton'] // weit weg → außerhalb des Fensters von Woche 5
    weeks[4].mid.helpers.mik = ['B. Bruno'] // nah dran → innerhalb des Fensters
    // Fenster für Woche 5 = [2..5]: A zählt als 0, B als 1 → A wird gewählt
    const res = autoAssignMeeting(weeks, 5, 'mid', [a, b], MIK1)
    expect(res.weeks[5].mid.helpers.mik?.[0]).toBe('A. Anton')
  })
})

describe('Asymmetrie Aufgaben ↔ Hilfsdienste', () => {
  it('wer viele Aufgaben hat, bekommt weniger Hilfsdienste', () => {
    // P hat in der Historie 3 Programmpunkte; drei reine Mikrofon-Leute sind frei.
    const p = named('Paul', 'Part', ['vortrag', 'mikrofon']) // "P. Part"
    const mikOnly = [named('Max', 'Mik1', ['mikrofon']), named('Mia', 'Mik2', ['mikrofon']), named('Mio', 'Mik3', ['mikrofon'])]
    const weeks: Week[] = [
      wk(partHistoryMeeting('P. Part', 3), emptyMeeting()),
      wk(emptyMeeting(), emptyMeeting()),
    ]
    const mik2: Service[] = [{ key: 'mik', name: 'Mikrofone', count: 2, priv: 'mikrofon', groups: false }]
    const res = autoAssignMeeting(weeks, 1, 'mid', [p, ...mikOnly], mik2)
    const mik = res.weeks[1].mid.helpers.mik ?? []
    expect(mik).not.toContain('P. Part') // hohe Gesamtlast → kein Hilfsdienst
    expect(mik.some((n) => n.startsWith('M.'))).toBe(true) // freie Leute übernehmen
  })

  it('Hilfsdienst-Last verringert die Aufgaben-Zuteilung NICHT', () => {
    // Q hat viele Hilfsdienste, aber 0 Aufgaben-Last → volle Chance auf Aufgaben.
    const q = named('Quirin', 'Quell', ['vortrag', 'mikrofon']) // "Q. Quell"
    const history = emptyMeeting()
    history.helpers.mik = ['Q. Quell']
    const weeks: Week[] = [wk(history, emptyMeeting()), wk(history, emptyMeeting()), wk(history, emptyMeeting())]
    // Aufgaben-Last (partWorkload) bleibt 0 trotz vieler Hilfsdienste
    expect(partWorkload(weeks, 'Q. Quell')).toBe(0)
    expect(workloadOf(weeks, 'Q. Quell')).toBeGreaterThan(0)
    // In einer Aufgaben-Auswahl ist Q gleichauf mit einem frischen vortrag-Leut:
    const fresh = named('Rolf', 'Rein', ['vortrag']) // "R. Rein"
    const plan: Week[] = [...weeks, wk(partHistoryMeeting('', 0), emptyMeeting())]
    plan[3].mid = { date: '', end: '', sections: [{ label: 'X', farbe: 'neutral', items: [{ title: 'T', names: [{ name: '', bereichsKey: 'vortrag' }] }] }], helpers: {} }
    const res = autoAssignMeeting(plan, 3, 'mid', [q, fresh], [])
    // Fenster für Woche 3 = [0..3]; Q hat partLoad 0 wie R → einer von beiden
    // bekommt die Aufgabe (nicht durch Hilfsdienste ausgeschlossen).
    const assigned = (res.weeks[3].mid.sections[0].items[0] as PartItem).names[0].name
    expect(['Q. Quell', 'R. Rein']).toContain(assigned)
  })
})
