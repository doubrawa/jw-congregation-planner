import { describe, expect, it } from 'vitest'
import { migrateAssignmentNames, migrateServicePrivs, normalizePriv } from './data'
import type { Meeting, Person, Qualifications, Service, Week } from '../data/types'

function priv(overrides: Record<string, boolean> = {}): Qualifications {
  return {
    vorsitz: false,
    vortrag: false,
    gebet: false,
    bibellesung: false,
    leser: false,
    schulung: false,
    studium: false,
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
    for (const key of ['vorsitz', 'vortrag', 'gebet', 'bibellesung', 'leser', 'schulung', 'studium']) {
      expect(priv[key], key).toBe(false)
    }
  })

  it('altes kombiniertes `lesen` wird auf bibellesung+leser gespiegelt', () => {
    const priv = normalizePriv({ lesen: true } as never)
    expect(priv.bibellesung).toBe(true)
    expect(priv.leser).toBe(true)
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
