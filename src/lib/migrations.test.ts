import { describe, expect, it } from 'vitest'
import { migrateAssignmentNames, migrateServicePrivs, normalizePriv, renameInWeeks } from './data'
import type { Meeting, Person, Qualifications, Service, Week } from '../data/types'

function priv(overrides: Record<string, boolean> = {}): Qualifications {
  return {
    vorsitzMid: false,
    vorsitzWe: false,
    vortrag: false,
    gebet: false,
    bibellesung: false,
    leser: false,
    schulung: false,
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
    absent: [],
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
    helpers: { mik: ['B. Mauz', 'Gruppe 1', 'S. Krüger', 'Unbekannte Person'] },
  })
  const week = (): Week => ({ range: '', book: '', current: false, mid: meeting(), we: meeting() })

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
      'Bernhard Mauz',
      'Gruppe 1', // Gruppen-Rotation unangetastet
      'S. Krüger', // mehrdeutig → nicht anfassen
      'Unbekannte Person', // gehört keiner Person → unangetastet
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
    helpers: { mik: ['Simon Krüger', 'Gruppe 1'] },
  })
  const week = (): Week => ({ range: '', book: '', current: false, mid: meeting(), we: meeting() })

  it('ersetzt exakt den alten Anzeigenamen in Programmpunkten und Hilfsdiensten', () => {
    const [w] = renameInWeeks([week()], 'Simon Krüger', 'Simon Müller')
    const item = w.mid.sections[0].items[0]
    expect('names' in item && item.names[0].name).toBe('Simon Müller')
    expect('names' in item && item.names[1].name).toBe('Bernhard Mauz') // andere unberührt
    expect(w.mid.helpers.mik).toEqual(['Simon Müller', 'Gruppe 1'])
    expect(w.we.helpers.mik[0]).toBe('Simon Müller') // beide Zusammenkünfte
  })

  it('lässt Wochen ohne Treffer als identische Referenz', () => {
    const weeks = [week()]
    expect(renameInWeeks(weeks, 'Niemand Da', 'Neu')).toBe(weeks)
    expect(renameInWeeks(weeks, 'Simon Krüger', 'Simon Krüger')).toBe(weeks) // kein Wechsel
  })

  it('rührt nur die betroffene Woche an (unbetroffene behalten ihre Referenz)', () => {
    const w0 = week() // enthält Simon Krüger
    const w1: Week = { range: 'leer', book: '', current: false, mid: emptyMeeting(), we: emptyMeeting() }
    const next = renameInWeeks([w0, w1], 'Simon Krüger', 'Simon Müller')
    expect(next[0]).not.toBe(w0)
    expect(next[1]).toBe(w1) // unverändert → gleiche Referenz (kein DB-Write)
  })
})

function emptyMeeting(): Meeting {
  return { date: '', end: '', sections: [], helpers: {} }
}
