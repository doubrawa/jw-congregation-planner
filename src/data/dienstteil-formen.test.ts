import { describe, expect, it } from 'vitest'
import { ministryNames } from '../../supabase/functions/import-week/parse.ts'
import { istSchuelerteil, syncAuxSlots } from './aux-class'
import { emptyQualifications } from './helpers'
import { KEINE_ABWESENHEIT } from './absence'
import { alleS89DerWoche, autoAssignMeeting, rangfolgeFuer } from './planning'
import type { PartItem, Person, Week } from './types'
import { STANDARD_ZEITEN } from './vorgaben'

/**
 * **Die Form eines Punkts unter „Uns im Dienst verbessern" — in der App.**
 *
 * Der Import liest die Form am Beschreiber der Zeitzeile (`ministryNames` in
 * `parse.ts`) und legt danach die Plätze an: Eine Besprechung bekommt den Platz
 * eines Bruders, eine gespielte Szene Schüler und Partner (S-38-X 8/26, Abs. 6,
 * 9 und 11). Was daraus folgt, entscheidet sich aber hier — alles, was einen
 * Schülerteil ausmacht, liest den Bereich und die Geschlechtsregel des Platzes.
 * Diese Probe hält die Folgen fest, die vorher falsch waren, gebaut aus dem, was
 * der Import wirklich liefert, nicht aus einer Abschrift.
 */

const person = (id: string, o: Partial<Person>): Person => ({
  id, fn: id, ln: 'Test', role: 'verkuendiger', priv: emptyQualifications(), ...o,
})

const PERSONEN: Person[] = [
  person('schwester1', { female: true, priv: { ...emptyQualifications(), schulung: true } }),
  person('schwester2', { female: true, priv: { ...emptyQualifications(), schulung: true } }),
  // Keine Schulungsaufgaben: Mit dem Schüler-Platz kam er für die Besprechung
  // gar nicht infrage.
  person('aeltester', { role: 'aeltester', priv: { ...emptyQualifications(), besprechung: true } }),
  // Hält den Vortrag unter „Schätze aus Gottes Wort", leitet aber keine
  // Besprechung — seit dem 4.10.2026 zwei Bereiche (Betreiber).
  person('nurVortrag', { role: 'aeltester', priv: { ...emptyQualifications(), vortrag: true } }),
]

const punkt = (iid: string, num: number, title: string, meta: string): PartItem => ({
  iid, num, title, meta, names: ministryNames(title, meta),
})

const GESPRAECH = () => punkt('g4', 4, 'Gespräche beginnen', 'VON HAUS ZU HAUS · 3 Min. · lmd Lektion 5 Punkt 5')
const BESPRECHUNG = () => punkt('b6', 6, 'Was würdest du sagen?', 'Besprechung · 6 Min.')
const SZENE = () => punkt('s7', 7, 'Unsere Glaubensansichten erklären', 'Gespielte Szene · 3 Min. · th Lektion 17')

const woche = (...punkte: PartItem[]): Week => ({
  range: '1.–7. Juli',
  book: 'Musterbuch',
  start: '2026-06-29',
  mid: {
    date: '1.–7. Juli',
    end: '',
    helpers: {},
    sections: [{ label: 'UNS IM DIENST VERBESSERN', kind: 'dienst', farbe: 'gold', items: punkte }],
  },
  we: { date: '', end: '', helpers: {}, sections: [] },
})

const teile = (w: Week): PartItem[] => w.mid.sections[0]!.items as PartItem[]

