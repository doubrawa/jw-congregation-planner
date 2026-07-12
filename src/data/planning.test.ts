import { describe, expect, it } from 'vitest'
import { buildDemoWeeks, DEMO_PERSONS, DEMO_SERVICES } from './demo'
import { displayName, isSong, workloadOf } from './helpers'
import {
  autoAssignMeeting,
  buildS89ForSlot,
  countOpenSlots,
  itemMinutes,
  lacAdd,
  lacAdjust,
  lacMove,
  lacRemove,
  shiftEnd,
} from './planning'
import type { PartItem, Section } from './types'

/** Namen aller belegten Slots eines Meetings (Programmpunkte + Hilfsdienste). */
function assignedNames(week: ReturnType<typeof buildDemoWeeks>[number], tab: 'mid' | 'we'): string[] {
  const names: string[] = []
  for (const section of week[tab].sections) {
    for (const item of section.items) {
      if (isSong(item)) continue
      for (const slot of item.names) if (slot.name) names.push(slot.name)
    }
  }
  for (const arr of Object.values(week[tab].helpers)) for (const n of arr) if (n) names.push(n)
  return names
}

const lacSectionIndex = (sections: Section[]) =>
  sections.findIndex((s) => s.label === 'UNSER LEBEN ALS CHRIST')

describe('Sonderwochen (v3)', () => {
  const weeks = buildDemoWeeks()

  it('Woche 2 ist Kreisaufseher-Woche mit Dienstvortrag statt VBS', () => {
    expect(weeks[2].co).toBe(true)
    const lac = weeks[2].mid.sections[lacSectionIndex(weeks[2].mid.sections)]
    const dv = lac.items.find((i) => !isSong(i) && i.title.startsWith('„Lauft')) as PartItem
    expect(dv?.names[0]?.rolle).toBe('Kreisaufseher')
    expect(weeks[2].we.sections.map((s) => s.label)).toContain('DIENSTVORTRAG')
  })

  it('Woche 3 ist Gedächtnismahl-Woche (Wochenende ausfallend)', () => {
    expect(weeks[3].mem).toBe(true)
    expect(weeks[3].memCancel).toBe('we')
    expect(weeks[3].we.sections.map((s) => s.label)).toContain('GEDÄCHTNISMAHL')
    expect(weeks[3].we.date).toContain('Samstag, 3. Oktober')
  })
})

describe('Auto-Zuteilung', () => {
  it('überspringt Kreisaufseher-Slots', () => {
    const weeks = buildDemoWeeks()
    const lacSi = lacSectionIndex(weeks[2].mid.sections)
    const dvIi = weeks[2].mid.sections[lacSi].items.findIndex(
      (i) => !isSong(i) && (i as PartItem).title.startsWith('„Lauft'),
    )
    ;(weeks[2].mid.sections[lacSi].items[dvIi] as PartItem).names[0].name = ''
    const { weeks: next } = autoAssignMeeting(weeks, 2, 'mid', DEMO_PERSONS, DEMO_SERVICES)
    const dv = next[2].mid.sections[lacSi].items[dvIi] as PartItem
    expect(dv.names[0].name).toBe('')
  })

  it('lässt Gastredner-Slots offen', () => {
    const weeks = buildDemoWeeks()
    // Öffentlichen Vortrag (Gastredner) leeren, dann Auto-Zuteilung
    ;(weeks[1].we.sections[1].items[0] as PartItem).names[0].name = ''
    const { weeks: next } = autoAssignMeeting(weeks, 1, 'we', DEMO_PERSONS, DEMO_SERVICES)
    const talk = next[1].we.sections[1].items[0] as PartItem
    expect(talk.names[0].name).toBe('')
  })

  it('wählt geringste Auslastung, nie Abwesende, keine Doppelbelegung', () => {
    const weeks = buildDemoWeeks()
    // Abschluss-Gebet der Woche 0 leeren und neu zuteilen
    const closeSi = weeks[0].mid.sections.length - 1
    ;(weeks[0].mid.sections[closeSi].items[0] as PartItem).names[0].name = ''
    const before = weeks.map((w) => structuredClone(w))
    const { weeks: next, newly } = autoAssignMeeting(weeks, 0, 'mid', DEMO_PERSONS, DEMO_SERVICES)
    const names = assignedNames(next[0], 'mid').filter((n) => !n.startsWith('Gruppe'))
    expect(new Set(names).size).toBe(names.length) // keine Doppelbelegung
    // U. Lang ist in Woche 0 abwesend → nie neu vergeben
    expect(newly).not.toContain('U. Lang')
    // Originale Wochen unverändert (reine Funktion)
    expect(weeks).toEqual(before)
  })

  it('Reinigung rotiert mit dem Wochenindex (mod 3)', () => {
    const weeks = buildDemoWeeks()
    for (const w of weeks) w.mid.helpers.rein = []
    const { weeks: next } = autoAssignMeeting(weeks, 4 % 3, 'mid', DEMO_PERSONS, DEMO_SERVICES)
    expect(next[1].mid.helpers.rein[0]).toBe('Gruppe 2')
  })
})

describe('offene Slots zählen', () => {
  it('zählt Programmpunkte und Hilfsdienst-Plätze', () => {
    const weeks = buildDemoWeeks()
    const before = countOpenSlots(weeks[0].mid, DEMO_SERVICES)
    ;(weeks[0].mid.sections[closeIdx(weeks)].items[0] as PartItem).names[0].name = ''
    expect(countOpenSlots(weeks[0].mid, DEMO_SERVICES)).toBe(before + 1)
  })
})

