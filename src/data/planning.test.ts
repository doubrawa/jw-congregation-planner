import { describe, expect, it } from 'vitest'
import { buildAbsences } from './absence'
import { syncAuxSlots } from './aux-class'
import { buildDemoWeeks, buildImportWeek, CONGREGATION, DEMO_ABSENCES, DEMO_PERSONS, DEMO_SERVICES, FS_BASE } from './testdaten'
import { displayName, helperWorkload, isSong, loadWindow, partWorkload, workloadOf } from './helpers'
import { itemMinutes, lacAdd, lacAdjust, lacMove, lacRemove, shiftEnd } from './meeting-edit'
import {
  aufgabenBezeichnung,
  assignmentsInMeeting,
  autoAssignMeeting,
  buildS89ForSlot,
  changedSlotKeys,
  openSlotLabels,
  countOpenSlots,
  deriveMyTasks,
  derivePendingIds,
  deriveSubstituteReqs,
  assignSlot,
  clearAssignments,
  helperTaskKey,
  slotValue,
  weekConflicts,
} from './planning'
import { emptyQualifications } from './helpers'
import type { Meeting, PartItem, Person, Section, Service, Week } from './types'

/** Person, die nur über ihren Anzeigenamen zugeordnet wird (Altdaten-Slots ohne pid). */
function alsPerson(name: string): Person {
  return {
    id: `test-${name}`, fn: '', ln: '', dn: name, role: 'verkuendiger', female: false,
    tel: '', mail: '', priv: emptyQualifications(),
  }
}


/** Namen aller belegten Slots eines Meetings (Programmpunkte + Hilfsdienste). */
function assignedNames(week: ReturnType<typeof buildDemoWeeks>[number], tab: 'mid' | 'we'): string[] {
  const names: string[] = []
  for (const section of week[tab].sections) {
    for (const item of section.items) {
      if (isSong(item)) continue
      for (const slot of item.names) if (slot.name) names.push(slot.name)
    }
  }
  for (const arr of Object.values(week[tab].helpers)) for (const s of arr) if (s.name) names.push(s.name)
  return names
}

const lacSectionIndex = (sections: Section[]) =>
  sections.findIndex((s) => s.label === 'UNSER LEBEN ALS CHRIST')

describe('openSlotLabels (Banner unbesetzter Zuteilungen)', () => {
  const services: Service[] = [
    { key: 'mik', name: 'Mikrofone', count: 2, groups: false },
    { key: 'rein', name: 'Reinigung', count: 1, groups: true },
  ]
  const meeting: Meeting = {
    date: '',
    end: '',
    sections: [
      {
        label: 'X',
        farbe: 'petrol',
        items: [
          { song: 'Lied 1' },
          {
            num: 7,
            title: 'Versammlungsbibelstudium',
            meta: '',
            names: [{ name: 'Wer Da', rolle: 'Leiter' }, { name: '', rolle: 'Leser' }],
          },
          { num: 4, title: 'Gespräche beginnen', meta: '', names: [{ name: '', rolle: 'mit Partner' }] },
        ],
      },
    ],
    helpers: { mik: [], rein: [] },
  }

  it('listet offene Programmpunkte (Rolle getrennt) und Hilfsdienste gebündelt', () => {
    const open = openSlotLabels(meeting, services)
    // Titel und Rolle stehen als zwei Felder da, nicht als ein String: der Titel
    // kommt aus der Sprache der Versammlung, die Rolle aus der des Lesers.
    expect(open).toEqual([
      { text: 'Versammlungsbibelstudium', lang: 'p', rolle: 'Leser', n: 1 },
      { text: 'Gespräche beginnen', lang: 'p', n: 1 }, // "mit …"-Rolle → nur Titel
      { text: 'Mikrofone', lang: 'u', n: 2 },
      { text: 'Reinigung', lang: 'u', n: 1 },
    ])
  })

  it('in ERÖFFNUNG/ABSCHLUSS trägt die Rolle allein — ohne Lied und Einleitende Worte', () => {
    const eroeffnung: Meeting = {
      ...meeting,
      sections: [
        {
          label: 'ERÖFFNUNG',
          farbe: 'neutral',
          items: [
            {
              title: 'Lied 27 · Gebet · Einleitende Worte',
              meta: '',
              names: [{ name: '', rolle: 'Vorsitz' }, { name: '', rolle: 'Gebet' }],
            },
          ],
        },
      ],
      helpers: {},
    }
    expect(openSlotLabels(eroeffnung, [])).toEqual([
      { text: 'Vorsitz', lang: 'u', n: 1 },
      { text: 'Gebet', lang: 'u', n: 1 },
    ])
  })

  it('voll besetzt → leer', () => {
    const filled: Meeting = {
      ...meeting,
      sections: [
        {
          label: 'X',
          farbe: 'petrol',
          items: [{ num: 1, title: 'T', meta: '', names: [{ name: 'Wer Da' }] }],
        },
      ],
      helpers: { mik: [{ name: 'A' }, { name: 'B' }], rein: [{ name: 'Gruppe 1' }] },
    }
    expect(openSlotLabels(filled, services)).toHaveLength(0)
  })
})

