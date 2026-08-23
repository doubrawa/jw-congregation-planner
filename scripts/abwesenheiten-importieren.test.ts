import { describe, expect, it } from 'vitest'
import {
  abwSchluessel,
  heuteISO,
  planeImport,
  sammleZeitraeume,
  verschmelzeZeitraeume,
} from './abwesenheiten-importieren.mjs'
import { nameAufloeser, nurDatum, personIdAufloeser } from './nws-personen.mjs'
import { uuid5 } from './wochenplanung-importieren.mjs'

/**
 * Der Abwesenheits-Import läuft einmalig, mit dem Service-Role-Key, gegen die
 * Live-Daten. Ein Fehler fällt niemandem auf: Eine Abwesenheit zu viel sperrt
 * jemanden still für Wochen, eine zu wenig teilt einen Verreisten ein. Geprüft
 * ist deshalb alles, was **entscheidet** — die Personen-Zuordnung, das Lesen der
 * NWS-Zeiträume und die Auswahl dessen, was eingefügt wird. Der Netzteil
 * (`main`) bleibt außen vor.
 */

/** NWS-Person, wie sie in `Persons_7.5.json` steht (drei Referenz-Formen). */
const nwsPerson = (id: number, mid: number, name: string) => ({
  ID: id, mid, cid: '307-471-430', d: name, Deleted: false,
})

const ANNA = nwsPerson(430418939, 418939, 'Anna Beispiel')
const BERND = nwsPerson(430648141, 648141, 'Bernd Beispiel')
const PERSONEN = [ANNA, BERND]

const zeitraum = (a: number | string, b: string, c: string, weitere = {}) => ({
  ID: 1, Deleted: false, a, b, c, ...weitere,
})

describe('nurDatum', () => {
  it('schneidet die Uhrzeit ab — beide NWS-Schreibweisen', () => {
    // AwayPeriods schreibt „2026-08-10", UnavailablePeriods „2026-08-10T00:00:00".
    expect(nurDatum('2026-08-10')).toBe('2026-08-10')
    expect(nurDatum('2026-08-10T00:00:00')).toBe('2026-08-10')
    expect(nurDatum(null)).toBe('')
  })
})

describe('personIdAufloeser', () => {
  const aufloesen = personIdAufloeser(PERSONEN)

  it('trifft dieselbe App-Person über alle drei Referenz-Formen', () => {
    /*
     * Der eigentliche Punkt: AwayPeriods referenziert über die volle ID,
     * UnavailablePeriods über „<cid>-<mid>". Kennte der Auflöser nur eine Form,
     * bliebe eine ganze Quelle unzuordenbar — und zwar still, als „Person fehlt
     * in der App".
     */
    const erwartet = uuid5('person:430418939')
    expect(aufloesen(430418939)).toBe(erwartet)
    expect(aufloesen(418939)).toBe(erwartet)
    expect(aufloesen('307-471-430-418939')).toBe(erwartet)
  })

  it('ist dieselbe Ableitung wie im Personen-Generator', () => {
    // Bricht, sobald jemand Namensraum oder Eingabeform ändert — dann zeigen
    // die importierten Abwesenheiten auf Personen, die es nicht gibt.
    expect(aufloesen(430648141)).toBe(uuid5('person:430648141'))
  })

  it('kennt Unbekannte nicht', () => {
    expect(aufloesen(999999999)).toBeNull()
  })
})

describe('sammleZeitraeume', () => {
  it('überspringt Gelöschte und unvollständige Zeilen', () => {
    const { zeitraeume } = sammleZeitraeume(
      [
        zeitraum(430418939, '2026-09-06', '2026-09-11'),
        zeitraum(430418939, '2026-10-01', '2026-10-02', { Deleted: true }),
        zeitraum(0, '2026-10-01', '2026-10-02'), // ohne Person
        zeitraum(430648141, '', '2026-10-02'), // ohne Von
      ],
      'abwesend',
    )
    expect(zeitraeume).toEqual([
      { ref: 430418939, von: '2026-09-06', bis: '2026-09-11', herkunft: 'abwesend' },
    ])
  })

  it('meldet verdrehte Zeiträume, statt sie zu drehen', () => {
    /*
     * „bis vor von" bedeutet in NWS nichts Bestimmtes. Wer es geraderückt,
     * erfindet einen Zeitraum — und der sperrt eine Person womöglich wochenlang.
     */
    const { zeitraeume, verdreht } = sammleZeitraeume(
      [zeitraum(430418939, '2026-09-11', '2026-09-06')],
      'abwesend',
    )
    expect(zeitraeume).toEqual([])
    expect(verdreht).toHaveLength(1)
  })
})