function closeIdx(weeks: ReturnType<typeof buildDemoWeeks>) {
  return weeks[0].mid.sections.length - 1
}

describe('„Unser Leben als Christ" bearbeiten', () => {
  const weeks = buildDemoWeeks()
  const si = lacSectionIndex(weeks[0].mid.sections)
  const gehIdx = weeks[0].mid.sections[si].items.findIndex(
    (i) => !isSong(i) && (i as PartItem).title.startsWith('Geh während'),
  )

  it('shiftEnd verschiebt die Endzeit (mit Stundenübergang)', () => {
    expect(shiftEnd('Ende ca. 20:45', 5)).toBe('Ende ca. 20:50')
    expect(shiftEnd('Ende ca. 20:45', -50)).toBe('Ende ca. 19:55')
  })

  it('lacAdjust ändert Minuten (5..45) und zieht das Ende nach', () => {
    const w = lacAdjust(weeks, 0, 'mid', si, gehIdx, 5)
    expect(itemMinutes(w[0].mid.sections[si].items[gehIdx] as PartItem)).toBe(20)
    expect(w[0].mid.end).toBe('Ende ca. 20:50')
    const max = lacAdjust(weeks, 0, 'mid', si, gehIdx, 100)
    expect(itemMinutes(max[0].mid.sections[si].items[gehIdx] as PartItem)).toBe(45)
  })

  it('lacRemove entfernt den Punkt und kürzt das Ende', () => {
    const count = weeks[0].mid.sections[si].items.length
    const w = lacRemove(weeks, 0, 'mid', si, gehIdx)
    expect(w[0].mid.sections[si].items.length).toBe(count - 1)
    expect(w[0].mid.end).toBe('Ende ca. 20:30')
  })

  it('lacAdd fügt vor dem Versammlungsbibelstudium ein (+10 Min.)', () => {
    const w = lacAdd(weeks, 0, 'mid', si, 'Örtliche Hinweise')
    const items = w[0].mid.sections[si].items
    const insertedIdx = items.findIndex((i) => !isSong(i) && (i as PartItem).title === 'Örtliche Hinweise')
    const vbsIdx = items.findIndex(
      (i) => !isSong(i) && (i as PartItem).title.startsWith('Versammlungsbibelstudium'),
    )
    expect(insertedIdx).toBeGreaterThanOrEqual(0)
    expect(insertedIdx).toBeLessThan(vbsIdx)
    expect(w[0].mid.end).toBe('Ende ca. 20:55')
    expect(lacAdd(weeks, 0, 'mid', si, '   ')).toBe(weeks) // leerer Titel = unverändert
  })

  it('lacMove tauscht Nicht-Lied-Punkte, Nummern bleiben positionsfest', () => {
    const w = lacMove(weeks, 0, 'mid', si, gehIdx, 1)
    const items = (w[0].mid.sections[si].items.filter((i) => !isSong(i)) as PartItem[])
    expect(items[0].title.startsWith('Versammlungsbibelstudium')).toBe(true)
    expect(items[0].num).toBe(7)
    expect(items[1].num).toBe(8)
  })
})

describe('S-89-Nutzlast', () => {
  const weeks = buildDemoWeeks()

  it('parst Rahmen, Partner und Schulungspunkt aus einer Schulungsaufgabe', () => {
    const uid = weeks[0].mid.sections.findIndex((s) => s.label === 'UNS IM DIENST VERBESSERN')
    const ii = weeks[0].mid.sections[uid].items.findIndex(
      (i) => !isSong(i) && (i as PartItem).title === 'Gespräche beginnen' && (i.meta ?? '').includes('Informell'),
    )
    const s89 = buildS89ForSlot(weeks, {
      kind: 'part', wi: 0, tab: 'mid', si: uid, ii, ni: 0, priv: 'schulung', groups: false, label: '',
    })
    expect(s89?.partner).toBe('M. Ernst')
    expect(s89?.type).toBe('Gespräche beginnen · Informell')
  })

  it('parst den Schulungspunkt der Bibellesung', () => {
    const pet = weeks[0].mid.sections.findIndex((s) => s.label === 'SCHÄTZE AUS GOTTES WORT')
    const ii = weeks[0].mid.sections[pet].items.findIndex(
      (i) => !isSong(i) && (i as PartItem).title.startsWith('Bibellesung'),
    )
    const s89 = buildS89ForSlot(weeks, {
      kind: 'part', wi: 0, tab: 'mid', si: pet, ii, ni: 0, priv: 'lesen', groups: false, label: '',
    })
    expect(s89?.point).toBe('th Lektion 2')
  })

  it('liefert null für Nicht-Schulungsslots', () => {
    const s89 = buildS89ForSlot(weeks, {
      kind: 'part', wi: 0, tab: 'mid', si: 0, ii: 0, ni: 0, priv: 'vorsitz', groups: false, label: '',
    })
    expect(s89).toBeNull()
  })
})

describe('Auslastung', () => {
  it('zählt Slots und Begleiter-Erwähnungen über alle Wochen', () => {
    const weeks = buildDemoWeeks()
    const lena = DEMO_PERSONS.find((p) => p.ln === 'Hoffmann')!
    // L. Hoffmann: 2 Slots + 2× "mit L. Hoffmann"
    expect(workloadOf(weeks, displayName(lena))).toBe(4)
  })
})
