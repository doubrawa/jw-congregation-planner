import { describe, expect, it } from 'vitest'
import {
  ASG,
  dienstZuordnung,
  dutySlot,
  gruppenNamensAufloeser,
  loeseWoche,
  meetingOfDuty,
  mitLiedNummer,
  mondayOf,
  nwsNamensAufloeser,
  PART,
  partItems,
  sammleNwsWochen,
  uuid5,
  verteileWoche,
  ablaufAngleichen,
  livingNachReihe,
  wochenAusExporten,
  wochenUnterschiede,
} from './wochenplanung-importieren.mjs'
import { abschnitt, dokument, tabelle, wochenKopf } from './wochenuebersicht-attrappe'
import type { HelperSlot, SlotAssignment, Week } from '../src/data/types'
import * as helpers from '../src/data/helpers'
import * as bearbeiten from '../src/data/meeting-edit'
import { setAnlass } from '../src/data/anlass'

/**
 * Der Importer läuft außerhalb der App, mit dem Service-Role-Key, selten und
 * unbeobachtet — genau die Sorte Skript, deren Fehler erst auffällt, wenn ein
 * Programm falsch besetzt in der App steht. Geprüft ist deshalb alles, was
 * **entscheidet**: die Datumszuordnung, das Einsammeln aus den NWS-Tabellen und
 * das positionsgenaue Setzen auf die jw.org-Slotstruktur. Der Netzteil (`main`)
 * bleibt außen vor.
 *
 * Die Fixtures bilden die Slotstruktur nach, die `import-week/parse.ts`
 * erzeugt — dieselben Abschnittsfarben, dieselbe Reihenfolge. Läuft der Parser
 * einmal anders, muss dieser Test mitgezogen werden; er ist die Gegenprobe.
 */

/**
 * Die Form der Fixtures — so weit, wie der Importer sie liest. Nicht `Meeting`
 * aus der App: Das verlangt je Punkt eine `iid`, die hier nichts entscheidet.
 * Ein Lied hat keine `names`; genau daran erkennt `partItems` es.
 */
type Punkt = { song?: string; title?: string; meta?: string; names?: SlotAssignment[] }
type Zusammenkunft = {
  date: string
  end: string
  helpers: Record<string, HelperSlot[]>
  sections: { label: string; farbe: string; items: Punkt[] }[]
}

/** Eine Zusammenkunft-unter-der-Woche wie aus dem jw.org-Import. */
function mitteWoche(): Zusammenkunft & { auxRatgeber: SlotAssignment } {
  return {
    date: '',
    end: 'Ende ca. 20:45',
    helpers: {},
    auxRatgeber: { name: '', rolle: 'Ratgeber', bereichsKey: 'ratgeber' },
    sections: [
      { label: 'ERÖFFNUNG', farbe: 'neutral', items: [{ title: 'Lied · Gebet · Einleitende Worte', names: [
        { name: '', rolle: 'Vorsitz', bereichsKey: 'vorsitzMid' },
        { name: '', rolle: 'Gebet', bereichsKey: 'gebet' },
      ] }] },
      { label: 'SCHÄTZE', farbe: 'petrol', items: [
        { title: 'Vortrag', names: [{ name: '', bereichsKey: 'vortrag' }] },
        { title: 'Geistige Schätze', names: [{ name: '', bereichsKey: 'vortrag' }] },
        { title: 'Bibellesung', names: [{ name: '', bereichsKey: 'bibellesung' }] },
      ] },
      { label: 'UNS IM DIENST', farbe: 'gold', items: [
        { title: 'Gespräche beginnen', names: [
          { name: '', bereichsKey: 'schulung' },
          { name: '', rolle: 'Partner', bereichsKey: 'schulungPartner' },
        ] },
        { title: 'Schülervortrag', names: [{ name: '', bereichsKey: 'schulung', male: true }] },
      ] },
      { label: 'UNSER LEBEN', farbe: 'wein', items: [
        { song: 'Lied 100' },
        { title: 'Bedürfnisse', names: [{ name: '', bereichsKey: 'vortrag' }] },
        { title: 'Versammlungsbibelstudium', names: [
          { name: '', rolle: 'Leiter', bereichsKey: 'studium' },
          { name: '', rolle: 'Leser', bereichsKey: 'leser' },
        ] },
      ] },
      { label: 'ABSCHLUSS', farbe: 'neutral', items: [{ title: 'Schlussworte · Gebet', names: [
        { name: '', rolle: 'Gebet', bereichsKey: 'gebet' },
      ] }] },
    ],
  }
}

/** Wochenend-Vorlage wie `weekendTemplate`. */
function wochenendWoche(): Zusammenkunft {
  return {
    date: '',
    end: 'Ende ca. 11:45',
    helpers: {},
    sections: [
      { label: 'ERÖFFNUNG', farbe: 'neutral', items: [{ title: 'Lied · Gebet', names: [
        { name: '', rolle: 'Vorsitz', bereichsKey: 'vorsitzWe' },
        { name: '', rolle: 'Gebet', bereichsKey: 'gebet' },
      ] }] },
      { label: 'ÖFFENTLICHER VORTRAG', farbe: 'petrol', items: [{ title: '(Vortragsthema eintragen)', meta: '30 Min.', names: [
        { name: '', rolle: 'Gastredner', bereichsKey: 'vortrag' },
      ] }] },
      { label: 'WACHTTURM-STUDIUM', farbe: 'wein', items: [
        { song: 'Lied' },
        { title: '(Studienartikel eintragen)', names: [
          { name: '', rolle: 'Leiter', bereichsKey: 'studium' },
          { name: '', rolle: 'Leser', bereichsKey: 'leser' },
        ] },
      ] },
      { label: 'ABSCHLUSS', farbe: 'neutral', items: [{ title: 'Schlussworte · Lied · Gebet', names: [
        { name: '', rolle: 'Gebet', bereichsKey: 'gebet' },
      ] }] },
    ],
  }
}

describe('mondayOf', () => {
  it('Montag bleibt Montag, Samstag fällt auf denselben Montag zurück', () => {
    expect(mondayOf('2026-08-17')).toBe('2026-08-17') // Montag
    expect(mondayOf('2026-08-22')).toBe('2026-08-17') // Samstag derselben Woche
    expect(mondayOf('2026-08-23')).toBe('2026-08-17') // Sonntag derselben Woche
  })

  it('liest auch Daten mit Uhrzeit, wie sie in den NWS-Sicherungen bis April 2026 stehen (18.10.2026)', () => {
    // Mit angehängter Uhrzeit stieg der Neuaufbau mit „Invalid time value" aus.
    expect(mondayOf('2025-06-23T00:00:00')).toBe('2025-06-23')
    expect(mondayOf('2026-02-21T00:00:00Z')).toBe('2026-02-16')
  })
})

