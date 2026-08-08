import { describe, expect, it } from 'vitest'
import { emptyQualifications, loadWindow, wochenAbstand } from './helpers'
import { weekConflicts } from './planning'
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
    const ohne: Week = { range: '', book: '', current: false, mid: meeting(false), we: meeting(false) }
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

describe('Serien-Konflikt zählt Wochen in Folge', () => {
  it('eine fehlende Woche unterbricht die Serie', () => {
    // Drei Einträge am Stück, aber die letzten beiden liegen zwei Wochen
    // auseinander — das ist keine Serie von drei Wochen.
    //
    // Die vierte, leere Woche ist nötig, damit der Test überhaupt etwas sagt:
    // `weekConflicts` meldet eine Serie nur, wenn sie kürzer als der geladene
    // Zeitraum ist (wer in *jeder* Woche dran ist, ist durchgehend aktiv, keine
    // auffällige Häufung). Bei genau drei Wochen bliebe die Meldung also auch
    // ohne diese Korrektur aus — der Test wäre grün ohne etwas zu prüfen.
    const weeks = [
      woche('2026-06-01', true),
      woche('2026-06-08', true),
      woche('2026-06-22', true),
      woche('2026-06-29', false),
    ]
    const serien = weekConflicts(weeks, 1, [PERSON], []).filter((c) => c.kind === 'streak')
    expect(serien).toEqual([])
  })

  it('drei echte Wochen in Folge melden weiterhin', () => {
    const weeks = [
      woche('2026-06-01', true),
      woche('2026-06-08', true),
      woche('2026-06-15', true),
      woche('2026-06-22', false),
    ]
    const serien = weekConflicts(weeks, 1, [PERSON], []).filter((c) => c.kind === 'streak')
    expect(serien).toHaveLength(1)
    expect(serien[0].count).toBe(3)
  })
})
