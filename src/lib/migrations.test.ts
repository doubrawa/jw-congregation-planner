import { describe, expect, it } from 'vitest'
import {
  migrateAssignmentNames,
  migrateAssignmentPids,
  migrateServicePrivs,
  normalizePriv,
  normalizeWeekHelpers,
  renameInWeeks,
} from './data'
import type { Meeting, PartItem, Person, Qualifications, Service, Week } from '../data/types'

function priv(overrides: Record<string, boolean> = {}): Qualifications {
  return {
    vorsitzMid: false,
    vorsitzWe: false,
    vortrag: false,
    gebet: false,
    bibellesung: false,
    leser: false,
    schulung: false,
    schulungPartner: false,
    studium: false,
    treffpunkt: false,
    ...overrides,
  }
}

function person(patch: Partial<Person>): Person {
  return {
    id: crypto.randomUUID(),
    fn: 'Simon',
    ln: 'Krüger',
    role: 'verkuendiger',
    tel: '',
    mail: '',
    priv: priv(),
    ...patch,
  }
}

describe('normalizePriv (Lade-Migration der Qualifikationen)', () => {
  it('leerer/fehlender Bestand → alle festen Bereiche false', () => {
    const priv = normalizePriv(null)
    for (const key of ['vorsitzMid', 'vorsitzWe', 'vortrag', 'gebet', 'bibellesung', 'leser', 'schulung', 'studium']) {
      expect(priv[key], key).toBe(false)
    }
  })

  it('altes kombiniertes `lesen` wird auf bibellesung+leser gespiegelt', () => {
    const priv = normalizePriv({ lesen: true } as never)
    expect(priv.bibellesung).toBe(true)
    expect(priv.leser).toBe(true)
  })

  it('altes kombiniertes `vorsitz` wird auf vorsitzMid+vorsitzWe gespiegelt', () => {
    const priv = normalizePriv({ vorsitz: true } as never)
    expect(priv.vorsitzMid).toBe(true)
    expect(priv.vorsitzWe).toBe(true)
    expect(priv['vorsitz']).toBeUndefined() // Alt-Schlüssel wird entfernt
  })

  it('Dienst-Bereiche (svc:*) und Wahrheitswerte bleiben erhalten', () => {
    const priv = normalizePriv({ 'svc:ton': true, vortrag: 1 } as never)
    expect(priv['svc:ton']).toBe(true)
    expect(priv.vortrag).toBe(true)
  })
})

describe('migrateServicePrivs (alte gemeinsame Dienst-Bereiche)', () => {
  const services: Service[] = [
    { key: 'saal', name: 'Saalordner', count: 1, legacyPriv: 'ordner' },
    { key: 'ton', name: 'Ton', count: 1 }, // ohne Altbestand
  ]

  it('übernimmt den alten Bereich, wenn der dienst-eigene fehlt', () => {
    const [p] = migrateServicePrivs([person({ priv: priv({ ordner: true }) })], services)
    expect(p.priv['svc:saal']).toBe(true)
  })

  it('idempotent: bereits gesetzter dienst-eigener Bereich bleibt', () => {
    const [p] = migrateServicePrivs(
      [person({ priv: priv({ ordner: true, 'svc:saal': false }) })],
      services,
    )
    expect(p.priv['svc:saal']).toBe(false)
  })
})

describe('migrateAssignmentNames (Kurzform → voller Anzeigename)', () => {
  const meeting = (): Meeting => ({
    date: '',
    end: '',
    sections: [
      {
        label: 'X',
        farbe: 'petrol',
        items: [
          { num: 1, title: 'Punkt', meta: '', names: [{ name: 'B. Mauz' }, { name: 'J. Mayer' }] },
          { song: 'Lied 1' },
        ],
      },
    ],
    helpers: {
      mik: [{ name: 'B. Mauz' }, { name: 'Gruppe 1' }, { name: 'S. Krüger' }, { name: 'Unbekannte Person' }],
    },
  })
  const week = (): Week => ({ range: '', book: '', start: '2026-09-07', current: false, mid: meeting(), we: meeting() })

  const persons = [
    person({ fn: 'Bernhard', ln: 'Mauz' }),
    person({ fn: 'Josef', ln: 'Mayer', dn: 'Josef Mayer 1' }), // dn-Override
    person({ fn: 'Simon', ln: 'Krüger' }),
    person({ fn: 'Sven', ln: 'Krüger' }), // macht "S. Krüger" mehrdeutig
  ]

  it('ersetzt eindeutige Kurzformen, lässt Mehrdeutiges/Fremdes stehen', () => {
    const [w] = migrateAssignmentNames([week()], persons)
    const item = w.mid.sections[0].items[0]
    expect('names' in item && item.names[0].name).toBe('Bernhard Mauz')
    expect('names' in item && item.names[1].name).toBe('Josef Mayer 1') // dn gewinnt
    expect(w.mid.helpers.mik).toEqual([
      { name: 'Bernhard Mauz' },
      { name: 'Gruppe 1' }, // Gruppen-Rotation unangetastet
      { name: 'S. Krüger' }, // mehrdeutig → nicht anfassen
      { name: 'Unbekannte Person' }, // gehört keiner Person → unangetastet
    ])
  })

  it('idempotent: volle Namen matchen die Kurzform nicht mehr', () => {
    const once = migrateAssignmentNames([week()], persons)
    const twice = migrateAssignmentNames(once, persons)
    expect(twice).toEqual(once)
  })

  it('ohne betroffene Personen bleibt die Referenz identisch', () => {
    const weeks = [week()]
    expect(migrateAssignmentNames(weeks, [])).toBe(weeks)
  })
})