describe('mitLiedNummer', () => {
  it('setzt die Nummer auf das Lied-Atom, lässt den Rest', () => {
    expect(mitLiedNummer('Lied · Gebet', 5)).toBe('Lied 5 · Gebet')
    expect(mitLiedNummer('Schlussworte · Lied · Gebet', 151)).toBe('Schlussworte · Lied 151 · Gebet')
    expect(mitLiedNummer('Lied · Gebet', null)).toBe('Lied · Gebet')
  })
})

/** NWS-Tabellen für eine Woche (Montag 2026-08-17, Wochenende Sa 2026-08-22). */
function nwsTabellen() {
  return {
    clmAssignments: [
      { a: '2026-08-17', b: 1, c: PART.Chairman },
      { a: '2026-08-17', b: 1, c: PART.OpeningPrayer },
      { a: '2026-08-17', b: 2, c: PART.ClosingPrayer },
      { a: '2026-08-17', b: 3, c: PART.TreasuresTalk },
      { a: '2026-08-17', b: 4, c: PART.SpiritualGems },
      { a: '2026-08-17', b: 5, c: PART.BibleReading },
      { a: '2026-08-17', b: 6, c: PART.Apply1 },
      { a: '2026-08-17', b: 7, c: PART.Apply1Assistant },
      { a: '2026-08-17', b: 8, c: PART.Apply2 },
      { a: '2026-08-17', b: 9, c: PART.Living1 },
      { a: '2026-08-17', b: 10, c: PART.CBS },
      { a: '2026-08-17', b: 11, c: PART.CBSReader },
      { a: '2026-08-17', b: 12, c: PART.AuxCounselor },
      { a: '2026-08-17', b: 99, c: PART.Apply3, e: 1 }, // Zusätzliche Klasse → ignorieren
    ],
    weekendSchedules: [{ d: '2026-08-22', i: 5, f: 151 }],
    assignments: [
      { dt: '2026-08-22', a: ASG.Chairman, b: 1 },
      { dt: '2026-08-22', a: ASG.WatchtowerReader, b: 2 },
      { dt: '2026-08-22', a: ASG.LocalPublicTalk, e: 'Gustav Gast', d: 'Nachbarstadt', g: 'Ein Thema', f: 12 },
    ],
    duties: [
      // Mitte (Montag 2026-08-17): Saal/Tür/Rundgang/3×Mikrofon/Ton/Zoom
      { a: '2026-08-17', b: 1, c: 28 }, // Saalordner → saal[0]
      { a: '2026-08-17', b: 2, c: 30 }, // Türordner → ord[0]
      { a: '2026-08-17', b: 3, c: 32 }, // Rundgangsordner → rund[0]
      { a: '2026-08-17', b: 4, c: 34 }, // Mikrofone Pos 1 → mik[0]
      { a: '2026-08-17', b: 5, c: 35 }, // Mikrofone Pos 2 → mik[1]
      { a: '2026-08-17', b: 6, c: 36 }, // Mikrofone Pos 3 (Duty4P3) → mik[2]
      { a: '2026-08-17', b: 7, c: 38 }, // Audio/Video (Duty5) → ton[0]
      { a: '2026-08-17', b: 8, c: 40 }, // Zoomordner (Duty6) → zoom[0]
      { a: '2026-08-17', b: 11, c: 42 }, // Dienst 7 (Duty7) → übersprungen
      { a: '2026-08-17', b: 64095, c: 15, d: 1 }, // Wöchentliche Reinigung (Gruppe) → rein
      // Wochenende (Samstag 2026-08-22): Saalordner + 1 Mikrofon
      { a: '2026-08-22', b: 9, c: 28 }, // → we saal[0]
      { a: '2026-08-22', b: 10, c: 34 }, // → we mik[0]
    ],
  }
}

const nameOf = (ref: number) => (ref >= 1 && ref <= 12 ? `P${ref}` : null)
const groupOf = (id: number) => (id === 64095 ? 'Gruppe 6' : null)

describe('sammleNwsWochen', () => {
  it('ordnet Zuteilungen der Programmwoche (Montag) zu und überspringt die Zusätzliche Klasse', () => {
    const w = sammleNwsWochen(nwsTabellen(), nameOf)
    expect([...w.keys()]).toEqual(['2026-08-17'])
    const { mid, we } = w.get('2026-08-17')!
    expect(mid.chairman).toBe('P1')
    expect(mid.openingPrayer).toBe('P1')
    expect(mid.closingPrayer).toBe('P2')
    expect(mid.bibleReading).toBe('P5')
    expect(mid.apply[0]).toEqual({ student: 'P6', assistant: 'P7' })
    expect(mid.apply[1]).toEqual({ student: 'P8', assistant: null })
    expect(mid.living[0]).toBe('P9')
    expect(mid.cbs).toBe('P10')
    expect(mid.cbsReader).toBe('P11')
    expect(mid.auxCounselor).toBe('P12')
    expect(mid.apply[2]).toBeUndefined() // Zusätzliche-Klasse-Zuteilung floss nicht ein
    expect(we.chairman).toBe('P1')
    expect(we.watchtowerReader).toBe('P2')
    expect(we.speaker).toMatchObject({ name: 'Gustav Gast', external: true, theme: 'Ein Thema' })
    expect(we.openingSong).toBe(5)
    expect(we.closingSong).toBe(151)
  })

  it('sammelt Hilfsdienste je Zusammenkunft, Dienst 7 bleibt aus', () => {
    const { mid, we } = sammleNwsWochen(nwsTabellen(), nameOf, groupOf).get('2026-08-17')!
    expect(mid.helpers).toEqual({
      saal: ['P1'], eingang: ['P2'], rund: ['P3'], mik: ['P4', 'P5', 'P6'], ton: ['P7'], zoom: ['P8'],
    })
    expect(mid.helpers.rein).toBeUndefined() // Reinigung steht separat in `cleaning`
    expect(mid.cleaning).toBe('Gruppe 6') // NWS-Gruppe (Typ 15, d:1) → App-Gruppe
    expect(we.helpers).toEqual({ saal: ['P9'], mik: ['P10'] })
  })
})

