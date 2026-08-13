import { describe, expect, it } from 'vitest'
import { neueItemId } from './helpers'
import { lacAdd, lacRemove } from './meeting-edit'
import { deriveMyTasks, itemTaskKey, partTaskKey, slotTaskKey } from './planning'
import { migrateItemIds } from '../lib/data'
import type { ConfirmationMap, Meeting, PartItem, Person, Week } from './types'
import { emptyQualifications } from './helpers'

/**
 * T37 — die Bestätigung hängt am Programmpunkt, nicht an seiner Position.
 *
 * Der Schlüssel lautete `"2026-09-07|mid|part|2|1|0"`: Woche, Zusammenkunft, Abschnitt,
 * **laufende Nummer im Abschnitt**, Platz. Das ist die Ursache einer ganzen
 * Reihe von Problemen — allen voran **T16**: ein eingefügter oder gelöschter
 * LAC-Punkt verschiebt alle folgenden, und die Bestätigungen blieben an der
 * alten Zahl kleben. Der nachfolgende Punkt erbte eine fremde Bestätigung,
 * während der eigentliche wieder als offen galt und erneut erinnert wurde.
 * Dagegen musste eigens eine Umbenennungs-Mechanik gebaut werden.
 *
 * Mit `PartItem.iid` lautet der Schlüssel `"2026-09-07|mid|part|k3f9x|0"`. Abschnitt und
 * laufende Nummer sind weg — und damit auch das Problem.
 */

const ZEITEN = 'Di 19:00 · So 10:00'

