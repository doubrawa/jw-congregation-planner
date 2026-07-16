import { describe, expect, it } from 'vitest'
import { buildDemoWeeks, DEMO_PERSONS, DEMO_SERVICES } from './demo'
import { displayName, helperWorkload, isSong, partWorkload, workloadOf } from './helpers'
import {
  assignmentsInMeeting,
  autoAssignMeeting,
  buildS89ForSlot,
  countOpenSlots,
  deriveMyTasks,
  derivePendingNames,
  itemMinutes,
  lacAdd,
  lacAdjust,
  lacMove,
  lacRemove,
  shiftEnd,
  weekConflicts,
} from './planning'
import type { Meeting, PartItem, Section, Service } from './types'

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

  it('zählt offen gebliebene, nicht besetzbare Slots als unfilled (≠ „keine offen“)', () => {
    const weeks = buildDemoWeeks()
    weeks[0].mid.helpers.zoom = [''] // Zoom-Ordner offen
    // Ohne verfügbare Person kann nichts besetzt werden: count 0, aber unfilled > 0
    // (damit die UI „keine passende Person“ statt „keine offenen Zuteilungen“ zeigt).
    const { count, unfilled } = autoAssignMeeting(weeks, 0, 'mid', [], DEMO_SERVICES)
    expect(count).toBe(0)
    expect(unfilled).toBeGreaterThan(0)
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

  it('trennt Aufgaben- von Hilfsdienst-Last', () => {
    const weeks = buildDemoWeeks()
    // L. Hoffmann: nur Programmpunkte
    expect(partWorkload(weeks, 'L. Hoffmann')).toBe(4)
    expect(helperWorkload(weeks, 'L. Hoffmann')).toBe(0)
    // C. Maier: überwiegend Ton — Hilfsdienste zählen nicht zur Aufgaben-Last
    expect(helperWorkload(weeks, 'C. Maier')).toBeGreaterThanOrEqual(4)
    expect(partWorkload(weeks, 'C. Maier')).toBeLessThan(helperWorkload(weeks, 'C. Maier'))
    // Invariante: Gesamt = Aufgaben + Hilfsdienste
    expect(workloadOf(weeks, 'C. Maier')).toBe(
      partWorkload(weeks, 'C. Maier') + helperWorkload(weeks, 'C. Maier'),
    )
  })
})

describe('Aufgaben-Ableitung (Produktionsmodus)', () => {
  const weeks = buildDemoWeeks()

  it('leitet die Aufgaben einer Person in Programmreihenfolge ab', () => {
    const tasks = deriveMyTasks(weeks, DEMO_SERVICES, 'S. Krüger', {})
    // Woche 0: Schulungsaufgabe · Woche 1: Mikrofone (We) ·
    // Woche 2: Bibellesung · Woche 3: Mikrofone (Gedächtnismahl)
    expect(tasks.map((t) => t.title)).toEqual([
      'Gespräche beginnen',
      'Mikrofone',
      'Bibellesung · Jer 38:1-13',
      'Mikrofone',
    ])
    expect(tasks[0].date).toBe('Dienstag, 8. September · 19:00')
    expect(tasks[0].s89?.partner).toBe('M. Ernst')
    expect(tasks[1].s89).toBeNull()
    expect(tasks[2].s89?.point).toBe('th Lektion 10')
    expect(tasks.every((t) => t.status === 'offen')).toBe(true)
    expect(deriveMyTasks(weeks, DEMO_SERVICES, '', {})).toEqual([])
  })

  it('hängt Rollenlabels (außer Begleiter) an den Titel an', () => {
    const tasks = deriveMyTasks(weeks, DEMO_SERVICES, 'M. Albrecht', {})
    expect(tasks[0].title).toBe('Lied 1 · Gebet · Einleitende Worte · Vorsitz')
  })

  it('übernimmt den Status aus der ConfirmationMap', () => {
    const open = deriveMyTasks(weeks, DEMO_SERVICES, 'S. Krüger', {})
    const conf = { [open[0].id]: 'bestätigt', [open[1].id]: 'verhindert' } as const
    const tasks = deriveMyTasks(weeks, DEMO_SERVICES, 'S. Krüger', conf)
    expect(tasks.map((t) => t.status)).toEqual(['bestätigt', 'verhindert', 'offen', 'offen'])
  })

  it('pendingNames: ohne Bestätigung pending, Externe und Gruppen nie', () => {
    const pending = derivePendingNames(weeks, DEMO_SERVICES, {})
    expect(pending).toContain('S. Krüger')
    expect(pending).not.toContain('K. Wagner') // Kreisaufseher (extern)
    expect(pending).not.toContain('M. Hartmann') // Gastredner (extern)
    expect(pending.some((n) => n.startsWith('Gruppe'))).toBe(false)
  })

  it('pendingNames: voll bestätigte Namen verschwinden', () => {
    const tasks = deriveMyTasks(weeks, DEMO_SERVICES, 'S. Krüger', {})
    const conf = Object.fromEntries(tasks.map((t) => [t.id, 'bestätigt' as const]))
    expect(derivePendingNames(weeks, DEMO_SERVICES, conf)).not.toContain('S. Krüger')
  })
})