describe('nwsNamensAufloeser (Dubletten über die stabile id)', () => {
  // Zwei „Paul Beispiel" in NWS: Nachname „Beispiel 1"/„Beispiel 2", Anzeigename gleich.
  // Nur die volle ID (bzw. mid) unterscheidet sie — der Name allein nicht.
  const persons = [
    { mid: 1, ID: 1001, a: 'Paul', b: 'Beispiel 1', d: 'Paul Beispiel' },
    { mid: 2, ID: 1002, a: 'Paul', b: 'Beispiel 2', d: 'Paul Beispiel' },
    { mid: 3, ID: 1003, a: 'Anna', b: 'Klar', d: 'Anna Klar' },
  ]

  it('bindet die Dublette über uuid5(person:<ID>) an den App-Anzeigenamen', () => {
    // App-Personen tragen uuid5("person:<ID>") als id (wie der Generator sie vergibt).
    const appById = new Map([
      [uuid5('person:1001'), 'Paul Beispiel (1)'],
      [uuid5('person:1002'), 'Paul Beispiel (2)'],
    ])
    const auf = nwsNamensAufloeser(persons, appById)
    expect(auf(2)).toBe('Paul Beispiel (2)') // über mid aufgelöst
    expect(auf(1002)).toBe('Paul Beispiel (2)') // über die volle ID
    expect(auf(1)).toBe('Paul Beispiel (1)')
    expect(auf(3)).toBe('Anna Klar') // nicht in appById → roher NWS-Name
  })

  it('ohne appById bleibt der rohe NWS-Name (Rückwärtskompatibilität)', () => {
    const auf = nwsNamensAufloeser(persons)
    expect(auf(1)).toBe('Paul Beispiel')
    expect(auf(2)).toBe('Paul Beispiel')
  })
})

describe('dienstZuordnung', () => {
  it('bevorzugt den festen Schlüssel, sonst den Namen (App-Dienst svc-…)', () => {
    const services = [
      { key: 'saal', name: 'Saalordner' }, // fester Schlüssel
      { key: 'svc-abc', name: 'Rundgangsordner' }, // in der App angelegt
      { key: 'mik', name: 'Mikrofone' },
      { key: 'svc-def', name: 'Ton / Video' },
    ]
    const map = dienstZuordnung(services)
    expect(map.saal).toBe('saal')
    expect(map.rund).toBe('svc-abc') // über den Namen zugeordnet
    expect(map.mik).toBe('mik')
    expect(map.ton).toBe('svc-def') // „Ton / Video" → ton
    expect(map.zoom).toBeUndefined() // kein passender Dienst
  })
})

describe('gruppenNamensAufloeser', () => {
  it('bildet PDG-N auf „Gruppe N" ab', () => {
    const auf = gruppenNamensAufloeser([
      { ID: 31606, a: 'PDG-3 Anna Beispiel' },
      { ID: 64095, a: 'PDG-6 Björn Grünbeispiel' },
    ])
    expect(auf(31606)).toBe('Gruppe 3')
    expect(auf(64095)).toBe('Gruppe 6')
    expect(auf(999)).toBeNull()
  })
})

describe('dutySlot / meetingOfDuty', () => {
  it('dekodiert Dienst und Position — Duty4 (Mikrofone) hat 4 Positionen', () => {
    expect(dutySlot(28)).toEqual({ key: 'saal', pos: 1 })
    expect(dutySlot(30)).toEqual({ key: 'eingang', pos: 1 })
    expect(dutySlot(32)).toEqual({ key: 'rund', pos: 1 })
    expect(dutySlot(34)).toEqual({ key: 'mik', pos: 1 })
    expect(dutySlot(35)).toEqual({ key: 'mik', pos: 2 })
    expect(dutySlot(36)).toEqual({ key: 'mik', pos: 3 }) // Duty4P3 — NICHT Ton
    expect(dutySlot(37)).toEqual({ key: 'mik', pos: 4 }) // Duty4P4
    expect(dutySlot(38)).toEqual({ key: 'ton', pos: 1 }) // Duty5 = Audio/Video
    expect(dutySlot(40)).toEqual({ key: 'zoom', pos: 1 }) // Duty6
    expect(dutySlot(42)).toEqual({ skip: 'dienst7' }) // Duty7 ohne App-Pendant
    expect(dutySlot(15)).toEqual({ skip: 'reinigung' })
  })
  it('ordnet den Dienst der Zusammenkunft zu (Mo=Mitte, Sa/So=Wochenende)', () => {
    expect(meetingOfDuty('2026-08-17')).toBe('mid') // Montag
    expect(meetingOfDuty('2026-08-22')).toBe('we') // Samstag
    expect(meetingOfDuty('2026-08-19')).toBeNull() // Mittwoch → kein Dienst-Tag
  })

  it('liest den Tag auch aus einem Datum mit Uhrzeit (Sicherungen bis April 2026)', () => {
    expect(meetingOfDuty('2025-11-17T00:00:00Z')).toBe('mid') // Montag
    expect(meetingOfDuty('2025-11-15T00:00:00Z')).toBe('we') // Samstag
  })
})

