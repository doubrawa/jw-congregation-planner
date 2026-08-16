import { describe, expect, it } from 'vitest'
import { emptyQualifications, lastFenster, loadWindow, wochenAbstand } from './helpers'
import type { Meeting, Person, Week } from './types'

/**
 * Wochen zählen, nicht Einträge (T36).
 *
 * `LOAD_RADIUS = 2` hieß „±2 **Einträge**". Solange die Wochen lückenlos
 * aufeinanderfolgen, ist das dasselbe. Fehlt eine — Kongresswoche, eine nie
 * importierte Woche —, rechnet die Fairness-Logik über einen anderen Zeitraum
 * als den, den das Sheet daneben behauptet („2 Aufgaben in 5 Wochen").
 *
 * Die Wochen hier stehen bewusst mit **Lücke**: Positionen 0,1,2 tragen die
 * Startdaten 1., 8. und **22.** Juni — zwischen den beiden letzten fehlt eine
 * Woche, genau wie nach einem Kongress.
 */

const PERSON: Person = {
  id: 'p1', fn: 'A', ln: 'B', dn: 'A. B.', role: 'verkuendiger',
  tel: '', mail: '', priv: emptyQualifications(),
}

function meeting(mitAufgabe: boolean): Meeting {
  return {
    date: '',
    end: '',
    sections: mitAufgabe
      ? [{ label: 'SCHÄTZE', farbe: 'petrol', items: [{ title: 'Punkt', names: [{ name: 'A. B.', pid: 'p1', bereichsKey: 'bibellesung' }] }] }]
      : [],
    helpers: {},
  }
}

function woche(start: string, mitAufgabe: boolean): Week {
  return { range: start, book: '', start, current: false, mid: meeting(mitAufgabe), we: meeting(false) }
}

describe('wochenAbstand', () => {
  it('misst in Wochen, wenn beide ein Startdatum haben', () => {
    expect(wochenAbstand(woche('2026-06-01', false), woche('2026-06-08', false), 0, 1)).toBe(1)
    // Zwei Einträge nebeneinander, aber zwei Wochen auseinander.
    expect(wochenAbstand(woche('2026-06-08', false), woche('2026-06-22', false), 1, 2)).toBe(2)
  })

  it('fällt ohne Startdatum auf den Indexabstand zurück', () => {
    // Demo-Daten und von Hand angelegte Wochen haben kein `start`. Die alte
    // Näherung ist dort besser als gar keine Ordnung.
    const ohne: Week = { range: '', book: '', start: '', current: false, mid: meeting(false), we: meeting(false) }
    expect(wochenAbstand(ohne, woche('2026-06-08', false), 0, 3)).toBe(3)
    expect(wochenAbstand(undefined, undefined, 2, 5)).toBe(3)
  })

  it('überbrückt den Jahreswechsel und die Sommerzeit', () => {
    expect(wochenAbstand(woche('2026-12-28', false), woche('2027-01-04', false), 0, 1)).toBe(1)
    // Ende März springt die Uhr — die Differenz ist dann keine glatte Woche
    // mehr in Millisekunden, gerundet aber sehr wohl.
    expect(wochenAbstand(woche('2026-03-23', false), woche('2026-03-30', false), 0, 1)).toBe(1)
  })
})

describe('loadWindow zählt Wochen, keine Einträge', () => {
  it('zeigt die fehlende Woche als Lücke', () => {
    // Fenster um den 22. Juni mit Radius 1: der 15. Juni existiert nicht, das
    // Quadrat davor muss leer bleiben. Vorher zeigte es den 8. Juni — eine
    // Aufgabe, die zwei Wochen zurückliegt, als „vorige Woche".
    const weeks = [woche('2026-06-01', false), woche('2026-06-08', true), woche('2026-06-22', false)]
    expect(loadWindow(weeks, PERSON, 2, undefined, 1)).toEqual(['void', 'none', 'void'])
  })

  it('bei lückenlosen Wochen unverändert', () => {
    const weeks = [woche('2026-06-01', false), woche('2026-06-08', true), woche('2026-06-15', false)]
    expect(loadWindow(weeks, PERSON, 1, undefined, 1)).toEqual(['none', 'task', 'none'])
  })
})

/*
 * Die Zahl unter dem Namen („2 Aufgaben in 5 Wochen") und die Quadrate daneben
 * beschreiben dasselbe Fenster — sie wurden aber verschieden gerechnet: die
 * Quadrate nach Datum, die Zahl und die Auto-Zuteilung mit `slice` nach
 * Position. Bei lückenlosen Wochen ist das dasselbe; fehlt eine, las der
 * Planer eine Zahl, nach der nicht sortiert worden war — genau der Fehler, den
 * T36 an den Quadraten schon behoben hatte.
 */
describe('lastFenster: das Fenster, das die Quadrate zeigen', () => {
  const mitLuecke = [
    woche('2026-06-01', false),
    woche('2026-06-08', true),
    woche('2026-06-22', false), // der 15. Juni fehlt
    woche('2026-06-29', false),
  ]

  it('überspringt die fehlende Woche, statt eine ältere hereinzuholen', () => {
    // Fenster um den 22. Juni: 15. Juni gibt es nicht, also bleiben 22. und 29.
    // Nach Position hätte es den 8. Juni mitgezählt — zwei Wochen entfernt.
    expect(lastFenster(mitLuecke, 2, 1).map((w) => w.start)).toEqual(['2026-06-22', '2026-06-29'])
  })

  it('deckt sich mit den Quadraten daneben', () => {
    // Dieselbe Auskunft in zwei Formen: `loadWindow` malt 'void' für jede
    // Woche, die es nicht gibt — `lastFenster` lässt genau diese weg.
    for (const wi of mitLuecke.keys()) {
      const quadrate = loadWindow(mitLuecke, PERSON, wi, undefined, 1)
      expect(lastFenster(mitLuecke, wi, 1), `Woche ${wi}`).toHaveLength(
        quadrate.filter((q) => q !== 'void').length,
      )
    }
  })

  it('bei lückenlosen Wochen bleibt es beim vollen Fenster', () => {
    const dicht = [woche('2026-06-01', false), woche('2026-06-08', true), woche('2026-06-15', false)]
    expect(lastFenster(dicht, 1, 1).map((w) => w.start)).toEqual([
      '2026-06-01', '2026-06-08', '2026-06-15',
    ])
  })
})

/*
 * Hier stand bis T81 die Serie („3 Wochen in Folge"), deren Lauf über
 * `wochenAbstand` bei einer fehlenden Woche brechen musste. Die Meldung ist
 * gestrichen; was `wochenAbstand` heute noch trägt — das Ladefenster und die
 * Quadrate des Personen-Sheets — steht oben und bleibt geprüft.
 */