describe('Konfliktprüfungen (Planen)', () => {
  it('erkennt Abwesende, die trotzdem eingeteilt sind', () => {
    // U. Lang ist in Woche 0 abwesend, aber Eingangsordner (mid)
    const weeks = buildDemoWeeks()
    const conflicts = weekConflicts(weeks, 0, DEMO_PERSONS, DEMO_SERVICES)
    expect(conflicts).toContainEqual({ kind: 'absent', name: 'U. Lang', tab: 'mid' })
  })

  it('erkennt Helfer + Aufgabe am selben Tag (helperTask)', () => {
    const weeks = buildDemoWeeks()
    weeks[0].mid.helpers.ton = ['M. Albrecht'] // ist schon Vorsitz (Programmpunkt) in derselben ZK
    const conflicts = weekConflicts(weeks, 0, DEMO_PERSONS, DEMO_SERVICES)
    expect(conflicts).toContainEqual({ kind: 'helperTask', name: 'M. Albrecht', tab: 'mid' })
  })

  it('erkennt sonstige Mehrfach-Zuteilung (double) — zwei Hilfsdienste', () => {
    const weeks = buildDemoWeeks()
    weeks[0].mid.helpers.ton = ['X. Testhelfer'] // nur Hilfsdienste, kein Programmpunkt
    weeks[0].mid.helpers.mik = ['X. Testhelfer', '']
    const conflicts = weekConflicts(weeks, 0, DEMO_PERSONS, DEMO_SERVICES)
    expect(conflicts).toContainEqual({ kind: 'double', name: 'X. Testhelfer', tab: 'mid', count: 2 })
  })

  it('erkennt Serien von 3 Wochen in Folge (und nur dort)', () => {
    const weeks = buildDemoWeeks()
    for (const wi of [0, 1, 2]) weeks[wi].mid.helpers.ton = ['R. Serie']
    const streak = weekConflicts(weeks, 1, [], DEMO_SERVICES).filter((c) => c.kind === 'streak')
    expect(streak).toContainEqual({ kind: 'streak', name: 'R. Serie', count: 3 })
    // Woche 3 gehört nicht zur Serie
    const w3 = weekConflicts(weeks, 3, [], DEMO_SERVICES)
    expect(w3.some((c) => c.kind === 'streak' && c.name === 'R. Serie')).toBe(false)
  })

  it('meldet externe Redner und Gruppen-Rotation nicht', () => {
    // Woche 2: Kreisaufseher K. Wagner mehrfach, Reinigung als Gruppe
    const weeks = buildDemoWeeks()
    const conflicts = weekConflicts(weeks, 2, DEMO_PERSONS, DEMO_SERVICES)
    expect(conflicts.some((c) => c.name === 'K. Wagner')).toBe(false)
    expect(conflicts.some((c) => c.name.startsWith('Gruppe'))).toBe(false)
  })
})

describe('assignmentsInMeeting (Doppelbelegungs-Hinweis)', () => {
  const meeting: Meeting = {
    date: '',
    end: '',
    sections: [
      {
        label: 'ERÖFFNUNG',
        farbe: 'neutral',
        items: [{ title: 'Einleitende Worte', names: [{ name: 'A. Muster', rolle: 'Vorsitz' }] }],
      },
      {
        label: 'SCHÄTZE',
        farbe: 'petrol',
        items: [{ title: 'Nach geistigen Schätzen graben', names: [{ name: 'B. Test' }] }],
      },
    ],
    helpers: { mik: ['A. Muster', ''], rein: ['Gruppe 1'] },
  }
  const services: Service[] = [
    { key: 'mik', name: 'Mikrofone', count: 2, groups: false },
    { key: 'rein', name: 'Reinigung', count: 1, groups: true },
  ]

  it('listet Rolle und Hilfsdienst einer Person am selben Tag', () => {
    const res = assignmentsInMeeting(meeting, 'A. Muster', services)
    expect(res).toEqual([
      { text: 'Vorsitz', lang: 'u' },
      { text: 'Mikrofone', lang: 'u' },
    ])
  })

  it('nutzt den Titel, wenn der Slot keine Rolle hat', () => {
    expect(assignmentsInMeeting(meeting, 'B. Test', services)).toEqual([
      { text: 'Nach geistigen Schätzen graben', lang: 'p' },
    ])
  })

  it('blendet den gerade bearbeiteten Slot aus', () => {
    // Bearbeitet wird der Mikrofon-Slot 0 → dieser darf nicht als „schon zugeteilt“ erscheinen
    const exclude = { kind: 'helper', wi: 0, tab: 'mid', svc: 'mik', pos: 0, label: '', priv: null, groups: false } as const
    expect(assignmentsInMeeting(meeting, 'A. Muster', services, exclude)).toEqual([
      { text: 'Vorsitz', lang: 'u' },
    ])
  })

  it('liefert nichts für einen unbeteiligten Namen', () => {
    expect(assignmentsInMeeting(meeting, 'X. Fremd', services)).toEqual([])
  })
})