describe('Besprechung unter „Uns im Dienst verbessern" — kein Schülerteil', () => {
  it('wird in der Zusätzlichen Klasse nicht wiederholt', () => {
    const [gespraech, besprechung] = teile(woche(GESPRAECH(), BESPRECHUNG()))
    expect(istSchuelerteil(besprechung!)).toBe(false)
    // Die Klasse kehrt nach der letzten Schulungsaufgabe zurück (Abs. 27) —
    // die Besprechung danach findet im Hauptsaal statt.
    const [mitKlasse] = syncAuxSlots([woche(GESPRAECH(), BESPRECHUNG())], true)
    expect(teile(mitKlasse!)[1]!.aux).toBeUndefined()
    // Gegenprobe: Der Schülerteil davor bekommt seine zweite Reihe.
    expect(istSchuelerteil(gespraech!)).toBe(true)
    expect(teile(mitKlasse!)[0]!.aux).toHaveLength(2)
  })

  it('die Auto-Zuteilung nimmt einen Bruder, der Besprechungen leitet — keine Schwester', () => {
    const { weeks } = autoAssignMeeting([woche(GESPRAECH(), BESPRECHUNG())], 0, 'mid', PERSONEN, [])
    const [gespraech, besprechung] = teile(weeks[0]!)
    expect(besprechung!.names.map((n) => n.pid)).toEqual(['aeltester'])
    // Die Schwestern bleiben dem Schülerteil.
    expect(gespraech!.names.map((n) => n.pid).sort()).toEqual(['schwester1', 'schwester2'])
  })

  it('… und nicht den, der nur den Schätze-Vortrag hält', () => {
    // Gegenprobe zur Trennung: Ohne den Bruder mit `besprechung` bleibt der
    // Platz offen, statt auf `vortrag` zurückzufallen.
    const ohne = PERSONEN.filter((p) => p.id !== 'aeltester')
    const { weeks } = autoAssignMeeting([woche(BESPRECHUNG())], 0, 'mid', ohne, [])
    expect(teile(weeks[0]!)[0]!.names.map((n) => n.pid)).toEqual([undefined])
  })

  it('bekommt keinen S-89-Zettel', () => {
    // Beide Punkte besetzt, und zwar von Hand: Ein leerer Platz bekäme ohnehin
    // keinen Zettel — die Probe sagte dann nichts über den Bereich.
    const w = woche(GESPRAECH(), BESPRECHUNG())
    const [gespraech, besprechung] = teile(w)
    gespraech!.names = gespraech!.names.map((n, i) => ({ ...n, name: `Schwester ${i + 1}`, pid: `schwester${i + 1}` }))
    besprechung!.names = besprechung!.names.map((n) => ({ ...n, name: 'Ältester Test', pid: 'aeltester' }))
    const zettel = alleS89DerWoche([w], 0, STANDARD_ZEITEN)
    // Zwei Zettel für das Gespräch (Schülerin und Partnerin), keiner sonst.
    expect(zettel.map((z) => z.type)).toEqual([
      'Gespräche beginnen · VON HAUS ZU HAUS',
      'Gespräche beginnen · VON HAUS ZU HAUS',
    ])
  })
})

describe('Vortrag eines Schülers — eigener Bereich, aber Schülerteil wie jeder andere', () => {
  const VORTRAG = () => punkt('v5', 5, 'Unsere Glaubensansichten erklären', 'Vortrag · 4 Min. · th Lektion 7')
  const SCHUELER: Person[] = [
    ...PERSONEN,
    // Führt Gespräche, hält aber (noch) keine Vorträge.
    person('nurGespraech', { priv: { ...emptyQualifications(), schulung: true } }),
    person('redner', { priv: { ...emptyQualifications(), schulungVortrag: true } }),
  ]

  it('die Auto-Zuteilung nimmt den Bruder mit `schulungVortrag`, nicht jeden mit Schulungsaufgaben', () => {
    const { weeks } = autoAssignMeeting([woche(VORTRAG())], 0, 'mid', SCHUELER, [])
    expect(teile(weeks[0]!)[0]!.names.map((n) => n.pid)).toEqual(['redner'])
  })

  it('wird in der Zusätzlichen Klasse wiederholt und bekommt einen S-89-Zettel', () => {
    // Der eigene Bereich darf ihn nicht aus dem Schülerteil holen: Daran hängen
    // Klasse und Zettel (`istSchuelerBereich`).
    const w = woche(VORTRAG())
    expect(istSchuelerteil(teile(w)[0]!)).toBe(true)
    const [mitKlasse] = syncAuxSlots([woche(VORTRAG())], true)
    expect(teile(mitKlasse!)[0]!.aux).toEqual([{ name: '', bereichsKey: 'schulungVortrag', male: true }])
    teile(w)[0]!.names = [{ name: 'Redner Test', pid: 'redner', bereichsKey: 'schulungVortrag', male: true }]
    const zettel = alleS89DerWoche([w], 0, STANDARD_ZEITEN)
    expect(zettel).toHaveLength(1)
    expect(zettel[0]).toMatchObject({ name: 'Redner Test', partner: '' })
  })
})

/*
 * **Vortrag des Vorsitzenden** (Arbeitsheft ab Januar 2027, gemessen am
 * 16.10.2026): „Menschen zu Jüngern machen (2 Min.) Vortrag des Vorsitzenden."
 * Der Titel allein ergäbe Schüler und Partner — der Beschreiber sagt, wer
 * spricht.
 */