const person: Person = {
  id: 'p1', fn: 'Anna', ln: 'Beispiel', dn: 'A. Beispiel',
  role: 'verkuendiger', tel: '', mail: '', priv: emptyQualifications(),
}

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
          { num: 6, title: 'Punkt A', meta: '15 Min.', mins: 15, names: [{ name: 'A. Beispiel', pid: 'p1', bereichsKey: 'studium' }] },
          {
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

describe('Der Schlüssel folgt dem Punkt', () => {
  it('mit Kennung fünf Felder, ohne Kennung sechs', () => {
    // An der Länge unterscheidet die Lade-Migration, was sie schon umgestellt hat.
    expect(itemTaskKey('2026-09-07', 'mid', 'k3f9x', 0).split('|')).toHaveLength(5)
    expect(partTaskKey('2026-09-07', 'mid', 2, 1, 0).split('|')).toHaveLength(6)
  })

  it('slotTaskKey nimmt die Kennung, sonst die Position', () => {
    const ohne: PartItem = { title: 'X', names: [] }
    const mit: PartItem = { iid: 'k3f9x', title: 'X', names: [] }
    expect(slotTaskKey(ohne, '2026-09-07', 'mid', 2, 1, 0)).toBe('2026-09-07|mid|part|2|1|0')
    expect(slotTaskKey(mit, '2026-09-07', 'mid', 2, 1, 0)).toBe('2026-09-07|mid|part|k3f9x|0')
  })

  it('die Zusätzliche Klasse bekommt einen eigenen Schlüssel', () => {
    const mit: PartItem = { iid: 'k3f9x', title: 'X', names: [] }
    expect(slotTaskKey(mit, '2026-09-07', 'mid', 2, 1, 0, true)).toBe('2026-09-07|mid|aux|k3f9x|0')
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
})

describe('Lade-Migration: Kennungen nachtragen', () => {
  it('trägt jedem Punkt eine Kennung nach', () => {
    const { weeks } = migrateItemIds([makeWeek()], {})
    const ids = lacItems(weeks[0]).map((i) => i.iid)
    expect(ids.every(Boolean)).toBe(true)
    expect(new Set(ids).size).toBe(2) // verschieden
  })

  it('benennt bestehende Bestätigungen mit um', () => {
    const conf: ConfirmationMap = {
      '2026-09-07|mid|part|0|0|0': 'bestätigt',
      '2026-09-07|mid|part|0|1|1': 'verhindert',
    }
    const res = migrateItemIds([makeWeek()], conf)
    const [a, b] = lacItems(res.weeks[0])
    expect(res.confirmations).toEqual({
      [itemTaskKey('2026-09-07', 'mid', a.iid!, 0)]: 'bestätigt',
      [itemTaskKey('2026-09-07', 'mid', b.iid!, 1)]: 'verhindert',
    })
    expect(res.renames).toHaveLength(2)
    // Die Eingabe bleibt unangetastet — der Aufrufer braucht sie zum Vergleich.
    expect(conf['2026-09-07|mid|part|0|0|0']).toBe('bestätigt')
  })

  it('ist idempotent — beim zweiten Laden gibt es nichts zu tun', () => {
    const erst = migrateItemIds([makeWeek()], { '2026-09-07|mid|part|0|0|0': 'bestätigt' })
    const zweit = migrateItemIds(erst.weeks, erst.confirmations)
    expect(zweit.renames).toEqual([])
    expect(zweit.weeks).toBe(erst.weeks) // gleiche Referenz: nichts geändert
    expect(zweit.confirmations).toBe(erst.confirmations)
  })

  it('eine Woche ohne Programm bleibt unangetastet', () => {
    // Bis T66 war das der Platzhalter-Fall: Wochen außerhalb des Ladefensters
    // standen leer im Array, damit der Index die Datenbank-Position blieb, und
    // durften keine Kennungen aus dem Nichts bekommen. Die Platzhalter sind
    // weg — eine leere Zusammenkunft bleibt trotzdem eine leere.
    const leer: Week = { range: '', book: '', start: '2026-09-07', current: false, mid: { date: '', end: '', sections: [], helpers: {} }, we: { date: '', end: '', sections: [], helpers: {} } }
    const weeks = [leer]
    expect(migrateItemIds(weeks, {}).weeks).toBe(weeks)
  })

  it('eine Bestätigung ohne passenden Punkt bleibt liegen', () => {
    // Altlast eines gelöschten Slots — sie zu verwerfen wäre Datenverlust,
    // sie umzubenennen unmöglich.
    const conf: ConfirmationMap = { '2026-09-07|mid|part|9|9|9': 'bestätigt' }
    const res = migrateItemIds([makeWeek()], conf)
    expect(res.confirmations['2026-09-07|mid|part|9|9|9']).toBe('bestätigt')
  })
})

describe('Der eigentliche Gewinn: Einfügen verschiebt nichts mehr', () => {
  /** Woche mit Kennungen und einer Bestätigung am Bibelstudium. */
  function vorbereitet() {
    const conf: ConfirmationMap = { '2026-09-07|mid|part|0|1|0': 'bestätigt' } // Leiter des VBS
    const res = migrateItemIds([makeWeek()], conf)
    return { weeks: res.weeks, conf: res.confirmations }
  }

  it('nach dem Einfügen gehört die Bestätigung noch demselben Punkt', () => {
    // Vorher: der neue Punkt landet auf Position 1, das Bibelstudium rutscht
    // auf 2 — und `"2026-09-07|mid|part|0|1|0"` zeigte plötzlich auf den neuen Punkt.
    const { weeks, conf } = vorbereitet()
    const vbsId = lacItems(weeks[0])[1].iid!
    const schluessel = itemTaskKey('2026-09-07', 'mid', vbsId, 0)
    expect(conf[schluessel]).toBe('bestätigt')

    const nachher = lacAdd(weeks, 0, 'mid', 0, 'Örtliche Hinweise')
    const items = lacItems(nachher[0])
    expect(items.map((i) => i.title)).toEqual([
      'Punkt A',
      'Örtliche Hinweise',
      'Versammlungsbibelstudium',
    ])
    // Das Bibelstudium steht jetzt an Position 2 — sein Schlüssel ist derselbe.
    expect(items[2].iid).toBe(vbsId)
    expect(slotTaskKey(items[2], '2026-09-07', 'mid', 0, 2, 0)).toBe(schluessel)
    expect(conf[schluessel]).toBe('bestätigt')
  })

  it('der neue Punkt bringt seine eigene Kennung mit', () => {
    const { weeks } = vorbereitet()
    const nachher = lacAdd(weeks, 0, 'mid', 0, 'Örtliche Hinweise')
    const neu = lacItems(nachher[0])[1]
    expect(neu.iid).toBeTruthy()
    expect(neu.iid).not.toBe(lacItems(weeks[0])[0].iid)
  })

  it('nach dem Löschen ebenso', () => {
    const { weeks, conf } = vorbereitet()
    const vbsId = lacItems(weeks[0])[1].iid!
    const nachher = lacRemove(weeks, 0, 'mid', 0, 0) // Punkt A entfernen
    const items = lacItems(nachher[0])
    expect(items).toHaveLength(1)
    expect(items[0].iid).toBe(vbsId)
    expect(conf[slotTaskKey(items[0], '2026-09-07', 'mid', 0, 0, 0)]).toBe('bestätigt')
  })

  it('die abgeleitete Aufgabe trägt denselben Schlüssel', () => {
    // Damit hängt auch der angezeigte Status am Punkt, nicht an der Position.
    const { weeks, conf } = vorbereitet()
    const nachher = lacAdd(weeks, 0, 'mid', 0, 'Örtliche Hinweise')
    const tasks = deriveMyTasks(nachher, [], 'B. Zweiter', conf, ZEITEN, 'p2')
    expect(tasks).toHaveLength(1)
    expect(tasks[0].status).toBe('bestätigt')
  })

  it('Gegenprobe am reinen Positions-Schlüssel: er zeigt danach auf den falschen Punkt', () => {
    // Genau das war T16 — der Test hält fest, wogegen die Kennung hilft.
    // Gerechnet wird hier ausdrücklich mit `partTaskKey`, also so, wie es vor
    // T37 überall lief.
    const conf: ConfirmationMap = { [partTaskKey('2026-09-07', 'mid', 0, 1, 0)]: 'bestätigt' }
    const nachher = lacAdd([makeWeek()], 0, 'mid', 0, 'Örtliche Hinweise')
    const items = lacItems(nachher[0])

    // Position 1 ist jetzt der NEUE Punkt — und der Schlüssel zeigt auf ihn.
    expect(items[1].title).toBe('Örtliche Hinweise')
    expect(conf[partTaskKey('2026-09-07', 'mid', 0, 1, 0)]).toBe('bestätigt')
    // Das Bibelstudium ist auf 2 gerutscht und steht ohne Bestätigung da.
    expect(items[2].title).toBe('Versammlungsbibelstudium')
    expect(conf[partTaskKey('2026-09-07', 'mid', 0, 2, 0)]).toBeUndefined()

    // Mit Kennung passiert genau das nicht: der Schlüssel wandert mit.
    const { conf: mitConf, weeks: mitWeeks } = vorbereitet()
    const vbsId = lacItems(mitWeeks[0])[1].iid!
    const danach = lacAdd(mitWeeks, 0, 'mid', 0, 'Örtliche Hinweise')
    const vbs = lacItems(danach[0])[2]
    expect(vbs.title).toBe('Versammlungsbibelstudium')
    expect(mitConf[itemTaskKey('2026-09-07', 'mid', vbsId, 0)]).toBe('bestätigt')
    expect(person.id).toBe('p1') // Fixture-Bezug, damit der Vergleich vollständig ist
  })
})