describe('verteileWoche', () => {
  const bind = (name: string) =>
    /^P\d+$/.test(name) ? { name, pid: `id-${name}` } : { name } // extern → ohne pid

  function fuellen(nurLeere = false) {
    const roh = sammleNwsWochen(nwsTabellen(), nameOf, groupOf).get('2026-08-17')!
    const gebunden = loeseWoche(roh, bind)
    const data = { mid: mitteWoche(), we: wochenendWoche() }
    const z = verteileWoche(data, gebunden, nurLeere)
    return { data, z }
  }

  it('setzt die festen Plätze unter der Woche positionsgenau samt pid', () => {
    const { data } = fuellen()
    const eroeffnung = partItems(data.mid.sections[0])[0].names
    expect(eroeffnung[0]).toMatchObject({ name: 'P1', pid: 'id-P1', rolle: 'Vorsitz' })
    expect(eroeffnung[1]).toMatchObject({ name: 'P1', pid: 'id-P1', rolle: 'Gebet' })

    const schaetze = data.mid.sections[1]!.items
    expect(schaetze[0]!.names![0]).toMatchObject({ name: 'P3', pid: 'id-P3' }) // Vortrag
    expect(schaetze[1]!.names![0]).toMatchObject({ name: 'P4' }) // Geistige Schätze
    expect(schaetze[2]!.names![0]).toMatchObject({ name: 'P5' }) // Bibellesung

    const dienst = data.mid.sections[2]!.items
    expect(dienst[0]!.names![0]).toMatchObject({ name: 'P6' })
    expect(dienst[0]!.names![1]).toMatchObject({ name: 'P7', rolle: 'Partner' })
    expect(dienst[1]!.names![0]).toMatchObject({ name: 'P8' })
    expect(dienst[1]!.names).toHaveLength(1) // Schülervortrag: kein Partner-Slot

    const leben = data.mid.sections[3]!.items
    expect(leben[1]!.names![0]).toMatchObject({ name: 'P9' }) // Bedürfnisse (Lied davor)
    expect(leben[2]!.names![0]).toMatchObject({ name: 'P10', rolle: 'Leiter' })
    expect(leben[2]!.names![1]).toMatchObject({ name: 'P11', rolle: 'Leser' })

    expect(partItems(data.mid.sections[4])[0].names[0]).toMatchObject({ name: 'P2' }) // Schlussgebet
    expect(data.mid.auxRatgeber).toMatchObject({ name: 'P12', pid: 'id-P12' })
  })

  it('trägt die Hilfsdienste je Zusammenkunft in meeting.helpers ein (mit pid)', () => {
    const { data, z } = fuellen()
    expect(data.mid.helpers.saal).toEqual([{ name: 'P1', pid: 'id-P1' }])
    expect(data.mid.helpers.eingang).toEqual([{ name: 'P2', pid: 'id-P2' }])
    expect(data.mid.helpers.rund).toEqual([{ name: 'P3', pid: 'id-P3' }])
    expect(data.mid.helpers.mik).toEqual([
      { name: 'P4', pid: 'id-P4' }, { name: 'P5', pid: 'id-P5' }, { name: 'P6', pid: 'id-P6' },
    ])
    expect(data.mid.helpers.ton).toEqual([{ name: 'P7', pid: 'id-P7' }])
    expect(data.mid.helpers.zoom).toEqual([{ name: 'P8', pid: 'id-P8' }])
    // Reinigung als Gruppen-Rotation: Gruppenname ohne pid
    expect(data.mid.helpers.rein).toEqual([{ name: 'Gruppe 6' }])
    expect(data.we.helpers.saal).toEqual([{ name: 'P9', pid: 'id-P9' }])
    expect(data.we.helpers.mik).toEqual([{ name: 'P10', pid: 'id-P10' }])
    expect(z.helfer).toBe(11) // 8 Mitte-Plätze + Reinigung + 2 Wochenende
  })

  it('verkraftet einen Wochenend-Vortrag ohne auflösbaren Redner (kein Absturz)', () => {
    const roh = sammleNwsWochen(
      { assignments: [{ dt: '2026-08-22', a: ASG.LocalPublicTalk, b: 999 }] }, // b unbekannt, kein Freitext
      nameOf,
    ).get('2026-08-17')!
    expect(roh.we.speaker).toMatchObject({ name: null, external: false })
    const gebunden = loeseWoche(roh, bind) // darf nicht werfen
    expect(gebunden.we.speaker.name).toBe('')
  })

  it('leitet Hilfsdienste über die keyMap auf die echten App-Schlüssel um', () => {
    const roh = sammleNwsWochen(nwsTabellen(), nameOf, groupOf).get('2026-08-17')!
    const gebunden = loeseWoche(roh, bind)
    const data = { mid: mitteWoche(), we: wochenendWoche() }
    const keyMap = { saal: 'svc-1', mik: 'svc-2' } // nur zwei Dienste zugeordnet
    const z = verteileWoche(data, gebunden, false, keyMap)
    expect(data.mid.helpers['svc-1']).toEqual([{ name: 'P1', pid: 'id-P1' }]) // saal → svc-1
    expect(data.mid.helpers['svc-2']).toEqual([ // mik → svc-2 (3 Positionen)
      { name: 'P4', pid: 'id-P4' }, { name: 'P5', pid: 'id-P5' }, { name: 'P6', pid: 'id-P6' },
    ])
    expect(data.mid.helpers.saal).toBeUndefined() // nicht unter dem kanonischen Schlüssel
    expect(z.helferOhneDienst).toBeGreaterThan(0) // ord/rund/ton/zoom/rein ohne App-Dienst
  })

  it('setzt Wochenende: Vorsitz, WT-Leser, Redner+Thema (extern ohne pid), Lieder', () => {
    const { data } = fuellen()
    expect(partItems(data.we.sections[0])[0].names[0]).toMatchObject({ name: 'P1', pid: 'id-P1' })
    expect(data.we.sections[0]!.items[0]!.title).toBe('Lied 5 · Gebet')

    const vortrag = data.we.sections[1]!.items[0]!
    expect(vortrag.names![0]).toEqual({ name: 'Gustav Gast', rolle: 'Gastredner', bereichsKey: 'vortrag' })
    expect(vortrag.names![0]!.pid).toBeUndefined() // externer Redner
    expect(vortrag.title).toBe('Ein Thema')

    const wt = data.we.sections[2]!.items
    expect(wt[1]!.names![1]).toMatchObject({ name: 'P2', rolle: 'Leser' }) // WT-Leser
    expect(wt[1]!.names![0]!.name).toBe('') // Leiter kennt NWS nicht → offen

    expect(data.we.sections[3]!.items[0]!.title).toBe('Schlussworte · Lied 151 · Gebet')
  })

  it('--nur-leere lässt bereits besetzte Plätze in Ruhe', () => {
    const roh = sammleNwsWochen(nwsTabellen(), nameOf).get('2026-08-17')!
    const gebunden = loeseWoche(roh, bind)
    const data = { mid: mitteWoche(), we: wochenendWoche() }
    // Vorsitz vorbesetzen
    data.mid.sections[0]!.items[0]!.names![0]!.name = 'Schon da'
    data.mid.sections[0]!.items[0]!.names![0]!.pid = 'alt'
    verteileWoche(data, gebunden, true)
    expect(data.mid.sections[0]!.items[0]!.names![0]).toMatchObject({ name: 'Schon da', pid: 'alt' })
    // ein leerer Platz wird trotzdem gefüllt
    expect(data.mid.sections[0]!.items[0]!.names![1]).toMatchObject({ name: 'P1' })
  })

  it('--nur-leere schützt auch den Ratgeber und das Vortragsthema, nicht aber die Lieder', () => {
    const roh = sammleNwsWochen(nwsTabellen(), nameOf).get('2026-08-17')!
    const gebunden = loeseWoche(roh, bind)
    const data = { mid: mitteWoche(), we: wochenendWoche() }
    // Ratgeber, Redner und dessen Thema hat der Planer selbst eingetragen
    data.mid.auxRatgeber.name = 'Schon da'
    data.mid.auxRatgeber.pid = 'alt'
    const vortrag = data.we.sections[1]!.items[0]!
    vortrag.names![0]!.name = 'Max Muster'
    vortrag.names![0]!.pid = 'alt-we'
    vortrag.title = 'Handverlesenes Thema'
    verteileWoche(data, gebunden, true)
    expect(data.mid.auxRatgeber).toMatchObject({ name: 'Schon da', pid: 'alt' })
    expect(vortrag.names![0]).toMatchObject({ name: 'Max Muster', pid: 'alt-we' })
    // Das Thema gehört zum Redner — bleibt der stehen, bleibt auch sein Thema
    expect(vortrag.title).toBe('Handverlesenes Thema')
    // Liednummern sind Programmstruktur, keine Zuteilung: sie folgen immer NWS
    expect(data.we.sections[0]!.items[0]!.title).toBe('Lied 5 · Gebet')
  })

  it('Ratgeber ohne pid aus NWS löscht die alte pid (kein neuer Name auf fremder Id)', () => {
    const roh = sammleNwsWochen(nwsTabellen(), nameOf).get('2026-08-17')!
    const gebunden = loeseWoche(roh, bind)
    gebunden.mid.auxCounselor = { name: 'Namensdublette' } // bind fand keine pid
    const data = { mid: mitteWoche(), we: wochenendWoche() }
    data.mid.auxRatgeber.name = 'Anton'
    data.mid.auxRatgeber.pid = 'id-anton'
    const z = verteileWoche(data, gebunden, false)
    expect(data.mid.auxRatgeber.name).toBe('Namensdublette')
    expect(data.mid.auxRatgeber.pid).toBeUndefined() // sonst zählte gehoertZu die Aufgabe Anton zu
    expect(z.ohnePid).toBeGreaterThan(0) // und der Bericht weist es aus
  })

  it('gestrichene Zusammenkünfte bleiben leer — NWS kennt den Ausfall nicht', () => {
    const roh = sammleNwsWochen(nwsTabellen(), nameOf, groupOf).get('2026-08-17')!
    const gebunden = loeseWoche(roh, bind)
    const data = { mid: mitteWoche(), we: wochenendWoche(), dev: { we: { cancelled: true } } }
    const z = verteileWoche(data, gebunden, false)
    expect(partItems(data.mid.sections[0])[0].names[0].name).toBe('P1') // Mitte wird gefüllt
    expect(partItems(data.we.sections[0])[0].names[0].name).toBe('') // Wochenende unberührt
    expect(data.we.sections[0]!.items[0]!.title).toBe('Lied · Gebet') // auch keine Liednummer
    expect(data.we.helpers).toEqual({})
    expect(z.gestrichen).toBe(1)
  })
})

