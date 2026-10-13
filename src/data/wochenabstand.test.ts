import { describe, expect, it } from 'vitest'
import { emptyQualifications } from './helpers'
import { lastFenster, wochenAbstand, workloadOf } from './auslastung'
import type { Meeting, Person, Week } from './types'

/**
 * Wochen zählen, nicht Einträge (T36).
 *
 * `LOAD_RADIUS = 2` hieß „±2 **Einträge**". Solange die Wochen lückenlos
 * aufeinanderfolgen, ist das dasselbe. Fehlt eine — Kongresswoche, eine nie
 * importierte Woche —, rechnet die Fairness-Logik über einen anderen Zeitraum
 * als den, den das Sheet daneben behauptet („Aufgaben in 5 Wochen: 2").
 *
 * Die Wochen hier stehen bewusst mit **Lücke**: Positionen 0,1,2 tragen die
 * Startdaten 1., 8. und **22.** Juni — zwischen den beiden letzten fehlt eine
 * Woche, genau wie nach einem Kongress.
 */

const PERSON: Person = {
  id: 'p1', fn: 'A.', ln: 'B.', role: 'verkuendiger',
  tel: '', mail: '', priv: emptyQualifications(),
}

function meeting(mitAufgabe: boolean): Meeting {
  return {
    date: '',
    end: '',
    sections: mitAufgabe
      ? [{ label: 'SCHÄTZE', farbe: 'petrol', items: [{ iid: 'w1', title: 'Punkt', names: [{ name: 'Anna Beispiel', pid: 'p1', bereichsKey: 'bibellesung' }] }] }]
      : [],
    helpers: {},
  }
}

function woche(start: string, mitAufgabe: boolean): Week {
  return { range: start, book: '', start, mid: meeting(mitAufgabe), we: meeting(false) }
}

describe('wochenAbstand', () => {
  it('misst in Wochen am Startdatum, nicht an der Position', () => {
    expect(wochenAbstand(woche('2026-06-01', false), woche('2026-06-08', false))).toBe(1)
    // Zwei Einträge nebeneinander, aber zwei Wochen auseinander.
    expect(wochenAbstand(woche('2026-06-08', false), woche('2026-06-22', false))).toBe(2)
    // Der Betrag: Wochen lassen sich in beliebiger Reihenfolge planen.
    expect(wochenAbstand(woche('2026-06-22', false), woche('2026-06-08', false))).toBe(2)
  })

  it('überbrückt den Jahreswechsel und die Sommerzeit', () => {
    expect(wochenAbstand(woche('2026-12-28', false), woche('2027-01-04', false))).toBe(1)
    // Ende März springt die Uhr — die Differenz ist dann keine glatte Woche
    // mehr in Millisekunden, gerundet aber sehr wohl.
    expect(wochenAbstand(woche('2026-03-23', false), woche('2026-03-30', false))).toBe(1)
  })
})

/*
 * Die Zahl im Zuteilungs-Blatt und die Auto-Zuteilung rechneten einmal mit
 * `slice` nach Position, die Quadrate daneben (bis T121) nach Datum. Bei
 * lückenlosen Wochen ist das dasselbe; fehlt eine, las der Planer eine Zahl,
 * nach der nicht sortiert worden war — genau der Fehler, den T36 an den
 * Quadraten schon behoben hatte. Seither gibt es nur noch dieses eine Fenster.
 */
describe('lastFenster: das eine Fenster der Auslastung', () => {
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

  it('die Aufgabe vom 8. Juni zählt um den 22. nicht mit — sie liegt zwei Wochen zurück', () => {
    // Die Zahl der Punkte im Zuteilungs-Blatt. Nach Position stünde hier eine
    // Aufgabe „vorige Woche", die es so nicht gab.
    expect(workloadOf(lastFenster(mitLuecke, 2, 1), PERSON)).toBe(0)
    expect(workloadOf(lastFenster(mitLuecke, 1, 1), PERSON)).toBe(1)
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