describe('verschmelzeZeitraeume', () => {
  const z = (von: string, bis: string) => ({ ref: 1, von, bis, herkunft: 'abwesend' })
  const spanne = (liste: ReturnType<typeof z>[]) =>
    verschmelzeZeitraeume(liste).map((e) => `${e.von}→${e.bis}`)

  it('fasst eine nachträgliche Verlängerung zusammen (der echte NWS-Fall)', () => {
    /*
     * So stand es im Livebestand: `10.08.→30.08.` (Zeitstempel Januar) und
     * `10.08.→31.08.` (Ende Januar, ein Tag drangehängt) — NWS behält beim
     * Ändern die alte Zeile. Ohne Zusammenfassen stünden beide in der App.
     */
    expect(spanne([z('2026-08-10', '2026-08-30'), z('2026-08-10', '2026-08-31')]))
      .toEqual(['2026-08-10→2026-08-31'])
  })

  it('schluckt einen Zeitraum, der ganz in einem anderen liegt', () => {
    // Auch das echt: 01.–28.12. neben 11.–21.12., sogar mit demselben Zeitstempel.
    expect(spanne([z('2026-12-01', '2026-12-28'), z('2026-12-11', '2026-12-21')]))
      .toEqual(['2026-12-01→2026-12-28'])
  })

  it('verbindet, was lückenlos anschließt', () => {
    // Wer bis zum 30. weg ist und ab dem 31. weiter, war durchgehend weg.
    expect(spanne([z('2026-08-01', '2026-08-30'), z('2026-08-31', '2026-09-05')]))
      .toEqual(['2026-08-01→2026-09-05'])
  })

  it('lässt einen echten Abstand stehen — auch von einem Tag', () => {
    /*
     * Die Grenze, an der alles hängt: Zwischen dem 30. und dem 1. liegt der
     * 31. — an dem ist die Person da. Ein Zusammenfassen darüber hinweg
     * erfände eine Abwesenheit und spielte jemanden aus der Planung.
     */
    expect(spanne([z('2026-08-01', '2026-08-30'), z('2026-09-01', '2026-09-05')]))
      .toEqual(['2026-08-01→2026-08-30', '2026-09-01→2026-09-05'])
  })

  it('ist stabil: zweimal angewandt ändert sich nichts', () => {
    // Sonst fände der zweite Lauf seinen eigenen Eintrag nicht wieder.
    const einmal = verschmelzeZeitraeume([z('2026-08-10', '2026-08-30'), z('2026-08-10', '2026-08-31')])
    expect(verschmelzeZeitraeume(einmal).map((e) => `${e.von}→${e.bis}`)).toEqual(['2026-08-10→2026-08-31'])
  })

  it('hängt nicht an der Reihenfolge der Eingabe', () => {
    const vorwaerts = spanne([z('2026-08-01', '2026-08-10'), z('2026-08-05', '2026-08-20')])
    const rueckwaerts = spanne([z('2026-08-05', '2026-08-20'), z('2026-08-01', '2026-08-10')])
    expect(vorwaerts).toEqual(rueckwaerts)
    expect(vorwaerts).toEqual(['2026-08-01→2026-08-20'])
  })
})

