import { describe, expect, it } from 'vitest'
import { ministryNames } from '../../supabase/functions/import-week/parse.ts'
import { istSchuelerteil, syncAuxSlots } from './aux-class'
import { emptyQualifications } from './helpers'
import { alleS89DerWoche, autoAssignMeeting } from './planning'
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
  id, fn: id, ln: 'Test', role: 'verkuendiger', tel: '', mail: '', priv: emptyQualifications(), ...o,
})

const PERSONEN: Person[] = [
  person('schwester1', { female: true, priv: { ...emptyQualifications(), schulung: true } }),
  person('schwester2', { female: true, priv: { ...emptyQualifications(), schulung: true } }),
  // Keine Schulungsaufgaben: Mit dem Schüler-Platz kam er für die Besprechung
  // gar nicht infrage.
  person('aeltester', { role: 'aeltester', priv: { ...emptyQualifications(), vortrag: true } }),
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

  it('die Auto-Zuteilung nimmt einen Bruder für Vorträge, keine Schwester', () => {
    const { weeks } = autoAssignMeeting([woche(GESPRAECH(), BESPRECHUNG())], 0, 'mid', PERSONEN, [])
    const [gespraech, besprechung] = teile(weeks[0]!)
    expect(besprechung!.names.map((n) => n.pid)).toEqual(['aeltester'])
    // Die Schwestern bleiben dem Schülerteil.
    expect(gespraech!.names.map((n) => n.pid).sort()).toEqual(['schwester1', 'schwester2'])
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

describe('Gespielte Szene — ein Schülerteil für Brüder und Schwestern', () => {
  it('die Auto-Zuteilung gibt sie einer Schülerin mit ihrer Partnerin', () => {
    // Als männliche Ansprache blieb der Platz hier offen: Die Schwestern waren
    // ausgeschlossen, und der Älteste hat keine Schulungsaufgaben.
    const { weeks } = autoAssignMeeting([woche(SZENE())], 0, 'mid', PERSONEN, [])
    expect(teile(weeks[0]!)[0]!.names.map((n) => n.pid).sort()).toEqual(['schwester1', 'schwester2'])
  })
})