describe('wochenUnterschiede — was der Trockenlauf Platz für Platz nennt', () => {
  /*
    Vor dem Schreiben in die echte Datenbank zeigt `--trocken`, wer welchen
    Platz verliert, und erst danach entscheidet der Betreiber — am 2.11.2026
    etwa über Hilfsdienst-Plätze, die App und NWS verschieden besetzten. Fehlt
    hier ein Platz, sieht er die Änderung erst, wenn sie geschrieben ist.
  */
  const woche = () => ({ mid: mitteWoche(), we: wochenendWoche() })

  it('ein neuer Inhaber, ein gefüllter und ein geleerter Platz — je mit Punkt und Rolle', () => {
    const vorher = woche()
    vorher.mid.sections[0]!.items[0]!.names![0] = { name: 'Probe Eins', pid: 'id-1', rolle: 'Vorsitz', bereichsKey: 'vorsitzMid' }
    vorher.mid.sections[4]!.items[0]!.names![0] = { name: 'Probe Drei', pid: 'id-3', rolle: 'Gebet', bereichsKey: 'gebet' }
    const nachher = structuredClone(vorher)
    nachher.mid.sections[0]!.items[0]!.names![0] = { name: 'Probe Zwei', pid: 'id-2', rolle: 'Vorsitz', bereichsKey: 'vorsitzMid' }
    nachher.mid.sections[1]!.items[0]!.names![0] = { name: 'Probe Vier', pid: 'id-4', bereichsKey: 'vortrag' }
    nachher.mid.sections[4]!.items[0]!.names![0] = { name: '', rolle: 'Gebet', bereichsKey: 'gebet' }
    expect(wochenUnterschiede(vorher, nachher)).toEqual([
      { tab: 'mid', punkt: 'Lied · Gebet · Einleitende Worte', platz: 'Vorsitz', alt: 'Probe Eins', neu: 'Probe Zwei' },
      { tab: 'mid', punkt: 'Vortrag', platz: 'Platz 1', alt: '—', neu: 'Probe Vier' },
      { tab: 'mid', punkt: 'Schlussworte · Gebet', platz: 'Gebet', alt: 'Probe Drei', neu: '—' },
    ])
  })

  it('derselbe Name mit einer anderen Person dahinter ist ein Wechsel', () => {
    // Zwei Gleichnamige: Ohne die Id sähe der Bericht keinen Unterschied.
    const vorher = woche()
    vorher.mid.sections[0]!.items[0]!.names![0] = { name: 'Probe Eins', pid: 'id-alt', rolle: 'Vorsitz', bereichsKey: 'vorsitzMid' }
    const nachher = structuredClone(vorher)
    nachher.mid.sections[0]!.items[0]!.names![0]!.pid = 'id-neu'
    expect(wochenUnterschiede(vorher, nachher)).toEqual([
      { tab: 'mid', punkt: 'Lied · Gebet · Einleitende Worte', platz: 'Vorsitz', alt: 'Probe Eins', neu: 'Probe Eins' },
    ])
  })

  it('ein neues Vortragsthema und eine Liednummer stehen als Titel da', () => {
    const vorher = woche()
    const nachher = structuredClone(vorher)
    nachher.we.sections[0]!.items[0]!.title = 'Lied 5 · Gebet'
    nachher.we.sections[1]!.items[0]!.title = 'Probe-Thema'
    expect(wochenUnterschiede(vorher, nachher)).toEqual([
      { tab: 'we', punkt: 'Lied · Gebet', platz: 'Titel', alt: 'Lied · Gebet', neu: 'Lied 5 · Gebet' },
      { tab: 'we', punkt: '(Vortragsthema eintragen)', platz: 'Titel', alt: '(Vortragsthema eintragen)', neu: 'Probe-Thema' },
    ])
  })

  it('Hilfsdienste: ein Platz hinter dem letzten bisherigen und ein ganzer Dienst — in beide Richtungen', () => {
    const vorher = woche()
    vorher.mid.helpers = { mik: [{ name: 'Probe Eins', pid: 'id-1' }] }
    const nachher = structuredClone(vorher)
    nachher.mid.helpers = { mik: [{ name: 'Probe Eins', pid: 'id-1' }, { name: 'Probe Zwei', pid: 'id-2' }], rein: [{ name: 'Gruppe 3' }] }
    expect(wochenUnterschiede(vorher, nachher)).toEqual([
      { tab: 'mid', punkt: 'Hilfsdienst mik', platz: 'Platz 2', alt: '—', neu: 'Probe Zwei' },
      { tab: 'mid', punkt: 'Hilfsdienst rein', platz: 'Platz 1', alt: '—', neu: 'Gruppe 3' },
    ])
    expect(wochenUnterschiede(nachher, vorher)).toEqual([
      { tab: 'mid', punkt: 'Hilfsdienst mik', platz: 'Platz 2', alt: 'Probe Zwei', neu: '—' },
      { tab: 'mid', punkt: 'Hilfsdienst rein', platz: 'Platz 1', alt: 'Gruppe 3', neu: '—' },
    ])
  })

  it('der Ratgeber der Zusätzlichen Klasse', () => {
    const vorher = woche()
    const nachher = structuredClone(vorher)
    nachher.mid.auxRatgeber = { ...nachher.mid.auxRatgeber, name: 'Probe Fünf', pid: 'id-5' }
    expect(wochenUnterschiede(vorher, nachher)).toEqual([
      { tab: 'mid', punkt: 'Zusätzliche Klasse', platz: 'Ratgeber', alt: '—', neu: 'Probe Fünf' },
    ])
  })

  it('die Gegenprobe: dieselbe Woche ergibt nichts — und eine fehlende Zusammenkunft wird nicht verglichen', () => {
    const vorher = woche()
    expect(wochenUnterschiede(vorher, structuredClone(vorher))).toEqual([])
    const nachher = structuredClone(vorher)
    nachher.we.sections[1]!.items[0]!.title = 'Probe-Thema'
    expect(wochenUnterschiede({ mid: vorher.mid }, nachher)).toEqual([])
  })
})