describe('changedSlotKeys (Bestätigungs-Abräumung bei Neuzuteilung)', () => {
  it('liefert genau die task_keys geänderter Programmpunkt- und Hilfsdienst-Slots', () => {
    const weeks = buildDemoWeeks()
    const before = weeks[0].mid
    const after = structuredClone(before)
    // erster Nicht-Lied-Slot: Person tauschen
    const item = after.sections[0].items.find((i) => !isSong(i)) as PartItem
    item.names[0].name = 'Neue Person'
    // ein Hilfsdienst-Platz leeren
    after.helpers.mik = [{ name: '' }, ...(after.helpers.mik ?? []).slice(1)]
    const keys = changedSlotKeys(before, after, DEMO_SERVICES, '2026-09-07', 'mid')
    expect(keys).toContain('2026-09-07|mid|part|0|0|0')
    expect(keys).toContain('2026-09-07|mid|helper|mik|0')
    expect(keys).toHaveLength(2)
  })

  it('ohne Änderung keine Keys', () => {
    const weeks = buildDemoWeeks()
    expect(changedSlotKeys(weeks[0].mid, weeks[0].mid, DEMO_SERVICES, '2026-09-07', 'mid')).toHaveLength(0)
  })
})

describe('Sonderwochen (v3)', () => {
  const weeks = buildDemoWeeks()

  it('Woche 2 ist Kreisaufseher-Woche mit Dienstvortrag statt VBS', () => {
    expect(weeks[2].co).toBe(true)
    const lac = weeks[2].mid.sections[lacSectionIndex(weeks[2].mid.sections)]
    const dv = lac.items.find((i) => !isSong(i) && i.title.startsWith('Demo-Studienartikel 2')) as PartItem
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
      (i) => !isSong(i) && (i as PartItem).title.startsWith('Demo-Studienartikel 2'),
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
    const abwesend = buildAbsences(DEMO_ABSENCES, weeks, FS_BASE, CONGREGATION.meetings)
    const { weeks: next, newly } = autoAssignMeeting(
      weeks, 0, 'mid', DEMO_PERSONS, DEMO_SERVICES, [], 'all', abwesend,
    )
    const names = assignedNames(next[0], 'mid').filter((n) => !n.startsWith('Gruppe'))
    expect(new Set(names).size).toBe(names.length) // keine Doppelbelegung
    // Ulrich Lang ist in Woche 0 abwesend → nie neu vergeben
    expect(newly).not.toContain('Ulrich Lang')
    // Originale Wochen unverändert (reine Funktion)
    expect(weeks).toEqual(before)
  })

  it('Reinigung rotiert mit dem Wochenindex (mod 3)', () => {
    const weeks = buildDemoWeeks()
    for (const w of weeks) w.mid.helpers.rein = []
    const { weeks: next } = autoAssignMeeting(weeks, 4 % 3, 'mid', DEMO_PERSONS, DEMO_SERVICES)
    expect(next[1].mid.helpers.rein[0].name).toBe('Gruppe 2')
  })

  it('zählt offen gebliebene, nicht besetzbare Slots als unfilled (≠ „keine offen“)', () => {
    const weeks = buildDemoWeeks()
    weeks[0].mid.helpers.zoom = [{ name: '' }] // Zoom-Ordner offen
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
    (i) => !isSong(i) && (i as PartItem).title.startsWith('Demoaufgabe 9'),
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
      kind: 'part', wi: 0, tab: 'mid', si: 0, ii: 0, ni: 0, priv: 'vorsitzMid', groups: false, label: '',
    })
    expect(s89).toBeNull()
  })
})

describe('Auslastung', () => {
  it('zählt Slots und Begleiter-Erwähnungen über alle Wochen', () => {
    const weeks = buildDemoWeeks()
    const lena = DEMO_PERSONS.find((p) => p.ln === 'Hoffmann')!
    // Lena Hoffmann: 2 Slots + 2× "mit Lena Hoffmann"
    expect(workloadOf(weeks, lena)).toBe(4)
  })

  it('trennt Aufgaben- von Hilfsdienst-Last', () => {
    const weeks = buildDemoWeeks()
    // Lena Hoffmann: nur Programmpunkte
    expect(partWorkload(weeks, alsPerson('Lena Hoffmann'))).toBe(4)
    expect(helperWorkload(weeks, alsPerson('Lena Hoffmann'))).toBe(0)
    // Claus Maier: überwiegend Ton — Hilfsdienste zählen nicht zur Aufgaben-Last
    expect(helperWorkload(weeks, alsPerson('Claus Maier'))).toBeGreaterThanOrEqual(4)
    expect(partWorkload(weeks, alsPerson('Claus Maier'))).toBeLessThan(helperWorkload(weeks, alsPerson('Claus Maier')))
    // Invariante: Gesamt = Aufgaben + Hilfsdienste
    expect(workloadOf(weeks, alsPerson('Claus Maier'))).toBe(
      partWorkload(weeks, alsPerson('Claus Maier')) + helperWorkload(weeks, alsPerson('Claus Maier')),
    )
  })
})

