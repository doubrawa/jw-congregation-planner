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
} from './wochenplanung-importieren.mjs'

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

/** Eine Zusammenkunft-unter-der-Woche wie aus dem jw.org-Import. */
function mitteWoche() {
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
          { name: '', rolle: 'Gesprächspartner', bereichsKey: 'schulungPartner' },
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
function wochenendWoche() {
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
      saal: ['P1'], ord: ['P2'], rund: ['P3'], mik: ['P4', 'P5', 'P6'], ton: ['P7'], zoom: ['P8'],
    })
    expect(mid.helpers.rein).toBeUndefined() // Reinigung steht separat in `cleaning`
    expect(mid.cleaning).toBe('Gruppe 6') // NWS-Gruppe (Typ 15, d:1) → App-Gruppe
    expect(we.helpers).toEqual({ saal: ['P9'], mik: ['P10'] })
  })
})

describe('nwsNamensAufloeser (Dubletten über die stabile id)', () => {
  // Zwei „Josef Mayer" in NWS: Nachname „Mayer 1"/„Mayer 2", Anzeigename gleich.
  // Nur die volle ID (bzw. mid) unterscheidet sie — der Name allein nicht.
  const persons = [
    { mid: 1, ID: 1001, a: 'Josef', b: 'Mayer 1', d: 'Josef Mayer' },
    { mid: 2, ID: 1002, a: 'Josef', b: 'Mayer 2', d: 'Josef Mayer' },
    { mid: 3, ID: 1003, a: 'Anna', b: 'Klar', d: 'Anna Klar' },
  ]

  it('bindet die Dublette über uuid5(person:<ID>) an den App-Anzeigenamen', () => {
    // App-Personen tragen uuid5("person:<ID>") als id (wie der Generator sie vergibt).
    const appById = new Map([
      [uuid5('person:1001'), 'Josef Mayer (1)'],
      [uuid5('person:1002'), 'Josef Mayer (2)'],
    ])
    const auf = nwsNamensAufloeser(persons, appById)
    expect(auf(2)).toBe('Josef Mayer (2)') // über mid aufgelöst
    expect(auf(1002)).toBe('Josef Mayer (2)') // über die volle ID
    expect(auf(1)).toBe('Josef Mayer (1)')
    expect(auf(3)).toBe('Anna Klar') // nicht in appById → roher NWS-Name
  })

  it('ohne appById bleibt der rohe NWS-Name (Rückwärtskompatibilität)', () => {
    const auf = nwsNamensAufloeser(persons)
    expect(auf(1)).toBe('Josef Mayer')
    expect(auf(2)).toBe('Josef Mayer')
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
      { ID: 31606, a: 'PDG-3 Matthias Thoma' },
      { ID: 64095, a: 'PDG-6 Jürgen Doubrawa' },
    ])
    expect(auf(31606)).toBe('Gruppe 3')
    expect(auf(64095)).toBe('Gruppe 6')
    expect(auf(999)).toBeNull()
  })
})

describe('dutySlot / meetingOfDuty', () => {
  it('dekodiert Dienst und Position — Duty4 (Mikrofone) hat 4 Positionen', () => {
    expect(dutySlot(28)).toEqual({ key: 'saal', pos: 1 })
    expect(dutySlot(30)).toEqual({ key: 'ord', pos: 1 })
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

    const schaetze = data.mid.sections[1].items
    expect(schaetze[0].names[0]).toMatchObject({ name: 'P3', pid: 'id-P3' }) // Vortrag
    expect(schaetze[1].names[0]).toMatchObject({ name: 'P4' }) // Geistige Schätze
    expect(schaetze[2].names[0]).toMatchObject({ name: 'P5' }) // Bibellesung

    const dienst = data.mid.sections[2].items
    expect(dienst[0].names[0]).toMatchObject({ name: 'P6' })
    expect(dienst[0].names[1]).toMatchObject({ name: 'P7', rolle: 'Gesprächspartner' })
    expect(dienst[1].names[0]).toMatchObject({ name: 'P8' })
    expect(dienst[1].names).toHaveLength(1) // Schülervortrag: kein Partner-Slot

    const leben = data.mid.sections[3].items
    expect(leben[1].names[0]).toMatchObject({ name: 'P9' }) // Bedürfnisse (Lied davor)
    expect(leben[2].names[0]).toMatchObject({ name: 'P10', rolle: 'Leiter' })
    expect(leben[2].names[1]).toMatchObject({ name: 'P11', rolle: 'Leser' })

    expect(partItems(data.mid.sections[4])[0].names[0]).toMatchObject({ name: 'P2' }) // Schlussgebet
    expect(data.mid.auxRatgeber).toMatchObject({ name: 'P12', pid: 'id-P12' })
  })

  it('trägt die Hilfsdienste je Zusammenkunft in meeting.helpers ein (mit pid)', () => {
    const { data, z } = fuellen()
    expect(data.mid.helpers.saal).toEqual([{ name: 'P1', pid: 'id-P1' }])
    expect(data.mid.helpers.ord).toEqual([{ name: 'P2', pid: 'id-P2' }])
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
    expect(data.we.sections[0].items[0].title).toBe('Lied 5 · Gebet')

    const vortrag = data.we.sections[1].items[0]
    expect(vortrag.names[0]).toEqual({ name: 'Gustav Gast', rolle: 'Gastredner', bereichsKey: 'vortrag' })
    expect(vortrag.names[0].pid).toBeUndefined() // externer Redner
    expect(vortrag.title).toBe('Ein Thema')

    const wt = data.we.sections[2].items
    expect(wt[1].names[1]).toMatchObject({ name: 'P2', rolle: 'Leser' }) // WT-Leser
    expect(wt[1].names[0].name).toBe('') // Leiter kennt NWS nicht → offen

    expect(data.we.sections[3].items[0].title).toBe('Schlussworte · Lied 151 · Gebet')
  })

  it('--nur-leere lässt bereits besetzte Plätze in Ruhe', () => {
    const roh = sammleNwsWochen(nwsTabellen(), nameOf).get('2026-08-17')!
    const gebunden = loeseWoche(roh, bind)
    const data = { mid: mitteWoche(), we: wochenendWoche() }
    // Vorsitz vorbesetzen
    data.mid.sections[0].items[0].names[0].name = 'Schon da'
    data.mid.sections[0].items[0].names[0].pid = 'alt'
    verteileWoche(data, gebunden, true)
    expect(data.mid.sections[0].items[0].names[0]).toMatchObject({ name: 'Schon da', pid: 'alt' })
    // ein leerer Platz wird trotzdem gefüllt
    expect(data.mid.sections[0].items[0].names[1]).toMatchObject({ name: 'P1' })
  })
})