describe('renameInWeeks (Personen-Umbenennung in geplanten Wochen)', () => {
  const meeting = (): Meeting => ({
    date: '',
    end: '',
    sections: [
      {
        label: 'X',
        farbe: 'petrol',
        items: [
          { num: 1, title: 'Punkt', meta: '', names: [{ name: 'Simon Krüger' }, { name: 'Bernhard Mauz' }] },
          { song: 'Lied 1' },
        ],
      },
    ],
    helpers: { mik: [{ name: 'Simon Krüger' }, { name: 'Gruppe 1' }] },
  })
  const week = (): Week => ({ range: '', book: '', start: '2026-09-07', current: false, mid: meeting(), we: meeting() })

  it('ersetzt exakt den alten Anzeigenamen in Programmpunkten und Hilfsdiensten', () => {
    const [w] = renameInWeeks([week()], 'p1', 'Simon Krüger', 'Simon Müller')
    const item = w.mid.sections[0].items[0]
    expect('names' in item && item.names[0].name).toBe('Simon Müller')
    expect('names' in item && item.names[1].name).toBe('Bernhard Mauz') // andere unberührt
    expect(w.mid.helpers.mik).toEqual([{ name: 'Simon Müller' }, { name: 'Gruppe 1' }])
    expect(w.we.helpers.mik[0].name).toBe('Simon Müller') // beide Zusammenkünfte
  })

  it('lässt Wochen ohne Treffer als identische Referenz', () => {
    const weeks = [week()]
    expect(renameInWeeks(weeks, 'p1', 'Niemand Da', 'Neu')).toBe(weeks)
    expect(renameInWeeks(weeks, 'p1', 'Simon Krüger', 'Simon Krüger')).toBe(weeks) // kein Wechsel
  })

  it('rührt nur die betroffene Woche an (unbetroffene behalten ihre Referenz)', () => {
    const w0 = week() // enthält Simon Krüger
    const w1: Week = { range: 'leer', book: '', start: '2026-09-07', current: false, mid: emptyMeeting(), we: emptyMeeting() }
    const next = renameInWeeks([w0, w1], 'p1', 'Simon Krüger', 'Simon Müller')
    expect(next[0]).not.toBe(w0)
    expect(next[1]).toBe(w1) // unverändert → gleiche Referenz (kein DB-Write)
  })
})

