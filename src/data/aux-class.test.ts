import { describe, expect, it } from 'vitest'
import {
  angleichen,
  hatAuxKlasse,
  istSchuelerteil,
  ratgeberSlot,
  slotsOf,
  syncAuxSlots,
} from './aux-class'
import { assignmentsInMeeting, countOpenSlots, openSlotLabels, partTaskKey, ratgeberTaskKey } from './planning'
import { partWorkload } from './helpers'
import { togglePartner } from './meeting-edit'
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

  it('behält beim Ausschalten die eingeteilten Namen', () => {
    // Wer versehentlich abschaltet, verlöre sonst die Planung mehrerer Wochen.
    const mitAux = syncAuxSlots([woche([teil('schulung')])], true)
    ;(mitAux[0].mid.sections[0].items[0] as PartItem).aux![0].name = 'Elke Brandt'
    const aus = syncAuxSlots(mitAux, false)
    expect((aus[0].mid.sections[0].items[0] as PartItem).aux?.[0].name).toBe('Elke Brandt')
  })

  it('gibt dieselbe Referenz zurück, wenn sich nichts ändert', () => {
    // Sonst schriebe jeder Ladevorgang alle Wochen neu.
    const einmal = syncAuxSlots([woche([teil('schulung')])], true)
    expect(syncAuxSlots(einmal, true)).toBe(einmal)
    const aus = syncAuxSlots(einmal, false)
    expect(syncAuxSlots(aus, false)).toBe(aus)
  })
})