describe('Vortrag des Vorsitzenden — kein Schülerteil (ab 2027)', () => {
  const VORSITZ = () => punkt('m4', 4, 'Menschen zu Jüngern machen', 'Vortrag des Vorsitzenden · 2 Min.')
  const MIT_VORSITZ: Person[] = [
    ...PERSONEN,
    person('vorsitz', { role: 'aeltester', priv: { ...emptyQualifications(), vorsitzMid: true } }),
  ]

  it('ein Platz für den Vorsitzenden — kein Schüler, kein Partner', () => {
    expect(teile(woche(VORSITZ()))[0]!.names).toEqual([{ name: '', rolle: 'Vorsitz', bereichsKey: 'vorsitzMid' }])
  })

  it('wird in der Zusätzlichen Klasse nicht wiederholt und bekommt keinen S-89-Zettel', () => {
    const w = woche(GESPRAECH(), VORSITZ())
    expect(istSchuelerteil(teile(w)[1]!)).toBe(false)
    const [mitKlasse] = syncAuxSlots([woche(GESPRAECH(), VORSITZ())], true)
    expect(teile(mitKlasse!)[1]!.aux).toBeUndefined()
    teile(w)[1]!.names = [{ name: 'Vorsitz Test', pid: 'vorsitz', rolle: 'Vorsitz', bereichsKey: 'vorsitzMid' }]
    expect(alleS89DerWoche([w], 0, STANDARD_ZEITEN)).toEqual([])
  })

  /** Dieselbe Woche mit Eröffnung — dort steht der Vorsitz, dem der Vortrag folgt. */
  const mitEroeffnung = (w: Week): Week => ({
    ...w,
    mid: {
      ...w.mid,
      sections: [
        {
          label: 'ERÖFFNUNG',
          kind: 'eroeffnung',
          farbe: 'neutral',
          items: [
            {
              iid: 'e1', title: 'Lied 1 und Gebet · Einleitende Worte', meta: '1 Min.',
              names: [
                { name: '', rolle: 'Vorsitz', bereichsKey: 'vorsitzMid' },
                { name: '', rolle: 'Gebet', bereichsKey: 'gebet' },
              ],
            },
          ],
        },
        ...w.mid.sections,
      ],
    },
  })
  const pids = (w: Week, si: number) => (w.mid.sections[si]?.items[0] as PartItem | undefined)?.names.map((n) => n.pid) ?? []

  it('die Auto-Zuteilung gibt ihn dem Vorsitzenden der Zusammenkunft — keinem zweiten (16.10.2026)', () => {
    // Zwei können den Vorsitz: Die gemeinsame Sperrliste setzte sonst den
    // anderen auf den Vortrag, als hielte ein zweiter Vorsitzender ihn.
    const zwei = [...MIT_VORSITZ, person('vorsitz2', { role: 'aeltester', priv: { ...emptyQualifications(), vorsitzMid: true } })]
    const { weeks } = autoAssignMeeting([mitEroeffnung(woche(VORSITZ()))], 0, 'mid', zwei, [])
    const [vorsitz] = pids(weeks[0]!, 0)
    expect(vorsitz).toBeDefined()
    expect(pids(weeks[0]!, 1)).toEqual([vorsitz])
  })

  it('… auch wenn nur einer den Vorsitz kann — sonst blieb er offen', () => {
    const { weeks } = autoAssignMeeting([mitEroeffnung(woche(VORSITZ()))], 0, 'mid', MIT_VORSITZ, [])
    expect(pids(weeks[0]!, 0)[0]).toBe('vorsitz')
    expect(pids(weeks[0]!, 1)).toEqual(['vorsitz'])
  })

  it('das Zuteilen-Blatt schlägt dafür den Vorsitzenden vor — solange der Vorsitz leer ist, niemanden', () => {
    // Er folgt dem Vorsitz wie das Anfangsgebet. Bis zum 16.10.2026 schlug das
    // Blatt auch bei besetztem Vorsitz niemanden vor (`sonderplaetze.test.ts`).
    const w = mitEroeffnung(woche(VORSITZ()))
    const sel = { kind: 'part' as const, wi: 0, tab: 'mid' as const, si: 1, ii: 0, ni: 0, priv: 'vorsitzMid', groups: false, label: '' }
    expect(rangfolgeFuer([w], sel, MIT_VORSITZ, [], [], KEINE_ABWESENHEIT)).toEqual([])
    Object.assign((w.mid.sections[0]!.items[0] as PartItem).names[0]!, { name: 'vorsitz Test', pid: 'vorsitz' })
    expect(rangfolgeFuer([w], sel, MIT_VORSITZ, [], [], KEINE_ABWESENHEIT).map((p) => p.id)).toEqual(['vorsitz'])
  })

  it('nur der ganze Beschreiber zählt', () => {
    // Ein längerer Satz ist kein Beschreiber dieser Form — dann gilt der Titel.
    expect(ministryNames('Menschen zu Jüngern machen', 'Vortrag des Vorsitzenden der Woche · 2 Min.')).toHaveLength(2)
  })
})

describe('Gespielte Szene — ein Schülerteil für Brüder und Schwestern', () => {
  it('die Auto-Zuteilung gibt sie einer Schülerin mit ihrer Partnerin', () => {
    // Als männliche Ansprache blieb der Platz hier offen: Die Schwestern waren
    // ausgeschlossen, und der Älteste hat keine Schulungsaufgaben.
    const { weeks } = autoAssignMeeting([woche(SZENE())], 0, 'mid', PERSONEN, [])
    expect(teile(weeks[0]!)[0]!.names.map((n) => n.pid).sort()).toEqual(['schwester1', 'schwester2'])
  })
})