describe('wochenAusExporten — die Exporte an die Personen der App gebunden', () => {
  /*
    Die Wochenübersicht nennt Namen, die App führt Personen. Die Brücke ist
    die Personenliste: Name → NWS-Kennung → `uuid5("person:<ID>")`, dieselbe
    Kennung, die der Personen-Generator vergibt. So kommt auch ein
    Gleichnamiger an die richtige Person — über den Namen allein fände sich
    „Probe Zwei 2" nicht, denn die App schreibt ihn „Probe Zwei (2)".
  */
  const PERSONEN = [
    { PersonID: '101', FirstName: 'Probe', LastName: 'Eins', DisplayName: 'Probe Eins' },
    { PersonID: '102', FirstName: 'Probe ', LastName: 'Zwei 2', DisplayName: 'Probe Zwei' },
    { PersonID: '103', FirstName: 'Probe', LastName: 'Drei', DisplayName: 'Probe Drei' },
  ]
  const APP = new Map([[uuid5('person:101'), 'Probe Eins'], [uuid5('person:102'), 'Probe Zwei (2)']])
  const datei = (name: string, ...tabellen: string[]) => ({ name, xml: dokument(tabellen) })
  const vorsitz = (wer: string, gebet = '·') => tabelle([['Vorsitzender', wer, 'Anfangsgebet', gebet]])
  const AUGUST = 'Probe August 2026 Wochenübersicht.docx'

  it('ein Name kommt über die Personenliste an die App-Person — auch der Gleichnamige', () => {
    const { wochen } = wochenAusExporten([datei(AUGUST, wochenKopf('August 24-30'), vorsitz('Probe Zwei 2', 'Probe Eins'))], PERSONEN, APP)
    expect(wochen.get('2026-08-24')?.mid).toMatchObject({ chairman: 'Probe Zwei (2)', openingPrayer: 'Probe Eins' })
  })

  it('wer in NWS steht, aber nicht in der App, behält seinen Namen — und gilt als NWS-Person', () => {
    const { wochen, nwsNamen } = wochenAusExporten([datei(AUGUST, wochenKopf('August 24-30'), vorsitz('Probe Drei'))], PERSONEN, APP)
    expect(wochen.get('2026-08-24')?.mid.chairman).toBe('Probe Drei')
    // Daran meldet der Import ihn als „NWS-Person ohne App-Konto"; ein Gast steht nicht in der Liste.
    expect(nwsNamen.has('Probe Drei')).toBe(true)
    expect(nwsNamen.has('Probe Gast')).toBe(false)
  })

  it('zwei Monate in einer Lieferung: Wochen, Besonderheiten und übersprungene Dienste zusammen', () => {
    const benutzerdefiniert = abschnitt('Dienste unter der Woche', [['Benutzerdefiniert 1', 'Probe Eins']])
    const { wochen, uebersprungen } = wochenAusExporten(
      [
        datei('Probe November 2026 Wochenübersicht.docx', wochenKopf('November 30-Dezember 06'), vorsitz('Probe Eins'), benutzerdefiniert),
        datei('Probe Dezember 2026 Wochenübersicht.docx', wochenKopf('Dezember 07-13', 'Kreisaufseher'), vorsitz('Probe Eins'), benutzerdefiniert),
      ],
      PERSONEN,
      APP,
    )
    expect([...wochen.keys()]).toEqual(['2026-11-30', '2026-12-07'])
    expect([...wochen.values()].map((w) => w.besonderheit)).toEqual([null, 'Kreisaufseher'])
    expect(uebersprungen).toEqual({ dienste: 2 })
  })

  it('ohne Monat und Jahr im Dateinamen bricht es ab — das Jahr wird nicht geraten', () => {
    expect(() => wochenAusExporten([datei('Wochenübersicht.docx', wochenKopf('August 24-30'))], PERSONEN, APP)).toThrow(
      'Monat und Jahr fehlen im Dateinamen',
    )
  })
})

