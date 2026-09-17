import { describe, expect, it } from 'vitest'
import { emptyQualifications, neueItemId } from './helpers'
import { lacAdd, lacRemove } from './meeting-edit'
import { deriveMyTasks, itemTaskKey } from './planning'
import type { ConfirmationMap, Meeting, PartItem, Person, Week } from './types'

/**
 * T37 — die Bestätigung hängt am Programmpunkt, nicht an seiner Position.
 *
 * Der Schlüssel lautete `"2026-09-07|mid|part|2|1|0"`: Woche, Zusammenkunft,
 * Abschnitt, **laufende Nummer im Abschnitt**, Platz. Das ist die Ursache einer
 * ganzen Reihe von Problemen — allen voran **T16**: ein eingefügter oder
 * gelöschter LAC-Punkt verschiebt alle folgenden, und die Bestätigungen blieben
 * an der alten Zahl kleben. Der nachfolgende Punkt erbte eine fremde
 * Bestätigung, während der eigentliche wieder als offen galt und erneut
 * erinnert wurde.
 *
 * Mit `PartItem.iid` lautet der Schlüssel `"2026-09-07|mid|part|k3f9x|0"`.
 * Abschnitt und laufende Nummer sind weg — und damit auch das Problem.
 *
 * **Seit dem 17. September 2026 ist das die einzige Form.** Die Kennung ist
 * Pflichtfeld: Der Import vergibt sie (`parse.ts`), das Einfügen von Hand
 * ebenso (`meeting-edit.ts`). Damit fiel die Lade-Migration weg, die sie
 * nachtrug, und mit ihr das Zurückschreiben beim Laden und die ganze
 * Umbenennungs-Mechanik. Was hier steht, ist der Beleg dafür, dass keine davon
 * fehlt.
 */

const ZEITEN = 'Di 19:00 · So 10:00'

const person: Person = {
  id: 'p1', fn: 'Anna', ln: 'Beispiel', dn: 'A. Beispiel',
  role: 'verkuendiger', tel: '', mail: '', priv: emptyQualifications(),
}

const PUNKT_A = 'a1b2c3'
const VBS = 'd4e5f6'

/** LAC-Abschnitt mit zwei Punkten; der zweite ist das Bibelstudium. */
function makeWeek(): Week {
  const mid: Meeting = {
    date: '7.–13. September',
    end: 'Ende ca. 20:45',
    sections: [
      {
        label: 'UNSER LEBEN ALS CHRIST',
        farbe: 'wein',
        items: [
          { iid: PUNKT_A, num: 6, title: 'Punkt A', meta: '15 Min.', mins: 15, names: [{ name: 'A. Beispiel', pid: 'p1', bereichsKey: 'studium' }] },
          {
            iid: VBS,
            num: 7,
            title: 'Versammlungsbibelstudium',
            meta: '30 Min.',
            mins: 30,
            names: [
              { name: 'B. Zweiter', pid: 'p2', rolle: 'Leiter', bereichsKey: 'studium' },
              { name: 'A. Beispiel', pid: 'p1', rolle: 'Leser', bereichsKey: 'leser' },
            ],
          },
        ],
      },
    ],
    helpers: {},
  }
  const we: Meeting = { date: '', end: '', sections: [], helpers: {} }
  return { range: '7.–13. September', book: '', start: '2026-09-07', current: false, mid, we }
}

const lacItems = (w: Week) => w.mid.sections[0].items as PartItem[]

/** Woche samt einer Bestätigung am Leiter des Bibelstudiums. */
function vorbereitet(): { weeks: Week[]; conf: ConfirmationMap } {
  return {
    weeks: [makeWeek()],
    conf: { [itemTaskKey('2026-09-07', 'mid', VBS, 0)]: 'bestätigt' },
  }
}

describe('Der Schlüssel hat nur eine Form', () => {
  it('fünf Felder: Woche, Zusammenkunft, Raum, Kennung, Platz', () => {
    expect(itemTaskKey('2026-09-07', 'mid', 'k3f9x', 0)).toBe('2026-09-07|mid|part|k3f9x|0')
    expect(itemTaskKey('2026-09-07', 'mid', 'k3f9x', 0).split('|')).toHaveLength(5)
  })

  it('die Zusätzliche Klasse bekommt einen eigenen Schlüssel', () => {
    expect(itemTaskKey('2026-09-07', 'mid', 'k3f9x', 0, true)).toBe('2026-09-07|mid|aux|k3f9x|0')
  })

  it('Kennungen enthalten kein Trennzeichen', () => {
    // Der Schlüssel wird an `|` zerlegt — eine Kennung mit Trennzeichen darin
    // ergäbe stillschweigend einen anderen Slot.
    for (let i = 0; i < 200; i++) {
      const id = neueItemId()
      expect(id).not.toContain('|')
      expect(id.length).toBeGreaterThan(0)
    }
  })

  it('zwei Kennungen hintereinander sind verschieden', () => {
    const ids = new Set(Array.from({ length: 500 }, () => neueItemId()))
    expect(ids.size).toBe(500)
  })
})