describe('Personen-Id-Bindung (pid)', () => {
  const emptyMid = (): Meeting => ({ date: '', end: '', sections: [], helpers: {} })
  const wk = (slots: Array<{ name: string; pid?: string }>): Week => ({
    range: '', book: '', start: '2026-09-07', current: false,
    mid: {
      date: '', end: '',
      sections: [{ label: 'X', farbe: 'petrol', items: [{ num: 1, title: 'P', meta: '', names: slots }] }],
      helpers: {},
    },
    we: emptyMid(),
  })
  const p = (id: string, fn: string): Person => ({
    id, fn, ln: '', role: 'verkuendiger', tel: '', mail: '', priv: priv(),
  })
  const partNames = (w: Week): PartItem['names'] => (w.mid.sections[0].items[0] as PartItem).names

  it('migrateAssignmentPids: eindeutige Namen bekommen pid, mehrdeutige nicht', () => {
    const persons = [p('pA', 'Anna'), p('pM1', 'Max'), p('pM2', 'Max')] // "Max" mehrdeutig
    const [w] = migrateAssignmentPids([wk([{ name: 'Anna' }, { name: 'Max' }])], persons)
    expect(partNames(w)[0].pid).toBe('pA') // eindeutig zugeordnet
    expect(partNames(w)[1].pid).toBeUndefined() // Dublette → keine Zuordnung
  })

  it('migrateAssignmentPids lässt gesetzte pid unberührt (idempotent, Referenz stabil)', () => {
    const weeks = [wk([{ name: 'Anna', pid: 'schon' }])]
    expect(migrateAssignmentPids(weeks, [p('pA', 'Anna')])).toBe(weeks)
  })

  /*
   * Die Zusätzliche Klasse und ihr Ratgeber gehörten hier lange nicht dazu —
   * dieselbe Lücke, die T38 an `mapPersonSlots` geschlossen hat, nur in der
   * Gegenrichtung. Sie fällt auf, sobald eine Person gelöscht und neu angelegt
   * wird: `dropPersonPid` nimmt die Id überall heraus, zurück bekam sie nur
   * der Hauptsaal. Der Platz der Klasse zählte danach in keiner Auslastung,
   * keiner Konfliktprüfung und keiner Aufgabenliste mehr.
   */
  it('migrateAssignmentPids bindet auch Klasse und Ratgeber', () => {
    const w = wk([{ name: 'Anna' }])
    const item = w.mid.sections[0].items[0] as PartItem
    item.aux = [{ name: 'Anna' }]
    w.mid.auxRatgeber = { name: 'Anna', rolle: 'Ratgeber', bereichsKey: 'ratgeber' }

    const [next] = migrateAssignmentPids([w], [p('pA', 'Anna')])
    const nextItem = next.mid.sections[0].items[0] as PartItem
    expect(nextItem.names[0].pid).toBe('pA')
    expect(nextItem.aux?.[0].pid).toBe('pA')
    expect(next.mid.auxRatgeber?.pid).toBe('pA')
  })

  it('migrateAssignmentPids erfindet keinen Ratgeber, wo keiner ist', () => {
    // Ohne Zusätzliche Klasse darf der Schlüssel nicht auftauchen: `hatAuxKlasse`
    // liest ihn als Marke „hier gibt es eine Klasse".
    const [next] = migrateAssignmentPids([wk([{ name: 'Anna' }])], [p('pA', 'Anna')])
    expect('auxRatgeber' in next.mid).toBe(false)
  })

  it('renameInWeeks über pid: nur der Slot der richtigen Person; Namensgleiche bleiben', () => {
    const [w] = renameInWeeks([wk([{ name: 'Max', pid: 'pM1' }, { name: 'Max', pid: 'pM2' }])], 'pM1', 'Max', 'Max Eins')
    expect(partNames(w)[0].name).toBe('Max Eins') // pid pM1 → umbenannt
    expect(partNames(w)[1].name).toBe('Max') // pid pM2 → unberührt trotz gleichem Namen
  })
})

describe('Hilfsdienst-Id-Bindung (helpers)', () => {
  const emptyMid = (): Meeting => ({ date: '', end: '', sections: [], helpers: {} })
  const wkH = (mik: Array<string | { name: string; pid?: string }>): Week => ({
    range: '', book: '', start: '2026-09-07', current: false,
    // absichtlich als any, um das Alt-Format (Strings) zu simulieren
    mid: { date: '', end: '', sections: [], helpers: { mik } } as unknown as Meeting,
    we: emptyMid(),
  })
  const p = (id: string, fn: string): Person => ({
    id, fn, ln: '', role: 'verkuendiger', tel: '', mail: '', priv: priv(),
  })

  it('normalizeWeekHelpers hebt Alt-Strings auf { name }', () => {
    const [w] = normalizeWeekHelpers([wkH(['Anna', 'Gruppe 1'])])
    expect(w.mid.helpers.mik).toEqual([{ name: 'Anna' }, { name: 'Gruppe 1' }])
  })

  it('migrateAssignmentPids trägt pid an Hilfsdiensten nach (Gruppe bleibt ohne)', () => {
    const [w] = migrateAssignmentPids([wkH([{ name: 'Anna' }, { name: 'Gruppe 1' }])], [p('pA', 'Anna')])
    expect(w.mid.helpers.mik[0]).toEqual({ name: 'Anna', pid: 'pA' })
    expect(w.mid.helpers.mik[1]).toEqual({ name: 'Gruppe 1' }) // Rotation → keine pid
  })

  it('renameInWeeks trifft den Hilfsdienst über die pid', () => {
    const [w] = renameInWeeks([wkH([{ name: 'Anna', pid: 'pA' }])], 'pA', 'Anna', 'Anna Neu')
    expect(w.mid.helpers.mik[0].name).toBe('Anna Neu')
  })
})

function emptyMeeting(): Meeting {
  return { date: '', end: '', sections: [], helpers: {} }
}