describe('deriveSubstituteReqs (Einspringen bei Hilfsdiensten)', () => {
  const qualified = (svc: string): Person => ({
    id: 'meX', fn: 'Ersatz', ln: 'Person', role: 'dienstamtgehilfe', female: false,
    tel: '', mail: '', priv: { ...emptyQualifications(), [`svc:${svc}`]: true },
  })

  it('listet einen verhinderten Hilfsdienst, für den ich qualifiziert bin', () => {
    const weeks = buildDemoWeeks()
    weeks[0].mid.helpers.ton = [{ name: 'A. Absager' }]
    const conf = { [helperTaskKey('2026-09-07', 'mid', 'ton', 0)]: 'verhindert' as const }
    const reqs = deriveSubstituteReqs(weeks, DEMO_SERVICES, conf, qualified('ton'))
    expect(reqs).toHaveLength(1)
    expect(reqs[0]).toMatchObject({ svc: 'ton', declinedBy: 'A. Absager', key: helperTaskKey('2026-09-07', 'mid', 'ton', 0) })
  })

  it('nicht qualifiziert → kein Gesuch', () => {
    const weeks = buildDemoWeeks()
    weeks[0].mid.helpers.ton = [{ name: 'A. Absager' }]
    const conf = { [helperTaskKey('2026-09-07', 'mid', 'ton', 0)]: 'verhindert' as const }
    expect(deriveSubstituteReqs(weeks, DEMO_SERVICES, conf, qualified('mik'))).toHaveLength(0)
  })

  it('nur „verhindert" zählt (bestätigt/offen nicht)', () => {
    const weeks = buildDemoWeeks()
    weeks[0].mid.helpers.ton = [{ name: 'A. Absager' }]
    const conf = { [helperTaskKey('2026-09-07', 'mid', 'ton', 0)]: 'bestätigt' as const }
    expect(deriveSubstituteReqs(weeks, DEMO_SERVICES, conf, qualified('ton'))).toHaveLength(0)
  })

  it('eigener verhinderter Slot erscheint nicht als Einspringen-Gesuch', () => {
    const weeks = buildDemoWeeks()
    weeks[0].mid.helpers.ton = [{ name: 'Ersatz Person' }] // = displayName(me)
    const conf = { [helperTaskKey('2026-09-07', 'mid', 'ton', 0)]: 'verhindert' as const }
    expect(deriveSubstituteReqs(weeks, DEMO_SERVICES, conf, qualified('ton'))).toHaveLength(0)
  })
})

describe('loadWindow (5-Wochen-Belegung für die Mini-Quadrate)', () => {
  it('liefert je Woche none/task/helper; Aufgabe hat Vorrang', () => {
    const weeks = buildDemoWeeks()
    ;(weeks[1].mid.sections[0].items[0] as PartItem).names[0].name = 'Quadrat Test' // Aufgabe in Woche 1
    weeks[3].mid.helpers.ton = [{ name: 'Quadrat Test' }] // Hilfsdienst in Woche 3
    // Demo hat 4 Wochen (0–3); Fenster um Woche 2 (±2) → 0,1,2,3,4 → Index 4 = void
    expect(loadWindow(weeks, alsPerson('Quadrat Test'), 2, undefined, 2)).toEqual([
      'none',
      'task',
      'none',
      'helper',
      'void',
    ])
  })

  it('markiert nicht geladene Wochen als void', () => {
    const weeks = buildDemoWeeks()
    // Fenster um Woche 0 (±2) → Indizes -2,-1,0,1,2 → erste zwei existieren nicht
    const w = loadWindow(weeks, alsPerson('Niemand'), 0, undefined, 2)
    expect(w[0]).toBe('void')
    expect(w[1]).toBe('void')
    expect(w.slice(2)).toEqual(['none', 'none', 'none'])
  })
})