describe('Ausschalten beendet die Klasse überall', () => {
  const geplant = (): Week[] => {
    const w = syncAuxSlots([woche([teil('schulung', 2)])], true)
    ;(w[0].mid.sections[0].items[0] as PartItem).aux![0].name = 'Elke Brandt'
    w[0].mid.auxRatgeber = { name: 'Manfred Albrecht', bereichsKey: 'ratgeber' }
    return w
  }

  it('die Marke fällt weg — daran hängt jeder Leser', () => {
    // Genau hier lag der Fehler: das Programm entschied am Vorhandensein von
    // item.aux, das beim Ausschalten stehen bleibt, und zeigte weiter beide
    // Räume. Es gibt nur eine Antwort, und die ist hatAuxKlasse.
    expect(hatAuxKlasse(geplant()[0].mid)).toBe(true)
    expect(hatAuxKlasse(syncAuxSlots(geplant(), false)[0].mid)).toBe(false)
  })

  it('nur noch der Hauptsaal ist zu besetzen', () => {
    const offenMit = countOpenSlots(geplant()[0].mid, [])
    const offenOhne = countOpenSlots(syncAuxSlots(geplant(), false)[0].mid, [])
    // Mit Klasse: der leere Partnerplatz der Klasse zählt mit.
    expect(offenMit).toBe(offenOhne + 1)
  })

  it('und beim Wiedereinschalten ist die Planung wieder da', () => {
    const wieder = syncAuxSlots(syncAuxSlots(geplant(), false), true)
    expect((wieder[0].mid.sections[0].items[0] as PartItem).aux?.[0].name).toBe('Elke Brandt')
    // Nur der Ratgeber ist neu einzuteilen — er ist die Marke selbst.
    expect(wieder[0].mid.auxRatgeber?.name).toBe('')
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

describe('Ratgeber-Platz entsteht in den Daten', () => {
  it('beim Einschalten, nicht erst beim Anzeigen', () => {
    // Sonst zählt ihn countOpenSlots nicht, die Auto-Zuteilung übergeht ihn
    // und send-reminders erinnert niemanden — genau so war es zuerst.
    const w = syncAuxSlots([woche([teil('schulung')])], true)
    expect(w[0].mid.auxRatgeber).toEqual({
      name: '', rolle: 'Ratgeber', bereichsKey: 'ratgeber', male: true,
    })
  })

  it('auch bei Wochen ganz ohne Schülerteil', () => {
    // Eine Woche kann durch LAC-Bearbeitung ohne Schülerteile dastehen; der
    // Ratgeber gehört trotzdem zur Zusammenkunft.
    const w = syncAuxSlots([woche([teil('gebet')])], true)
    expect(w[0].mid.auxRatgeber?.bereichsKey).toBe('ratgeber')
  })

  it('bereits besetzter Ratgeber bleibt unangetastet', () => {
    const einmal = syncAuxSlots([woche([teil('schulung')])], true)
    einmal[0].mid.auxRatgeber = { name: 'Manfred Albrecht', bereichsKey: 'ratgeber' }
    const nochmal = syncAuxSlots(einmal, true)
    expect(nochmal[0].mid.auxRatgeber?.name).toBe('Manfred Albrecht')
  })
})

describe('Zusätzliche Klasse zählt überall gleich mit', () => {
  /** Woche mit eingeschalteter Klasse und je einem besetzten Platz. */
  function mitKlasse(): Week {
    const w = syncAuxSlots([woche([teil('schulung', 2)])], true)[0]
    const item = w.mid.sections[0].items[0] as PartItem
    item.names[0].name = 'Haupt Saal'
    item.aux![0].name = 'Zweite Klasse'
    w.mid.auxRatgeber = { name: 'Rolf Ratgeber', rolle: 'Ratgeber', bereichsKey: 'ratgeber' }
    return w
  }

  it('assignmentsInMeeting sieht die Klasse und den Ratgeber (T17)', () => {
    // Ohne diese Zeilen blieb der Hinweis „heute schon zugeteilt" aus, und das
    // Dashboard zeigte „frei" für jemanden, der in der Klasse eingeteilt war.
    const m = mitKlasse().mid
    expect(assignmentsInMeeting(m, 'Zweite Klasse', []).length).toBe(1)
    expect(assignmentsInMeeting(m, 'Rolf Ratgeber', []).length).toBe(1)
    expect(assignmentsInMeeting(m, 'Haupt Saal', []).length).toBe(1)
  })

  it('openSlotLabels und countOpenSlots kommen auf dieselbe Zahl (T19)', () => {
    // Der Planen-Kopf nannte eine höhere Zahl, als das Banner darunter
    // auflistete: die Zählung kannte Klasse und Ratgeber, die Liste nicht.
    for (const ratgeberBesetzt of [true, false]) {
      const w = mitKlasse()
      if (!ratgeberBesetzt) w.mid.auxRatgeber!.name = ''
      const gezaehlt = countOpenSlots(w.mid, [])
      const gelistet = openSlotLabels(w.mid, []).reduce((s, o) => s + o.n, 0)
      expect(gelistet, `Ratgeber besetzt: ${ratgeberBesetzt}`).toBe(gezaehlt)
      expect(gezaehlt).toBeGreaterThan(0) // sonst wäre die Gleichheit wertlos
    }
  })

  it('partWorkload zählt die Klasse nur, solange es sie gibt (T20)', () => {
    const an = mitKlasse()
    expect(partWorkload([an], 'Zweite Klasse')).toBe(1)
    expect(partWorkload([an], 'Rolf Ratgeber')).toBe(1)
    // Abschalten lässt die Namen absichtlich stehen — zählen dürfen sie nicht.
    const aus = syncAuxSlots([an], false)[0]
    expect((aus.mid.sections[0].items[0] as PartItem).aux?.[0].name).toBe('Zweite Klasse')
    expect(partWorkload([aus], 'Zweite Klasse')).toBe(0)
    expect(partWorkload([aus], 'Rolf Ratgeber')).toBe(0)
  })
})

describe('togglePartner zieht die Klasse mit (T22)', () => {
  it('nach dem Hinzufügen haben beide Räume gleich viele Plätze', () => {
    const w = syncAuxSlots([woche([teil('schulung', 1)])], true)
    const vorher = w[0].mid.sections[0].items[0] as PartItem
    expect(vorher.names).toHaveLength(1)
    expect(vorher.aux).toHaveLength(1)

    const nachher = togglePartner(w, 0, 'mid', 0, 0)[0].mid.sections[0].items[0] as PartItem
    expect(nachher.names).toHaveLength(2)
    expect(nachher.aux).toHaveLength(2) // war vorher 1 → Klasse hinkte hinterher
    expect(nachher.aux![1].bereichsKey).toBe('schulungPartner')
  })

  it('und nach dem Entfernen ebenso, ohne vergebene Namen zu verlieren', () => {
    const w = syncAuxSlots([woche([teil('schulung', 2)])], true)
    const item = w[0].mid.sections[0].items[0] as PartItem
    item.aux![0].name = 'Bleibt Stehen'
    const nachher = togglePartner(w, 0, 'mid', 0, 0)[0].mid.sections[0].items[0] as PartItem
    expect(nachher.names).toHaveLength(1)
    expect(nachher.aux).toHaveLength(1)
    expect(nachher.aux![0].name).toBe('Bleibt Stehen')
  })

  it('ohne Klasse bleibt aux unangetastet', () => {
    const nachher = togglePartner([woche([teil('schulung', 1)])], 0, 'mid', 0, 0)[0]
      .mid.sections[0].items[0] as PartItem
    expect(nachher.names).toHaveLength(2)
    expect(nachher.aux).toBeUndefined()
  })
})
