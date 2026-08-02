import { describe, expect, it } from 'vitest'
import { angleichen, istSchuelerteil, ratgeberSlot, slotsOf, syncAuxSlots } from './aux-class'
import { partTaskKey, ratgeberTaskKey } from './planning'
import type { PartItem, Section, Week } from './types'

const teil = (bereichsKey: string, plaetze = 1): PartItem => ({
  title: 'Gespräche beginnen',
  names: Array.from({ length: plaetze }, (_, i) => ({
    name: '',
    rolle: i === 0 ? undefined : 'Gesprächspartner',
    bereichsKey: i === 0 ? bereichsKey : 'schulungPartner',
  })),
})

const woche = (items: PartItem[]): Week =>
  ({
    range: '7.–13. September',
    book: 'Jeremia',
    current: false,
    mid: { date: 'Dienstag', end: '', sections: [{ label: 'X', farbe: 'gold', items } as Section], helpers: {} },
    we: { date: 'Sonntag', end: '', sections: [], helpers: {} },
  }) as Week

describe('Was in der Zusätzlichen Klasse wiederholt wird', () => {
  it('Schülerteile ja — Bibellesung und „Uns im Dienst verbessern"', () => {
    expect(istSchuelerteil(teil('bibellesung'))).toBe(true)
    expect(istSchuelerteil(teil('schulung'))).toBe(true)
  })

  it('alles andere nein', () => {
    // Die Teilnehmer gehen erst NACH „Nach geistigen Schätzen graben" hinüber
    // und sind bei Vorsitz, Gebet und Versammlungsbibelstudium nicht dabei.
    expect(istSchuelerteil(teil('vorsitzMid'))).toBe(false)
    expect(istSchuelerteil(teil('gebet'))).toBe(false)
    expect(istSchuelerteil(teil('studium'))).toBe(false)
    expect(istSchuelerteil({ song: 'Lied 1' })).toBe(false)
  })

  it('erkennt am Bereich, nicht am Titel', () => {
    // Titel kommen in der Sprache der Versammlung aus dem Arbeitsheft.
    const englisch: PartItem = { title: 'Starting a Conversation', names: [{ name: '', bereichsKey: 'schulung' }] }
    expect(istSchuelerteil(englisch)).toBe(true)
  })
})

describe('Plätze angleichen', () => {
  it('spiegelt Anzahl und Regeln des Hauptsaals, aber ohne Namen', () => {
    const t = teil('schulung', 2)
    const aux = angleichen(t)
    expect(aux).toHaveLength(2)
    expect(aux.map((s) => s.name)).toEqual(['', ''])
    expect(aux[1].bereichsKey).toBe('schulungPartner')
  })

  it('behält bereits vergebene Namen, wenn ein Platz dazukommt', () => {
    // Ein Gesprächspartner kann nachträglich hinzugefügt werden — die schon
    // eingeteilte Person darf dabei nicht verloren gehen.
    const t: PartItem = { ...teil('schulung', 1), aux: [{ name: 'Elke Brandt', pid: 'p7' }] }
    const erweitert: PartItem = { ...teil('schulung', 2), aux: t.aux }
    const aux = angleichen(erweitert)
    expect(aux[0].name).toBe('Elke Brandt')
    expect(aux[0].pid).toBe('p7')
    expect(aux[1].name).toBe('')
  })

  it('kürzt mit, wenn ein Platz wegfällt', () => {
    const t: PartItem = { ...teil('schulung', 1), aux: [{ name: 'A' }, { name: 'B' }] }
    expect(angleichen(t)).toHaveLength(1)
  })
})

describe('syncAuxSlots', () => {
  it('richtet beim Einschalten jede Schüleraufgabe her', () => {
    const w = syncAuxSlots([woche([teil('schulung', 2), teil('gebet')])], true)
    const items = w[0].mid.sections[0].items as PartItem[]
    expect(items[0].aux).toHaveLength(2)
    expect(items[1].aux).toBeUndefined() // kein Schülerteil
  })

  it('löscht beim Ausschalten nichts', () => {
    // Wer versehentlich abschaltet, verlöre sonst die Planung mehrerer Wochen.
    const mitAux = syncAuxSlots([woche([teil('schulung')])], true)
    const aus = syncAuxSlots(mitAux, false)
    expect((aus[0].mid.sections[0].items[0] as PartItem).aux).toHaveLength(1)
  })

  it('gibt dieselbe Referenz zurück, wenn sich nichts ändert', () => {
    // Sonst schriebe jeder Ladevorgang alle Wochen neu.
    const einmal = syncAuxSlots([woche([teil('schulung')])], true)
    expect(syncAuxSlots(einmal, true)).toBe(einmal)
  })
})

describe('Schlüssel', () => {
  it('Hauptsaal-Schlüssel bleiben unverändert', () => {
    // Entscheidend: bestehende Bestätigungen in der Datenbank hängen daran.
    expect(partTaskKey(0, 'mid', 1, 2, 0)).toBe('0|mid|part|1|2|0')
  })

  it('die Zusätzliche Klasse hat eigene Schlüssel', () => {
    expect(partTaskKey(0, 'mid', 1, 2, 0, true)).toBe('0|mid|aux|1|2|0')
    expect(ratgeberTaskKey(0, 'mid')).toBe('0|mid|ratgeber')
  })
})

describe('Ratgeber', () => {
  it('ist ein Platz je Zusammenkunft, männlich, mit eigenem Bereich', () => {
    const slot = ratgeberSlot(woche([]).mid)
    expect(slot).toEqual({ name: '', rolle: 'Ratgeber', bereichsKey: 'ratgeber', male: true })
  })
})

describe('slotsOf', () => {
  it('liefert Hauptsaal oder Klasse — und nie undefined', () => {
    const t = teil('schulung')
    expect(slotsOf(t, false)).toBe(t.names)
    expect(slotsOf(t, true)).toEqual([])
  })
})