describe('planeImport', () => {
  const appIds = new Set([uuid5('person:430418939'), uuid5('person:430648141')])
  const personIdOf = personIdAufloeser(PERSONEN)
  const z = (ref: number, von: string, bis: string, herkunft = 'abwesend') => ({ ref, von, bis, herkunft })

  it('nimmt, was in der Zukunft liegt', () => {
    const plan = planeImport([z(430418939, '2026-09-06', '2026-09-11')], new Set(), appIds, personIdOf, '2026-08-22')
    expect(plan.neu).toEqual([
      {
        ref: 430418939, personId: uuid5('person:430418939'),
        von: '2026-09-06', bis: '2026-09-11', herkunft: 'abwesend',
      },
    ])
  })

  it('lässt Vergangenes draußen — die Grenze ist das Bis-Datum', () => {
    /*
     * Nicht das Von-Datum: Wer seit dem 10. weg ist und am 30. zurückkommt, ist
     * heute abwesend. Genau dieser laufende Zeitraum ist der wichtigste.
     */
    const laufend = z(430418939, '2026-08-10', '2026-08-30')
    const vorbei = z(430418939, '2026-08-01', '2026-08-05')
    const plan = planeImport([laufend, vorbei], new Set(), appIds, personIdOf, '2026-08-22')
    expect(plan.neu.map((e) => e.von)).toEqual(['2026-08-10'])
    expect(plan.vergangen).toBe(1)
  })

  it('überspringt, was schon gespeichert ist — auch von Hand Erfasstes', () => {
    const vorhanden = new Set([abwSchluessel(uuid5('person:430418939'), '2026-09-06', '2026-09-11')])
    const plan = planeImport([z(430418939, '2026-09-06', '2026-09-11')], vorhanden, appIds, personIdOf, '2026-08-22')
    expect(plan.neu).toEqual([])
    expect(plan.doppelt).toBe(1)
  })

  it('fügt denselben Zeitraum auch innerhalb eines Laufs nur einmal ein', () => {
    /*
     * Es gibt sie wirklich doppelt: Im Livebestand stand jemand mit zwei IDs und
     * demselben Zeitstempel auf `10.–30.08.`. Mit --auch-unverfuegbar treffen
     * sich zusätzlich zwei Quellen. Gezählt wird das als `verschmolzen`, nicht
     * als `doppelt` — `doppelt` meint „steht schon in der App".
     */
    const plan = planeImport(
      [z(430418939, '2026-09-06', '2026-09-11'), z(430418939, '2026-09-06', '2026-09-11', 'nicht verfügbar')],
      new Set(), appIds, personIdOf, '2026-08-22',
    )
    expect(plan.neu).toHaveLength(1)
    expect(plan.verschmolzen).toBe(1)
    expect(plan.doppelt).toBe(0)
  })

  it('fasst je Person zusammen — und hält verschiedene Personen auseinander', () => {
    const plan = planeImport(
      [
        z(430418939, '2026-09-06', '2026-09-11'),
        z(430418939, '2026-09-06', '2026-09-12'), // verlängert
        z(430648141, '2026-09-06', '2026-09-11'), // andere Person, bleibt eigen
      ],
      new Set(), appIds, personIdOf, '2026-08-22',
    )
    expect(plan.neu).toHaveLength(2)
    expect(plan.verschmolzen).toBe(1)
    expect(plan.neu.find((e) => e.personId === uuid5('person:430418939'))?.bis).toBe('2026-09-12')
  })

  it('gruppiert nach der App-Person, nicht nach der NWS-Referenz', () => {
    /*
     * Dieselbe Person kommt je nach Quelltabelle als volle ID oder als
     * „<cid>-<mid>". Nach der rohen Referenz gruppiert, lägen ihre Zeiträume in
     * zwei Töpfen — und überlappten sich fröhlich weiter.
     */
    const plan = planeImport(
      [
        { ref: 430418939, von: '2026-09-06', bis: '2026-09-11', herkunft: 'abwesend' },
        { ref: '307-471-430-418939', von: '2026-09-10', bis: '2026-09-14', herkunft: 'nicht verfügbar' },
      ],
      new Set(), appIds, personIdOf, '2026-08-22',
    )
    expect(plan.neu).toHaveLength(1)
    expect(plan.neu[0]).toMatchObject({ von: '2026-09-06', bis: '2026-09-14' })
  })

  it('fasst zusammen, BEVOR es Vergangenes wegwirft', () => {
    /*
     * Ein abgelaufener Zeitraum kann einen laufenden verlängern. Erst filtern
     * hieße, den Beginn der Abwesenheit zu verlieren — und die Zeile stünde mit
     * falschem Von-Datum in der App.
     */
    const plan = planeImport(
      [z(430418939, '2026-08-01', '2026-08-05'), z(430418939, '2026-08-06', '2026-08-30')],
      new Set(), appIds, personIdOf, '2026-08-22',
    )
    expect(plan.neu).toHaveLength(1)
    expect(plan.neu[0]).toMatchObject({ von: '2026-08-01', bis: '2026-08-30' })
    expect(plan.vergangen).toBe(0)
  })

  it('meldet Personen, die es in der App nicht gibt, statt sie zu raten', () => {
    const plan = planeImport(
      [z(430999999, '2026-09-06', '2026-09-11')],
      new Set(), appIds, personIdOf, '2026-08-22',
    )
    expect(plan.neu).toEqual([])
    expect(plan.ohnePerson).toBe(1)
    expect(plan.fehlende).toEqual([430999999])
  })

  it('kennt eine NWS-Person, die in der App fehlt, ebenfalls als „ohne Person"', () => {
    // Auflösbar (steht in Persons_7.5.json), aber nicht importiert: derselbe
    // Ausgang, sonst schriebe der Import ins Leere.
    const nurAnna = new Set([uuid5('person:430418939')])
    const plan = planeImport([z(430648141, '2026-09-06', '2026-09-11')], new Set(), nurAnna, personIdOf, '2026-08-22')
    expect(plan.neu).toEqual([])
    expect(plan.ohnePerson).toBe(1)
  })
})

describe('nameAufloeser', () => {
  it('nennt den Anzeigenamen zu jeder Referenz-Form', () => {
    const nameOf = nameAufloeser(PERSONEN)
    expect(nameOf(430648141)).toBe('Bernd Beispiel')
    expect(nameOf('307-471-430-648141')).toBe('Bernd Beispiel')
    expect(nameOf(1)).toBeNull()
  })
})

describe('heuteISO', () => {
  it('nimmt den lokalen Kalendertag, nicht UTC', () => {
    /*
     * Um 01:00 MESZ ist es in UTC noch der Vortag. Ein UTC-Datum verschöbe die
     * Grenze „ab wann" um einen Tag — und ließe eine heute endende Abwesenheit
     * herausfallen.
     */
    expect(heuteISO(new Date(2026, 7, 22, 1, 0, 0))).toBe('2026-08-22')
    expect(heuteISO(new Date(2026, 0, 5, 23, 30, 0))).toBe('2026-01-05')
  })
})