describe('Aufgaben-Ableitung (Produktionsmodus)', () => {
  const weeks = buildDemoWeeks()

  it('leitet die Aufgaben einer Person in Programmreihenfolge ab', () => {
    const tasks = deriveMyTasks(weeks, DEMO_SERVICES, 'Simon Krüger', {})
    // Woche 0: Schulungsaufgabe · Woche 1: Mikrofone (We) ·
    // Woche 2: Bibellesung · Woche 3: Mikrofone (Gedächtnismahl)
    // Über die zusammengefügte Form geprüft: Titel und Rolle stehen getrennt,
    // weil die Anzeige sie verschieden übersetzt (MyTask.rolle).
    expect(tasks.map(aufgabenBezeichnung)).toEqual([
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

  it('setzt at aus Wochenstart + Zusammenkunftstag (Countdown); ohne start null', () => {
    // Ohne Startdatum → kein Countdown. Seit T66 ist `start` verpflichtend;
    // der leere String ist die Form fuer „aus Altbestand, noch nicht
    // nachgetragen" (migration-017 traegt es nach).
    const leer = weeks.map((w) => ({ ...w, start: '' }))
    const ohne = deriveMyTasks(leer, DEMO_SERVICES, 'Simon Krüger', {}, 'Di 19:00 · So 10:00')
    expect(ohne[0].at).toBeNull()

    // Mit ISO-Startdatum: Woche 0 Schulung liegt unter der Woche (Di = Mo + 1).
    const dated = weeks.map((w) => ({ ...w, start: '2026-09-07' })) // Montag
    const mit = deriveMyTasks(dated, DEMO_SERVICES, 'Simon Krüger', {}, 'Di 19:00 · So 10:00')
    expect(mit[0].at).toBe(Date.parse('2026-09-08')) // Dienstag (mid = Mo + 1)
    // Aufgabe 1 ist Mikrofone am Wochenende → So = Mo + 6 (alle Wochen teilen
    // hier denselben Start, geprüft wird der Wochenend-Versatz).
    expect(mit[1].at).toBe(Date.parse('2026-09-13'))
  })

  it('in ERÖFFNUNG/ABSCHLUSS trägt die Rolle allein', () => {
    // Der Titel benennt dort den ganzen Block („Lied 1 · Gebet · Einleitende
    // Worte"). Wer Vorsitz hat, las bisher drei Angaben, die ihn nichts
    // angehen, und seine eigene ganz am Ende.
    const tasks = deriveMyTasks(weeks, DEMO_SERVICES, 'Manfred Albrecht', {})
    expect(aufgabenBezeichnung(tasks[0]!)).toBe('Vorsitz')
    // Und zwar als Rolle, nicht als Titel — sie gehört in die Sprache des
    // Lesers, der Titel in die der Versammlung.
    expect(tasks[0]).toMatchObject({ title: '', rolle: 'Vorsitz' })
  })

  it('sonst steht die Rolle hinter dem Titel', () => {
    const w = buildDemoWeeks()
    const vbs = w[0]!.mid.sections
      .flatMap((s) => s.items)
      .find((it) => !isSong(it) && it.title.startsWith('Versammlungsbibelstudium')) as PartItem
    vbs.names[0]!.name = 'Manfred Albrecht'
    delete vbs.names[0]!.pid
    const tasks = deriveMyTasks(w, DEMO_SERVICES, 'Manfred Albrecht', {})
    expect(tasks.map(aufgabenBezeichnung)).toContain('Versammlungsbibelstudium · Leiter')
  })

  it('ordnet Aufgaben über pid zu — Namensgleiche sehen keine fremden Aufgaben', () => {
    const w = buildDemoWeeks()
    const part = w[0].mid.sections.flatMap((s) => s.items).find((it) => !isSong(it)) as PartItem
    part.names[0].name = 'Max Muster'
    part.names[0].pid = 'pMax'
    // Person mit passender pid sieht die Aufgabe; gleichnamige mit anderer pid nicht.
    expect(deriveMyTasks(w, DEMO_SERVICES, 'Max Muster', {}, '', 'pMax').length).toBeGreaterThan(0)
    expect(deriveMyTasks(w, DEMO_SERVICES, 'Max Muster', {}, '', 'pAndere')).toEqual([])
  })

  it('übernimmt den Status aus der ConfirmationMap', () => {
    const open = deriveMyTasks(weeks, DEMO_SERVICES, 'Simon Krüger', {})
    const conf = { [open[0].id]: 'bestätigt', [open[1].id]: 'verhindert' } as const
    const tasks = deriveMyTasks(weeks, DEMO_SERVICES, 'Simon Krüger', conf)
    expect(tasks.map((t) => t.status)).toEqual(['bestätigt', 'verhindert', 'offen', 'offen'])
  })

  it('pendingIds: ohne Bestätigung pending, Externe und Gruppen nie', () => {
    // Geführt wird über die Kennung: Person-Id, wo der Slot eine trägt, sonst
    // `name:…`. Die Demo-Wochen haben beides, deshalb hier über einen Helfer.
    const pending = derivePendingIds(weeks, DEMO_SERVICES, {})
    const drin = (name: string): boolean =>
      pending.includes(`name:${name}`) ||
      pending.includes(DEMO_PERSONS.find((p) => displayName(p) === name)?.id ?? '—')
    expect(drin('Simon Krüger')).toBe(true)
    expect(drin('K. Wagner')).toBe(false) // Kreisaufseher (extern)
    expect(drin('M. Hartmann')).toBe(false) // Gastredner (extern)
    expect(pending.some((k) => k.startsWith('name:Gruppe'))).toBe(false)
  })

  it('pendingIds: voll bestätigte Personen verschwinden', () => {
    const tasks = deriveMyTasks(weeks, DEMO_SERVICES, 'Simon Krüger', {})
    const conf = Object.fromEntries(tasks.map((t) => [t.id, 'bestätigt' as const]))
    const pending = derivePendingIds(weeks, DEMO_SERVICES, conf)
    const simon = DEMO_PERSONS.find((p) => displayName(p) === 'Simon Krüger')!
    expect(pending).not.toContain(simon.id)
    expect(pending).not.toContain('name:Simon Krüger')
  })
})

describe('Auto-Zuteilung Schülerteile (Partner + Geschlecht)', () => {
  const qp = (o: Partial<Record<string, boolean>>): Person['priv'] =>
    ({
      vorsitzMid: false, vorsitzWe: false, vortrag: false, gebet: false, bibellesung: false,
      leser: false, schulung: false, schulungPartner: false, studium: false, treffpunkt: false,
      ...o,
    }) as Person['priv']
  const p = (id: string, fn: string, female: boolean, role: Person['role'], priv: Person['priv']): Person => ({
    id, fn, ln: 'T', role, female, tel: '', mail: '', priv, grp: null,
  })

  function scenario() {
    const base = buildDemoWeeks()[0]
    const week = {
      ...base,
      mid: {
        ...base.mid,
        helpers: { ton: [{ name: 'Bruno T' }] }, // Bruder ist schon belegt → nicht mehr frei
        sections: [
          {
            label: 'UNS IM DIENST VERBESSERN',
            farbe: 'gold' as const,
            items: [
              { num: 4, title: 'Gespräche beginnen', meta: 'Von Haus zu Haus · 3 Min.', names: [
                { name: '', bereichsKey: 'schulung' },
                { name: '', rolle: 'Gesprächspartner', bereichsKey: 'schulungPartner' },
              ] },
              { num: 6, title: 'Vortrag', meta: '5 Min.', names: [{ name: '', bereichsKey: 'schulung', male: true }] },
            ],
          },
        ],
      },
    }
    const persons: Person[] = [
      p('s1', 'Sara', true, 'verkuendiger', qp({ schulung: true })),
      p('s2', 'Sonja', true, 'verkuendiger', qp({ schulung: true })),
      p('b1', 'Bruno', false, 'verkuendiger', qp({ schulung: true, [serviceQualKeyTon()]: true })),
      p('e1', 'Emil', false, 'aeltester', qp({ schulung: true })),
    ]
    return { weeks: [week], persons }
  }
  // ton-Qualikey wie in der App
  function serviceQualKeyTon() { return 'svc:ton' }

  it('Gesprächsteil: Führer + Partner gleiches Geschlecht; Vortrag männlich; Ältester zuletzt', () => {
    const { weeks, persons } = scenario()
    const res = autoAssignMeeting(weeks, 0, 'mid', persons, DEMO_SERVICES, [], 'parts')
    const gold = res.weeks[0].mid.sections[0].items as PartItem[]
    const lead = gold[0].names[0].name
    const partner = gold[0].names[1].name
    const talk = gold[1].names[0].name
    // Führer und Partner sind die beiden Schwestern (Bruno belegt, Emil = Malus)
    expect([lead, partner].sort()).toEqual(['Sara T', 'Sonja T'])
    // Vortrag geht an den einzigen freien Bruder (Emil), nie an eine Schwester
    expect(talk).toBe('Emil T')
  })
})

describe('Konfliktprüfungen (Planen)', () => {
  /**
   * Die Kennung, unter der ein Konflikt geführt wird: die Person-Id, wo es eine
   * gibt, sonst `name:<Anzeigename>`. Sie steht im Konflikt, damit der Plan
   * genau die betroffene Zuteilung hervorheben kann (T76) — bei zwei
   * Namensgleichen leuchtete über den Namen auch die falsche auf.
   */
  const kennungFuer = (name: string): string =>
    DEMO_PERSONS.find((p) => displayName(p) === name)?.id ?? `name:${name}`

  it('erkennt Abwesende, die trotzdem eingeteilt sind', () => {
    // Ulrich Lang ist vom 7. bis 13.9. weg (DEMO_ABSENCES) — das ist Woche 0,
    // und dort ist er Eingangsordner (mid). Prüft zugleich, dass aus dem
    // gespeicherten Datum wieder die richtige Woche wird.
    const weeks = buildDemoWeeks()
    const abwesend = buildAbsences(DEMO_ABSENCES, weeks, FS_BASE, CONGREGATION.meetings)
    const conflicts = weekConflicts(weeks, 0, DEMO_PERSONS, DEMO_SERVICES, undefined, abwesend)
    expect(conflicts).toContainEqual({ kind: 'absent', name: 'Ulrich Lang', kennung: kennungFuer('Ulrich Lang'), tab: 'mid' })
  })

  it('meldet niemanden abwesend, dessen Zeitraum die Woche nicht trifft', () => {
    const weeks = buildDemoWeeks()
    const abwesend = buildAbsences(DEMO_ABSENCES, weeks, FS_BASE, CONGREGATION.meetings)
    // Woche 1 gehört Niklas Feld; Ulrich Lang darf dort nicht auftauchen.
    const conflicts = weekConflicts(weeks, 1, DEMO_PERSONS, DEMO_SERVICES, undefined, abwesend)
    expect(conflicts.some((c) => c.kind === 'absent' && c.name === 'Ulrich Lang')).toBe(false)
  })

  it('erkennt Helfer + Aufgabe am selben Tag (helperTask)', () => {
    const weeks = buildDemoWeeks()
    weeks[0].mid.helpers.ton = [{ name: 'Manfred Albrecht' }] // ist schon Vorsitz (Programmpunkt) in derselben ZK
    const conflicts = weekConflicts(weeks, 0, DEMO_PERSONS, DEMO_SERVICES)
    expect(conflicts).toContainEqual({ kind: 'helperTask', name: 'Manfred Albrecht', kennung: kennungFuer('Manfred Albrecht'), tab: 'mid' })
  })

  it('erkennt zwei Hilfsdienste am selben Tag (double)', () => {
    const weeks = buildDemoWeeks()
    weeks[0].mid.helpers.ton = [{ name: 'Xaver Testhelfer' }] // nur Hilfsdienste, kein Programmpunkt
    weeks[0].mid.helpers.mik = [{ name: 'Xaver Testhelfer' }, { name: '' }]
    const conflicts = weekConflicts(weeks, 0, DEMO_PERSONS, DEMO_SERVICES)
    expect(conflicts).toContainEqual({ kind: 'double', name: 'Xaver Testhelfer', kennung: 'name:Xaver Testhelfer', tab: 'mid', count: 2 })
  })

  it('meldet zwei Programmpunkte (z. B. Vorsitz + Anfangsgebet) NICHT als Konflikt', () => {
    const weeks = buildDemoWeeks()
    // ERÖFFNUNG-Programmpunkt: beide Slots (Vorsitz + Gebet) auf dieselbe Person.
    const opening = weeks[0].mid.sections[0].items[0] as PartItem
    opening.names[0].name = 'Doppel Aufgabe'
    opening.names[1].name = 'Doppel Aufgabe'
    const conflicts = weekConflicts(weeks, 0, DEMO_PERSONS, DEMO_SERVICES)
    expect(conflicts.some((c) => c.name === 'Doppel Aufgabe')).toBe(false)
  })

  it('mit tab=mid erscheinen keine Wochenend-Konflikte (und umgekehrt)', () => {
    const weeks = buildDemoWeeks()
    weeks[0].we.helpers.ton = [{ name: 'Nur Wochenende' }]
    weeks[0].we.helpers.mik = [{ name: 'Nur Wochenende' }, { name: '' }] // 2 Hilfsdienste am WE
    const mid = weekConflicts(weeks, 0, DEMO_PERSONS, DEMO_SERVICES, 'mid')
    expect(mid.some((c) => c.name === 'Nur Wochenende')).toBe(false)
    const we = weekConflicts(weeks, 0, DEMO_PERSONS, DEMO_SERVICES, 'we')
    expect(we).toContainEqual({ kind: 'double', name: 'Nur Wochenende', kennung: 'name:Nur Wochenende', tab: 'we', count: 2 })
  })

  it('meldet Wochen in Folge überhaupt nicht mehr (T81)', () => {
    /*
     * Bis T81 gab es hier die „Serie": drei Wochen am Stück eingeteilt = eine
     * Meldung. Sie ist gestrichen, weil sie in einer kleinen Versammlung fast
     * immer stand und die Meldungen daneben zudeckte. Dieser Test hält die
     * Streichung fest — er wird rot, sobald jemand die Serie zurückholt.
     *
     * Drei Wochen, dazu eine leere vierte: Die alte Prüfung meldete nur, wenn
     * die Serie kürzer war als der geladene Zeitraum. Ohne die vierte Woche
     * bliebe die Meldung also auch früher schon aus, und der Test prüfte nichts.
     */
    const weeks = buildDemoWeeks()
    for (const wi of [0, 1, 2]) (weeks[wi].mid.sections[0].items[0] as PartItem).names[0].name = 'R. Serie'
    ;(weeks[3].mid.sections[0].items[0] as PartItem).names[0].name = ''
    expect(weekConflicts(weeks, 1, [], DEMO_SERVICES).some((c) => c.name === 'R. Serie')).toBe(false)
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
    helpers: { mik: [{ name: 'A. Muster' }, { name: '' }], rein: [{ name: 'Gruppe 1' }] },
  }
  const services: Service[] = [
    { key: 'mik', name: 'Mikrofone', count: 2, groups: false },
    { key: 'rein', name: 'Reinigung', count: 1, groups: true },
  ]

  it('listet Rolle und Hilfsdienst einer Person am selben Tag', () => {
    const res = assignmentsInMeeting(meeting, alsPerson('A. Muster'), services)
    expect(res).toEqual([
      { text: 'Vorsitz', lang: 'u' },
      { text: 'Mikrofone', lang: 'u' },
    ])
  })

  it('nutzt den Titel, wenn der Slot keine Rolle hat', () => {
    expect(assignmentsInMeeting(meeting, alsPerson('B. Test'), services)).toEqual([
      { text: 'Nach geistigen Schätzen graben', lang: 'p' },
    ])
  })

  it('blendet den gerade bearbeiteten Slot aus', () => {
    // Bearbeitet wird der Mikrofon-Slot 0 → dieser darf nicht als „schon zugeteilt“ erscheinen
    const exclude = { kind: 'helper', wi: 0, tab: 'mid', svc: 'mik', pos: 0, label: '', priv: null, groups: false } as const
    expect(assignmentsInMeeting(meeting, alsPerson('A. Muster'), services, exclude)).toEqual([
      { text: 'Vorsitz', lang: 'u' },
    ])
  })

  it('liefert nichts für einen unbeteiligten Namen', () => {
    expect(assignmentsInMeeting(meeting, alsPerson('X. Fremd'), services)).toEqual([])
  })
})

describe('helperWorkload zählt nur bis zur eingestellten Platzzahl (T21)', () => {
  // Reduziert der Planer die Plätze, bleiben die Namen dahinter in den
  // Wochendaten stehen. Die Aufgabe verschwand dann aus „Meine Aufgaben",
  // zählte aber weiter als Last — die Auto-Zuteilung mied die Person weiterhin.
  const woche = (): Week => ({
    range: '',
    book: '', start: '2026-09-07',
    current: false,
    mid: { date: '', end: '', sections: [], helpers: { mik: [{ name: 'Anna' }, { name: 'Bert' }] } },
    we: { date: '', end: '', sections: [], helpers: {} },
  })
  const dienst = (count: number): Service => ({ key: 'mik', name: 'Mikrofone', count, groups: false })

  it('ohne services wie bisher alle Einträge', () => {
    expect(helperWorkload([woche()], alsPerson('Bert'))).toBe(1)
  })

  it('mit zwei Plätzen zählen beide', () => {
    expect(helperWorkload([woche()], alsPerson('Anna'), [dienst(2)])).toBe(1)
    expect(helperWorkload([woche()], alsPerson('Bert'), [dienst(2)])).toBe(1)
  })

  it('nach dem Kürzen auf einen Platz zählt der zweite nicht mehr', () => {
    expect(helperWorkload([woche()], alsPerson('Anna'), [dienst(1)])).toBe(1)
    expect(helperWorkload([woche()], alsPerson('Bert'), [dienst(1)])).toBe(0)
  })

  it('ein gelöschter Dienst zählt gar nicht mehr', () => {
    expect(helperWorkload([woche()], alsPerson('Anna'), [])).toBe(0)
  })
})

describe('Zuordnung über die Person-Id statt über den Namen', () => {
  /** Zwei verschiedene Personen mit identischem Anzeigenamen. */
  const a = alsPerson('Anton Muster')
  const b = { ...alsPerson('Anton Muster'), id: 'zwilling' }

  function wocheMitBeiden(): Week[] {
    const weeks = buildDemoWeeks()
    const item = weeks[0].mid.sections[0].items.find((x) => !isSong(x)) as PartItem
    item.names[0] = { ...item.names[0], name: 'Anton Muster', pid: a.id }
    item.names[1] = { ...item.names[1], name: 'Anton Muster', pid: b.id }
    return weeks
  }

  it('assignmentsInMeeting zeigt jedem nur die eigene Zuteilung', () => {
    // Über den Namen gesucht hätte jeder beide gesehen — und der Hinweis
    // „heute schon zugeteilt" hätte fälschlich gewarnt.
    const weeks = wocheMitBeiden()
    expect(assignmentsInMeeting(weeks[0].mid, a, DEMO_SERVICES)).toHaveLength(1)
    expect(assignmentsInMeeting(weeks[0].mid, b, DEMO_SERVICES)).toHaveLength(1)
  })

  it('weekConflicts meldet keine Doppelbelegung, wo zwei Personen stehen', () => {
    const weeks = wocheMitBeiden()
    // Beide sind Hilfsdienst-frei; über den Namen gezählt sähe es nach
    // „zweimal derselbe" aus.
    const doppelt = weekConflicts(weeks, 0, [a, b], DEMO_SERVICES, 'mid').filter(
      (c) => c.kind === 'double' || c.kind === 'helperTask',
    )
    expect(doppelt).toEqual([])
  })

  it('weekConflicts meldet nur den wirklich abwesenden der beiden', () => {
    const weeks = wocheMitBeiden()
    const abwesend = new Set([`${b.id}|0|mid`])
    const absent = weekConflicts(weeks, 0, [a, b], DEMO_SERVICES, 'mid', abwesend).filter(
      (c) => c.kind === 'absent',
    )
    expect(absent).toHaveLength(1)
  })

  it('derivePendingIds führt beide getrennt', () => {
    const weeks = wocheMitBeiden()
    const pending = derivePendingIds(weeks, DEMO_SERVICES, {})
    expect(pending).toContain(a.id)
    expect(pending).toContain(b.id)
  })
})

describe('Auto-Zuteilung unterscheidet Namensgleiche', () => {
  it('besetzt zwei Plätze mit zwei Gleichnamigen — nicht nur einen', () => {
    // `used` sperrt, wer in dieser Zusammenkunft schon dran ist. Über den
    // Namen geführt galten zwei verschiedene Personen als eine: der zweite
    // Platz blieb offen, obwohl jemand da war.
    const schueler = (id: string): Person => ({
      id, fn: 'Anton', ln: 'Muster', role: 'verkuendiger', female: false, tel: '', mail: '',
      priv: { ...emptyQualifications(), schulung: true },
    })
    const zwillinge = [schueler('p-eins'), schueler('p-zwei')]
    const weeks = [buildImportWeek()]
    const { weeks: next } = autoAssignMeeting(weeks, 0, 'mid', zwillinge, [], [], 'parts')

    const besetzt = next[0].mid.sections
      .flatMap((s) => s.items.flatMap((it) => ('names' in it ? it.names : [])))
      .filter((n) => n.name)
    // Zwei Personen → zwei Plätze (Führer und Partner desselben Punktes).
    // Über den Namen geführt galten beide als eine: `used` sperrte nach dem
    // ersten Platz, und alles Weitere blieb offen.
    expect(besetzt.length).toBe(2)
    expect(new Set(besetzt.map((n) => n.pid))).toEqual(new Set(['p-eins', 'p-zwei']))
  })

  it('erkennt an einem schon belegten Platz die richtige der beiden Personen', () => {
    // Hier entscheidet der Auflöser: `used` wird aus den VORHANDENEN Slots
    // gefüllt. Löst er den belegten Platz über den Namen auf, landet die
    // falsche der beiden Personen darin — die schon Eingeteilte gilt als frei
    // und bekommt einen zweiten Platz, die andere bleibt außen vor.
    const schueler = (id: string): Person => ({
      id, fn: 'Anton', ln: 'Muster', role: 'verkuendiger', female: false, tel: '', mail: '',
      priv: { ...emptyQualifications(), schulung: true },
    })
    const zwillinge = [schueler('p-eins'), schueler('p-zwei')]
    const weeks = [buildImportWeek()]
    // Ersten Schülerteil-Platz vorbelegen — ausdrücklich mit p-eins.
    for (const sec of weeks[0].mid.sections) {
      const treffer = sec.items.find(
        (it) => 'names' in it && it.names.some((n) => n.bereichsKey === 'schulung'),
      )
      if (!treffer || !('names' in treffer)) continue
      const slot = treffer.names.find((n) => n.bereichsKey === 'schulung')!
      slot.name = 'Anton Muster'
      slot.pid = 'p-eins'
      break
    }
    const { weeks: next } = autoAssignMeeting(weeks, 0, 'mid', zwillinge, [], [], 'parts')
    const besetzt = next[0].mid.sections
      .flatMap((sec) => sec.items.flatMap((it) => ('names' in it ? it.names : [])))
      .filter((n) => n.name)
    const proPerson = besetzt.reduce<Record<string, number>>((acc, n) => {
      acc[n.pid ?? '?'] = (acc[n.pid ?? '?'] ?? 0) + 1
      return acc
    }, {})
    expect(proPerson['p-eins'], JSON.stringify(proPerson)).toBe(1)
    expect(proPerson['p-zwei'], JSON.stringify(proPerson)).toBe(1)
  })
})

/*
 * Niemand kann zur selben Zeit in zwei Räumen sein.
 *
 * Die `used`-Menge wurde lange nur aus `item.names` gefüllt — dem Hauptsaal.
 * Wer von Hand in die Zusätzliche Klasse eingeteilt war, fehlte darin und bekam
 * vom nächsten Lauf zusätzlich einen Platz im Hauptsaal; dasselbe galt für
 * einen schon eingeteilten Ratgeber. Auffallen konnte es kaum: die Klasse steht
 * in der Ansicht neben dem Hauptsaal, nicht darin.
 */
describe('Auto-Zuteilung: beide Räume teilen sich die belegten Personen', () => {
  const vielseitig = (id: string): Person => {
    const priv = { ...emptyQualifications() } as unknown as Record<string, boolean>
    for (const k of Object.keys(priv)) priv[k] = true
    priv.ratgeber = true
    return {
      id, fn: 'V' + id, ln: 'N' + id, role: 'verkuendiger', female: false, tel: '', mail: '',
      priv: priv as unknown as Person['priv'],
    }
  }

  /** Alle Plätze der Zusammenkunft, auf denen diese pid steht. */
  const belegungen = (week: Week, pid: string): string[] => {
    const m = week.mid
    const out: string[] = []
    if (m.auxRatgeber?.pid === pid) out.push('ratgeber')
    m.sections.forEach((s, si) =>
      s.items.forEach((item, ii) => {
        if (isSong(item)) return
        item.names.forEach((n, ni) => { if (n.pid === pid) out.push(`hauptsaal|${si}|${ii}|${ni}`) })
        ;(item.aux ?? []).forEach((n, ni) => { if (n.pid === pid) out.push(`klasse|${si}|${ii}|${ni}`) })
      }),
    )
    for (const [k, arr] of Object.entries(m.helpers)) {
      arr.forEach((n, i) => { if (n.pid === pid) out.push(`helfer|${k}|${i}`) })
    }
    return out
  }

  it('wer in der Zusätzlichen Klasse steht, bekommt keinen zweiten Platz', () => {
    const pool = [vielseitig('x'), vielseitig('a'), vielseitig('b')]
    let weeks = syncAuxSlots([buildImportWeek()], true)
    const ziel = weeks[0]!.mid.sections
      .flatMap((s) => s.items)
      .find((i) => !isSong(i) && (i.aux?.length ?? 0) > 0) as PartItem
    ziel.aux![0] = { ...ziel.aux![0]!, name: displayName(pool[0]!), pid: 'x' }

    weeks = autoAssignMeeting(weeks, 0, 'mid', pool, DEMO_SERVICES, [], 'all').weeks
    // Genau der eine Platz, den der Planer gesetzt hat — kein zweiter dazu.
    const wo = belegungen(weeks[0]!, 'x')
    expect(wo, wo.join(' + ')).toHaveLength(1)
    expect(wo[0]).toMatch(/^klasse\|/)
  })

  it('ein bereits eingeteilter Ratgeber bekommt keinen zweiten Platz', () => {
    const pool = [vielseitig('y'), vielseitig('a'), vielseitig('b')]
    let weeks = syncAuxSlots([buildImportWeek()], true)
    weeks[0]!.mid.auxRatgeber = {
      ...weeks[0]!.mid.auxRatgeber!, name: displayName(pool[0]!), pid: 'y',
    }
    weeks = autoAssignMeeting(weeks, 0, 'mid', pool, DEMO_SERVICES, [], 'all').weeks
    expect(belegungen(weeks[0]!, 'y')).toEqual(['ratgeber'])
  })
})

/*
 * Auch hier läuft jede Funktion die Kette Woche → Zusammenkunft → Abschnitt →
 * Punkt → Platz ab, und jedes Glied kann fehlen: eine Lücke im geladenen
 * Fenster (T35), ein Punkt, den die Kreisaufseher-Woche entfernt hat (T62),
 * eine Auswahl, die noch auf die alte Struktur zeigt. Vorher warf der Zugriff
 * — im Reducer, also mit der ganzen Ansicht im Schlepptau (T42).
 */
describe('Auswahl, die ins Leere zeigt', () => {
  const WEIT_DRAUSSEN = 99
  const teilAuswahl = (over: Record<string, unknown> = {}) =>
    ({
      kind: 'part' as const, wi: 0, tab: 'mid' as const, si: 0, ii: 0, ni: 0,
      priv: null, groups: false, label: 'X', ...over,
    })

  it('slotValue liefert "" statt zu werfen', () => {
    const weeks = buildDemoWeeks()
    expect(slotValue(weeks, teilAuswahl({ wi: WEIT_DRAUSSEN }))).toBe('')
    expect(slotValue(weeks, teilAuswahl({ si: WEIT_DRAUSSEN }))).toBe('')
    expect(slotValue(weeks, teilAuswahl({ ii: WEIT_DRAUSSEN }))).toBe('')
  })

  it('assignSlot gibt die Wochen unverändert zurück', () => {
    const weeks = buildDemoWeeks()
    expect(assignSlot(weeks, teilAuswahl({ wi: WEIT_DRAUSSEN }), 'Anna')).toBe(weeks)
    expect(assignSlot(weeks, teilAuswahl({ si: WEIT_DRAUSSEN }), 'Anna')).toBe(weeks)
    expect(assignSlot(weeks, teilAuswahl({ ni: WEIT_DRAUSSEN }), 'Anna')).toBe(weeks)
  })

  it('buildS89ForSlot liefert null statt zu werfen', () => {
    const weeks = buildDemoWeeks()
    expect(buildS89ForSlot(weeks, teilAuswahl({ wi: WEIT_DRAUSSEN }))).toBeNull()
    expect(buildS89ForSlot(weeks, teilAuswahl({ si: WEIT_DRAUSSEN }))).toBeNull()
  })

  it('autoAssignMeeting und clearAssignments zählen null', () => {
    const weeks = buildDemoWeeks()
    const auto = autoAssignMeeting(weeks, WEIT_DRAUSSEN, 'mid', DEMO_PERSONS, DEMO_SERVICES)
    expect(auto.count).toBe(0)
    expect(auto.weeks).toBe(weeks)
    const leer = clearAssignments(weeks, WEIT_DRAUSSEN, 'mid', 'parts')
    expect(leer.count).toBe(0)
    expect(leer.weeks).toBe(weeks)
  })

  it('weekConflicts auf eine Woche außerhalb meldet nichts', () => {
    const weeks = buildDemoWeeks()
    expect(weekConflicts(weeks, WEIT_DRAUSSEN, DEMO_PERSONS, DEMO_SERVICES)).toEqual([])
  })

  it('die vorhandene Stelle bleibt bedienbar — die Prüfung sperrt nichts zu', () => {
    const weeks = buildDemoWeeks()
    const sel = teilAuswahl({ si: 1, ii: 1 })
    const nach = assignSlot(weeks, sel, 'Anna Beispiel')
    expect(nach).not.toBe(weeks)
    expect(slotValue(nach, sel)).toBe('Anna Beispiel')
  })
})