describe('Der eigentliche Gewinn: Einfügen verschiebt nichts mehr', () => {
  it('nach dem Einfügen gehört die Bestätigung noch demselben Punkt', () => {
    // Vorher: der neue Punkt landet auf Position 1, das Bibelstudium rutscht
    // auf 2 — und `"2026-09-07|mid|part|0|1|0"` zeigte plötzlich auf den neuen.
    const { weeks, conf } = vorbereitet()
    const schluessel = itemTaskKey('2026-09-07', 'mid', VBS, 0)

    const nachher = lacAdd(weeks, 0, 'mid', 0, 'Örtliche Hinweise')
    const items = lacItems(nachher[0])
    expect(items.map((i) => i.title)).toEqual([
      'Punkt A',
      'Örtliche Hinweise',
      'Versammlungsbibelstudium',
    ])
    // Das Bibelstudium steht jetzt an Position 2 — sein Schlüssel ist derselbe.
    expect(items[2].iid).toBe(VBS)
    expect(conf[schluessel]).toBe('bestätigt')
  })

  it('der neue Punkt bringt seine eigene Kennung mit', () => {
    const nachher = lacAdd([makeWeek()], 0, 'mid', 0, 'Örtliche Hinweise')
    const ids = lacItems(nachher[0]).map((i) => i.iid)
    expect(ids[1]).toBeTruthy()
    expect(new Set(ids).size).toBe(3) // alle drei verschieden
  })

  it('nach dem Löschen ebenso', () => {
    const { weeks, conf } = vorbereitet()
    const nachher = lacRemove(weeks, 0, 'mid', 0, 0) // Punkt A entfernen
    const items = lacItems(nachher[0])
    expect(items).toHaveLength(1)
    expect(items[0].iid).toBe(VBS)
    expect(conf[itemTaskKey('2026-09-07', 'mid', VBS, 0)]).toBe('bestätigt')
  })

  it('die abgeleitete Aufgabe trägt denselben Schlüssel', () => {
    // Damit hängt auch der angezeigte Status am Punkt, nicht an der Position.
    const { weeks, conf } = vorbereitet()
    const nachher = lacAdd(weeks, 0, 'mid', 0, 'Örtliche Hinweise')
    const tasks = deriveMyTasks(nachher, [], 'B. Zweiter', conf, ZEITEN, 'p2')
    expect(tasks).toHaveLength(1)
    expect(tasks[0].status).toBe('bestätigt')
    expect(person.id).toBe('p1') // Fixture-Bezug, damit der Vergleich vollständig ist
  })

  it('Gegenprobe: mit der alten Positionsrechnung zeigte der Schlüssel auf den falschen Punkt', () => {
    // Genau das war T16. Der Schlüssel wird hier von Hand gebildet, so wie ihn
    // `partTaskKey` einmal gebildet hat — die Funktion selbst gibt es nicht mehr.
    const posKey = (si: number, ii: number, ni: number) => `2026-09-07|mid|part|${si}|${ii}|${ni}`
    const conf: ConfirmationMap = { [posKey(0, 1, 0)]: 'bestätigt' } // war das Bibelstudium
    const items = lacItems(lacAdd([makeWeek()], 0, 'mid', 0, 'Örtliche Hinweise')[0])

    // Position 1 ist jetzt der NEUE Punkt — und der Schlüssel zeigte auf ihn.
    expect(items[1].title).toBe('Örtliche Hinweise')
    expect(conf[posKey(0, 1, 0)]).toBe('bestätigt')
    // Das Bibelstudium wäre auf 2 gerutscht und stünde ohne Bestätigung da.
    expect(items[2].title).toBe('Versammlungsbibelstudium')
    expect(conf[posKey(0, 2, 0)]).toBeUndefined()
    // Mit der Kennung passiert genau das nicht.
    expect(items[2].iid).toBe(VBS)
  })
})