describe('ablaufAngleichen — das Programm, wie die Versammlung es hält', () => {
  /*
    Gefunden am 3.11.2026: In der Woche vom 2.11. schob NWS „Kreiskongress
    Wiederholung" (12 Min.) vor das Bibelstudium und kürzte beide Nachbarn; in
    der App stand weiter das Arbeitsheft, und der Bruder des eingeschobenen
    Punkts fiel still weg. Die Woche des Kreisaufsehers (7.12.) übersprang der
    Import ganz. Geprüft wird mit den Bearbeitungsfunktionen der App selbst —
    denselben, mit denen der Planer den Abschnitt ändert.
  */
  const app = { ...helpers, ...bearbeiten }
  const platz = (bereichsKey: string, rolle?: string) => ({ name: '', ...(rolle ? { rolle } : {}), bereichsKey })

  /** Eine Woche wie aus `import-week`: Abschnittsarten, Kennungen, Nummern und Minuten. */
  function appWoche(): Week {
    return {
      start: '2026-11-02',
      range: 'Probewoche',
      mid: {
        date: '',
        end: 'Ende ca. 20:45',
        helpers: {},
        sections: [
          { label: 'ERÖFFNUNG', kind: 'eroeffnung', farbe: 'neutral', items: [{ iid: 'e', title: 'Lied 1 und Gebet', meta: '1 Min.', mins: 1, names: [platz('vorsitzMid', 'Vorsitz'), platz('gebet', 'Gebet')] }] },
          { label: 'SCHÄTZE AUS GOTTES WORT', kind: 'schaetze', farbe: 'petrol', items: [
            { iid: 's1', num: 1, title: 'Probe-Vortrag', meta: '10 Min.', mins: 10, names: [platz('vortrag')] },
          ] },
          { label: 'UNSER LEBEN ALS CHRIST', kind: 'lac', farbe: 'wein', items: [
            { song: 'Lied 2' },
            { iid: 'l7', num: 7, title: 'Probe-Punkt', meta: 'Besprechung · 15 Min.', mins: 15, names: [platz('besprechung')] },
            { iid: 'l8', num: 8, title: 'Versammlungsbibelstudium', meta: '30 Min. · Probe', mins: 30, names: [platz('studium', 'Leiter'), platz('leser', 'Leser')] },
          ] },
          { label: 'ABSCHLUSS', kind: 'abschluss', farbe: 'neutral', items: [{ iid: 'a', title: 'Schlussworte · Lied 3 und Gebet', meta: '3 Min.', mins: 3, names: [platz('gebet', 'Gebet')] }] },
        ],
      },
      we: {
        date: '',
        end: 'Ende ca. 11:45',
        helpers: {},
        sections: [
          { label: 'ERÖFFNUNG', kind: 'eroeffnung', farbe: 'neutral', items: [{ iid: 'we', title: 'Lied · Gebet', names: [platz('vorsitzWe', 'Vorsitz'), platz('gebet', 'Gebet')] }] },
          { label: 'ÖFFENTLICHER VORTRAG', kind: 'vortrag', farbe: 'petrol', items: [{ iid: 'wv', title: '(Vortragsthema eintragen)', meta: '30 Min.', mins: 30, names: [platz('vortrag', 'Gastredner')] }] },
          { label: 'WACHTTURM-STUDIUM', kind: 'wtStudium', farbe: 'wein', items: [{ iid: 'wt', title: 'Probe-Artikel', meta: '60 Min.', mins: 60, names: [platz('studium', 'Leiter'), platz('leser', 'Leser')] }] },
          { label: 'ABSCHLUSS', kind: 'abschluss', farbe: 'neutral', items: [{ iid: 'wa', title: 'Schlussworte · Lied · Gebet', names: [platz('gebet', 'Gebet')] }] },
        ],
      },
    } as Week
  }

  type Zeile = { nr: number | null; titel: string; min: number | null; art: 'teil' | 'vbs' | 'ka' }
  const teil = (nr: number | null, titel: string, min: number | null = null): Zeile => ({ nr, titel, min, art: 'teil' })
  const VBS = (min: number | null = null): Zeile => ({ nr: 8, titel: 'Versammlungsbibelstudium', min, art: 'vbs' })
  const lac = (w: Week) => w.mid.sections[2]!.items.filter((x) => !helpers.isSong(x)) as { iid: string; title: string; mins?: number; names: SlotAssignment[] }[]
  const angleichen = (w: Week, ablauf: Zeile[]) => ablaufAngleichen(w, ablauf, app) as { data: Week; reihe: number[] | null; nurApp: string[]; fehler?: string }

  it('ein eingeschobener Punkt kommt vor das Bibelstudium, mit seinen Minuten — und das Ende bleibt, wenn die Summe bleibt', () => {
    const { data, reihe } = angleichen(appWoche(), [teil(7, 'Probe-Punkt', 13), teil(null, 'Probe-Wiederholung', 12), VBS(20)])
    expect(lac(data).map((t) => [t.title, t.mins])).toEqual([['Probe-Punkt', 13], ['Probe-Wiederholung', 12], ['Versammlungsbibelstudium', 20]])
    expect(data.mid.end).toBe('Ende ca. 20:45') // 15 + 30 = 13 + 12 + 20
    expect(data.mid.umgebaut).toBe(true)
    // Der Bruder des eingeschobenen Punkts ist der zweite unter „living".
    expect(reihe).toEqual([0, 1])
  })

  it('die Brüder kommen an ihren Punkt — auch der des eingeschobenen', () => {
    const roh = {
      mid: { chairman: null, openingPrayer: null, closingPrayer: null, auxCounselor: null, treasuresTalk: null, spiritualGems: null, bibleReading: null, apply: [], living: ['Probe Eins', 'Probe Zwei'], cbs: 'Probe Drei', cbsReader: null, helpers: {}, cleaning: null },
      we: { chairman: null, watchtowerReader: null, speaker: null, openingSong: null, closingSong: null, helpers: {}, cleaning: null },
    }
    const { data, reihe } = angleichen(appWoche(), [teil(7, 'Probe-Punkt'), teil(null, 'Probe-Wiederholung'), VBS()])
    const gebunden = loeseWoche(roh, (name: string) => ({ name }))
    gebunden.mid.living = livingNachReihe(gebunden.mid.living, reihe)
    verteileWoche(data, gebunden, false)
    expect(lac(data).map((t) => t.names[0]!.name)).toEqual(['Probe Eins', 'Probe Zwei', 'Probe Drei'])
  })

  it('ein Punkt, den nur die App kennt, bekommt keinen Bruder aus NWS — die übrigen rücken nicht nach', () => {
    expect(livingNachReihe([{ name: 'A' }, { name: 'B' }], [0, -1, 1])).toEqual([{ name: 'A' }, null, { name: 'B' }])
    expect(livingNachReihe([{ name: 'A' }], null)).toEqual([{ name: 'A' }])
  })

  it('ein zweiter Lauf findet den eingeschobenen Punkt wieder — nichts ändert sich mehr', () => {
    const ablauf = [teil(7, 'Probe-Punkt', 13), teil(null, 'Probe-Wiederholung', 12), VBS(20)]
    const erster = angleichen(appWoche(), ablauf).data
    const zweiter = angleichen(structuredClone(erster), ablauf)
    expect(zweiter.data).toEqual(erster)
    expect(zweiter.reihe).toEqual([0, 1])
  })

  it('ohne Nummer an der Stelle eines Punkts aus dem Heft: dessen eigenes Thema, kein neuer Punkt', () => {
    // Die Woche vom 30.11.2026: „Aktuelles" hält die Versammlung mit eigenem Thema.
    const { data, reihe } = angleichen(appWoche(), [teil(null, 'Probe-Thema der Versammlung', 15), VBS(30)])
    expect(lac(data).map((t) => t.title)).toEqual(['Probe-Thema der Versammlung', 'Versammlungsbibelstudium'])
    expect(lac(data)[0]!.iid).toBe('l7')
    expect(reihe).toEqual([0])
  })

  it('die Woche des Kreisaufsehers: sein Thema am Dienstvortrag, er selbst in beiden Vorträgen, das Studium ohne Leser', () => {
    const woche = setAnlass([appWoche()], 0, 'co')[0]!
    const { data, reihe } = angleichen(woche, [teil(null, 'Probe-Bedürfnis', 15), { nr: null, titel: 'Probe-Dienstvortrag', min: 30, art: 'ka' }])
    const punkte = lac(data)
    expect(punkte.map((t) => t.title)).toEqual(['Probe-Bedürfnis', 'Dienstvortrag · Probe-Dienstvortrag'])
    expect(reihe).toEqual([0])

    const roh = {
      mid: { chairman: null, openingPrayer: null, closingPrayer: null, auxCounselor: null, treasuresTalk: null, spiritualGems: null, bibleReading: null, apply: [], living: ['Probe Eins'], cbs: null, cbsReader: null, helpers: {}, cleaning: null, kreisaufseher: 'Probe Kreisaufseher' },
      we: { chairman: null, watchtowerReader: null, speaker: null, openingSong: null, closingSong: null, helpers: {}, cleaning: null },
    }
    const z = verteileWoche(data, loeseWoche(roh, (name: string) => ({ name, pid: `id-${name}` })), false)
    expect(punkte[1]!.names).toEqual([{ name: 'Probe Kreisaufseher', rolle: 'Kreisaufseher', bereichsKey: 'vortrag' }]) // Gast: ohne pid
    const schluss = data.we.sections.find((s) => s.kind === 'dienstvortrag')!.items[0] as { names: SlotAssignment[] }
    expect(schluss.names[0]).toMatchObject({ name: 'Probe Kreisaufseher', rolle: 'Kreisaufseher' })
    const wt = data.we.sections.find((s) => s.kind === 'wtStudium')!.items[0] as { names: SlotAssignment[]; mins: number }
    expect([wt.mins, wt.names.map((n) => n.bereichsKey)]).toEqual([30, ['studium']])
    expect(z.fehlplatz).toBe(0)
  })

  it('ohne Ablauf aus NWS bleibt die Woche, wie sie ist', () => {
    const w = appWoche()
    expect(angleichen(w, [])).toEqual({ data: w, reihe: null, nurApp: [] })
  })

  it('ein eigener Punkt, den nur die App kennt, bleibt — und wird genannt', () => {
    const w = bearbeiten.lacAdd([appWoche()], 0, 'mid', 2, 'Probe aus der App')[0]!
    const { data, nurApp, reihe } = angleichen(w, [teil(7, 'Probe-Punkt'), VBS()])
    expect(lac(data).map((t) => t.title)).toEqual(['Probe-Punkt', 'Probe aus der App', 'Versammlungsbibelstudium'])
    expect(nurApp).toEqual(['Probe aus der App'])
    expect(reihe).toEqual([0, -1])
  })

  it('passt der Ablauf nicht, ändert sich nichts — und der Grund steht da', () => {
    // Eingeschoben vor einen Punkt des Hefts: Die App schiebt nur vor dem Bibelstudium ein.
    expect(angleichen(appWoche(), [teil(null, 'Probe davor'), teil(7, 'Probe-Punkt'), VBS()]).fehler).toBe(
      '„Probe davor" steht in NWS vor Punkt 7 („Probe-Punkt") — eingeschoben wird vor dem Bibelstudium',
    )
    // Ein Punkt des Hefts fehlt in NWS.
    expect(angleichen(appWoche(), [VBS()]).fehler).toBe('Punkt 7 („Probe-Punkt") fehlt in NWS')
    // NWS führt den Kreisaufseher, die App das Bibelstudium.
    expect(angleichen(appWoche(), [teil(7, 'Probe-Punkt'), { nr: null, titel: 'Probe', min: 30, art: 'ka' }]).fehler).toBe(
      'der Dienstvortrag steht in NWS, aber nicht an dieser Stelle in der App',
    )
    // Ohne diesen Abschnitt in der App.
    const ohne = appWoche()
    ohne.mid.sections.splice(2, 1)
    expect(angleichen(ohne, [VBS()]).fehler).toBe('in der App fehlt der Abschnitt „Unser Leben als Christ"')
  })
})

describe('wochenUnterschiede — was sich am Ablauf ändert', () => {
  const punkt = (iid: string, title: string, mins: number, names: SlotAssignment[] = [{ name: '', bereichsKey: 'besprechung' }]) => ({ iid, title, meta: '', mins, names })
  const woche = () => ({
    mid: { sections: [{ label: 'L', farbe: 'wein', items: [punkt('a', 'Probe-Punkt', 15), punkt('b', 'Probe-Studium', 30, [{ name: 'Probe Eins', rolle: 'Leiter', bereichsKey: 'studium' }, { name: 'Probe Zwei', rolle: 'Leser', bereichsKey: 'leser' }])] }], helpers: {} },
  })

  it('ein eingeschobener Punkt, gekürzte Minuten und ein Platz, der wegfällt — zugeordnet über die Kennung', () => {
    const vorher = woche()
    const nachher = structuredClone(vorher)
    const [a, b] = nachher.mid.sections[0]!.items
    a!.mins = 13
    b!.names = [b!.names[0]!]
    nachher.mid.sections[0]!.items = [a!, punkt('neu', 'Probe-Wiederholung', 12, [{ name: 'Probe Drei', bereichsKey: 'besprechung' }]), b!]
    expect(wochenUnterschiede(vorher, nachher)).toEqual([
      { tab: 'mid', punkt: 'Probe-Punkt', platz: 'Minuten', alt: '15', neu: '13' },
      { tab: 'mid', punkt: 'Probe-Wiederholung', platz: 'Punkt', alt: '—', neu: 'neu, 12 Min.' },
      { tab: 'mid', punkt: 'Probe-Wiederholung', platz: 'Platz 1', alt: '—', neu: 'Probe Drei' },
      { tab: 'mid', punkt: 'Probe-Studium', platz: 'Leser', alt: 'Probe Zwei', neu: 'entfällt' },
    ])
  })

  it('der Anlass, ein verlegter Tag und ein Punkt, der wegfällt', () => {
    const vorher = woche()
    const nachher = { ...structuredClone(vorher), anlass: { art: 'co' }, dev: { mid: { wd: 2 } } }
    nachher.mid.sections[0]!.items.splice(0, 1)
    expect(wochenUnterschiede(vorher, nachher)).toEqual([
      { tab: 'woche', punkt: 'Anlass', platz: 'Art', alt: '—', neu: 'Kreisaufseher' },
      { tab: 'mid', punkt: 'Zusammenkunft', platz: 'verlegt auf', alt: '—', neu: 'Dienstag' },
      { tab: 'mid', punkt: 'Probe-Punkt', platz: 'Punkt', alt: 'da', neu: 'entfällt' },
    ])
  })
})
