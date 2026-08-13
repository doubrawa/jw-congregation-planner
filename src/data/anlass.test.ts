import { describe, expect, it } from 'vitest'
import { anlassArt, setAnlass, setAnlassTermin } from './anlass'
import { LABEL_DIENSTVORTRAG, TITEL_DIENSTVORTRAG, isSong } from './helpers'
import { istAusgefallen, abweichung } from './helpers'
import { setAbweichung } from './meeting-edit'
import type { Meeting, PartItem, Week } from './types'

/**
 * T64 — der Anlass der Woche.
 *
 * Aufgefallen war: Der Kreisaufseher-Schalter stand im Panel **einer**
 * Zusammenkunft, änderte aber **beide**. Daraus die Regel, die hier geprüft
 * wird — ein Bedienelement gehört auf die Ebene, die es verändert.
 *
 * Zwei Eigenschaften sind dabei die eigentliche Substanz und stehen deshalb
 * jeweils in einem eigenen Block:
 *
 * 1. **Keine Datenwanderung.** Wochen, die vor T64 gespeichert wurden, tragen
 *    `anlass` nicht — `anlassArt` liest dann `co`/`mem`.
 * 2. **Der Anlass schlägt vor, die Zusammenkunft entscheidet.** Seine Wirkungen
 *    bleiben eigene Felder und danach bedienbar.
 */

/** Woche wie aus dem Import — Bibelstudium unter der Woche, WT-Studium am Wochenende. */
function makeWeek(): Week {
  const mid: Meeting = {
    date: '7.–13. September',
    end: 'Ende ca. 20:45',
    sections: [
      {
        label: 'UNSER LEBEN ALS CHRIST',
        farbe: 'wein',
        items: [
          {
            iid: 'a2',
            num: 7,
            title: 'Versammlungsbibelstudium',
            meta: '30 Min.',
            mins: 30,
            names: [
              { name: 'A. Leiter', pid: 'p1', rolle: 'Leiter', bereichsKey: 'studium' },
              { name: 'B. Leser', pid: 'p2', rolle: 'Leser', bereichsKey: 'leser' },
            ],
          },
        ],
      },
    ],
    helpers: {},
  }
  const we: Meeting = {
    date: '7.–13. September',
    end: 'Ende ca. 11:45',
    sections: [
      { label: 'ÖFFENTLICHER VORTRAG', farbe: 'petrol', items: [{ iid: 'b1', title: 'Thema', meta: '30 Min.', mins: 30, names: [] }] },
      {
        label: 'WACHTTURM-STUDIUM',
        farbe: 'wein',
        items: [
          { iid: 'b2', title: 'Artikel', meta: 'Studienartikel 28 · 60 Min.', mins: 60,
            names: [
              { name: 'A. Leiter', pid: 'p1', rolle: 'Leiter', bereichsKey: 'studium' },
              { name: 'B. Leser', pid: 'p2', rolle: 'Leser', bereichsKey: 'leser' },
            ] },
        ],
      },
      { label: 'ABSCHLUSS', farbe: 'neutral', items: [{ iid: 'b3', title: 'Schlussworte', names: [] }] },
    ],
    helpers: {},
  }
  return { range: '7.–13. September', book: '', start: '2026-09-07', current: false, mid, we }
}

/** Element an einer Position — mit Ansage statt Nicht-Null-Zusatz (T42). */
function bei<T>(arr: readonly T[] | undefined, i: number): T {
  const x = arr?.[i]
  if (x === undefined) throw new Error(`kein Element an Position ${i}`)
  return x
}
const eine = (ws: Week[]): Week => bei(ws, 0)

describe('anlassArt: alte Wochen brauchen keine Datenwanderung', () => {
  it('liest das neue Feld', () => {
    const w: Week = { ...makeWeek(), anlass: { art: 'kongress', von: '2026-10-16', bis: '2026-10-18' } }
    expect(anlassArt(w)).toBe('kongress')
  })

  it('fällt auf `co` zurück, wenn `anlass` fehlt', () => {
    // Genau der Bestand, der heute in der Datenbank liegt.
    expect(anlassArt({ ...makeWeek(), co: true })).toBe('co')
  })

  it('fällt auf `mem` zurück, wenn `anlass` fehlt', () => {
    expect(anlassArt({ ...makeWeek(), mem: true, memCancel: 'we' })).toBe('mem')
  })

  it('ohne beides: kein Anlass', () => {
    expect(anlassArt(makeWeek())).toBeUndefined()
    expect(anlassArt(undefined)).toBeUndefined()
  })
})

describe('Kreisaufseher: der Anlass baut das Programm um', () => {
  const an = () => setAnlass([makeWeek()], 0, 'co')

  it('setzt den Anlass **und** seine Wirkung — beide Zusammenkünfte', () => {
    const w = eine(an())
    expect(anlassArt(w)).toBe('co')
    expect(w.co).toBe(true)
    // Unter der Woche: Dienstvortrag statt Bibelstudium …
    expect((bei(bei(w.mid.sections, 0).items, 0) as PartItem).title).toBe(TITEL_DIENSTVORTRAG)
    // … und am Wochenende die eigene Sektion mit dem Schlussvortrag.
    expect(w.we.sections.some((s) => s.label === LABEL_DIENSTVORTRAG)).toBe(true)
  })

  it('und nimmt beim Wechsel auf „kein Anlass" alles zurück', () => {
    const zurueck = setAnlass(an(), 0, null)
    const w = eine(zurueck)
    expect(anlassArt(w)).toBeUndefined()
    expect(w.co).toBe(false)
    expect((bei(bei(w.mid.sections, 0).items, 0) as PartItem).title).toBe('Versammlungsbibelstudium')
    expect(w.we.sections.some((s) => s.label === LABEL_DIENSTVORTRAG)).toBe(false)
  })

  it('samt der Zuteilungen des ersetzten Punktes', () => {
    // Das ist der Grund, warum zurücknehmen nicht wegwerfen heißt (T62).
    const zurueck = setAnlass(an(), 0, null)
    const vbs = bei(bei(eine(zurueck).mid.sections, 0).items, 0) as PartItem
    expect(vbs.names.map((n) => n.name)).toEqual(['A. Leiter', 'B. Leser'])
  })
})

describe('Kongress: beide Zusammenkünfte entfallen', () => {
  const an = () => setAnlass([makeWeek()], 0, 'kongress')

  it('streicht beide — nicht nur die gerade offene', () => {
    // Der Kern des Befunds: eine Aussage über die Woche wirkt auf beide.
    const w = eine(an())
    expect(istAusgefallen(w, 'mid')).toBe(true)
    expect(istAusgefallen(w, 'we')).toBe(true)
  })

  it('nimmt den Strich beim Aufheben wieder zurück', () => {
    const zurueck = setAnlass(an(), 0, null)
    expect(istAusgefallen(eine(zurueck), 'mid')).toBe(false)
    expect(istAusgefallen(eine(zurueck), 'we')).toBe(false)
  })

  it('lässt Verlegung und Grund des Planers dabei stehen', () => {
    // Die hat er selbst gesetzt; sie gehören nicht dem Anlass.
    let ws = setAbweichung([makeWeek()], 0, 'mid', { day: 'Mittwoch', reason: 'Saal belegt' })
    ws = setAnlass(ws, 0, 'kongress')
    ws = setAnlass(ws, 0, null)
    expect(abweichung(eine(ws), 'mid')?.day).toBe('Mittwoch')
    expect(abweichung(eine(ws), 'mid')?.reason).toBe('Saal belegt')
  })

  it('der Anlass schlägt vor, die Zusammenkunft entscheidet', () => {
    // Fällt der Kongress nur aufs Wochenende, schaltet der Planer die
    // Zusammenkunft unter der Woche wieder an — der Anlass bleibt.
    const ws = setAbweichung(an(), 0, 'mid', { cancelled: undefined })
    expect(istAusgefallen(eine(ws), 'mid')).toBe(false)
    expect(istAusgefallen(eine(ws), 'we')).toBe(true)
    expect(anlassArt(eine(ws))).toBe('kongress')
  })
})

describe('Gedächtnismahl: erstmals einstellbar', () => {
  it('setzt die Marke, die es bisher nur im Datensatz gab', () => {
    const w = eine(setAnlass([makeWeek()], 0, 'mem'))
    expect(anlassArt(w)).toBe('mem')
    expect(w.mem).toBe(true)
  })

  it('streicht ohne Datum noch keine Zusammenkunft', () => {
    // Beim bloßen Anhaken steht der Termin noch gar nicht fest — und ohne ihn
    // ist nicht bekannt, welche Zusammenkunft verdrängt wird.
    const w = eine(setAnlass([makeWeek()], 0, 'mem'))
    expect(istAusgefallen(w, 'mid')).toBe(false)
    expect(istAusgefallen(w, 'we')).toBe(false)
  })

  /*
    Welche Zusammenkunft entfällt, hängt am Datum — das hat der Betreiber am
    8.8.2026 klargestellt: „wenn unter der Woche fällt diese Zusammenkunft aus,
    wenn am Wochenende dann die Zusammenkunft am Wochenende".

    **Nach Kategorie, nicht nach Tagesgleichheit.** Hier stand zuerst die
    engere Regel — es entfiel die Zusammenkunft, deren *Tag* mit dem Mahl
    zusammenfiel. Beim Zuschnitt von T65 an jw.org nachgemessen und widerlegt:
    Das Arbeitsheft lässt die ganze Woche aus, sobald das Mahl auf einen
    Werktag fällt (Ausgabe März/April 2026, Mahl Donnerstag, 2. April — die
    Wochenseite fehlt), und lässt sie stehen, wenn es aufs Wochenende fällt
    (März/April 2024, Mahl Sonntag, 24. März — alle Seiten da). Der Herausgeber
    entscheidet das für alle Versammlungen zugleich; ihre Zusammenkunftstage
    kennt er gar nicht. Deshalb braucht diese Regel sie auch nicht.
  */
  it('fällt es auf einen Werktag, entfällt die Zusammenkunft unter der Woche', () => {
    const ws = setAnlassTermin(setAnlass([makeWeek()], 0, 'mem'), 0, { von: '2026-03-31' })
    expect(istAusgefallen(eine(ws), 'mid')).toBe(true) // 31.3.2026 ist ein Dienstag
    expect(istAusgefallen(eine(ws), 'we')).toBe(false)
  })

  it('fällt es aufs Wochenende, entfällt jene', () => {
    const ws = setAnlassTermin(setAnlass([makeWeek()], 0, 'mem'), 0, { von: '2026-04-05' })
    expect(istAusgefallen(eine(ws), 'we')).toBe(true) // 5.4.2026 ist ein Sonntag
    expect(istAusgefallen(eine(ws), 'mid')).toBe(false)
  })

  /*
    Der Fall, der die alte Regel widerlegt — und der reale: Das Mahl 2026 liegt
    auf einem Donnerstag, die Versammlung kommt dienstags zusammen. Nach
    Tagesgleichheit entfiele **keine**; das Arbeitsheft aber druckt für diese
    Woche gar nichts, es gibt also nichts zu planen.
  */
  it('auch an einem Werktag, an dem die Versammlung gar nicht zusammenkommt', () => {
    const ws = setAnlassTermin(setAnlass([makeWeek()], 0, 'mem'), 0, { von: '2026-04-02' })
    expect(istAusgefallen(eine(ws), 'mid')).toBe(true) // Donnerstag
    expect(istAusgefallen(eine(ws), 'we')).toBe(false)
  })

  it('Samstag zählt zum Wochenende', () => {
    // Die Grenze liegt zwischen Freitag (4) und Samstag (5) — nicht bei Sonntag.
    const ws = setAnlassTermin(setAnlass([makeWeek()], 0, 'mem'), 0, { von: '2026-04-04' })
    expect(istAusgefallen(eine(ws), 'we')).toBe(true)
    expect(istAusgefallen(eine(ws), 'mid')).toBe(false)
  })

  it('und Freitag noch zur Woche', () => {
    const ws = setAnlassTermin(setAnlass([makeWeek()], 0, 'mem'), 0, { von: '2026-04-03' })
    expect(istAusgefallen(eine(ws), 'mid')).toBe(true)
    expect(istAusgefallen(eine(ws), 'we')).toBe(false)
  })

  it('eine Korrektur des Datums nimmt den alten Strich zurück', () => {
    // Sonst stünden nach „erst Dienstag, dann Sonntag" beide durchgestrichen da.
    let ws = setAnlassTermin(setAnlass([makeWeek()], 0, 'mem'), 0, { von: '2026-03-31' })
    ws = setAnlassTermin(ws, 0, { von: '2026-04-05' })
    expect(istAusgefallen(eine(ws), 'mid')).toBe(false)
    expect(istAusgefallen(eine(ws), 'we')).toBe(true)
  })

  it('und das Aufheben des Anlasses beide', () => {
    let ws = setAnlassTermin(setAnlass([makeWeek()], 0, 'mem'), 0, { von: '2026-03-31' })
    ws = setAnlass(ws, 0, null)
    expect(istAusgefallen(eine(ws), 'mid')).toBe(false)
    expect(istAusgefallen(eine(ws), 'we')).toBe(false)
  })

  it('und räumt sie beim Aufheben wieder ab', () => {
    const zurueck = setAnlass(setAnlass([makeWeek()], 0, 'mem'), 0, null)
    expect(eine(zurueck).mem).toBeUndefined()
    expect(eine(zurueck).memCancel).toBeUndefined()
  })

  it('wechselt sauber vom Kreisaufseher herüber — der Umbau wird zurückgenommen', () => {
    const ws = setAnlass(setAnlass([makeWeek()], 0, 'co'), 0, 'mem')
    expect(anlassArt(eine(ws))).toBe('mem')
    expect(eine(ws).co).toBe(false)
    expect(eine(ws).we.sections.some((s) => s.label === LABEL_DIENSTVORTRAG)).toBe(false)
  })
})

describe('Termin: „bis" wird vorbelegt', () => {
  const kongress = () => setAnlass([makeWeek()], 0, 'kongress')

  it('übernimmt beim Eintragen von „von" denselben Wert', () => {
    // Der eintägige Kreiskongress braucht damit keine zweite Eingabe — und
    // beide Werte sind trotzdem gefüllt: nirgends der Sonderfall „kein Ende".
    const ws = setAnlassTermin(kongress(), 0, { von: '2026-10-17' })
    expect(eine(ws).anlass?.von).toBe('2026-10-17')
    expect(eine(ws).anlass?.bis).toBe('2026-10-17')
  })

  it('überschreibt ein späteres Ende **nicht**', () => {
    // Eine Korrektur des Anfangs darf die Eingabe des Planers nicht verwerfen.
    let ws = setAnlassTermin(kongress(), 0, { von: '2026-10-16' })
    ws = setAnlassTermin(ws, 0, { bis: '2026-10-18' })
    ws = setAnlassTermin(ws, 0, { von: '2026-10-15' })
    expect(eine(ws).anlass?.bis).toBe('2026-10-18')
  })

  it('zieht ein Ende **vor** dem neuen Anfang mit', () => {
    let ws = setAnlassTermin(kongress(), 0, { von: '2026-10-16' })
    ws = setAnlassTermin(ws, 0, { bis: '2026-10-18' })
    ws = setAnlassTermin(ws, 0, { von: '2026-10-20' })
    expect(eine(ws).anlass?.bis).toBe('2026-10-20')
  })

  it('das Gedächtnismahl trägt Datum und Uhrzeit', () => {
    let ws = setAnlass([makeWeek()], 0, 'mem')
    ws = setAnlassTermin(ws, 0, { von: '2026-04-01', zeit: '19:30' })
    expect(eine(ws).anlass).toEqual({ art: 'mem', von: '2026-04-01', bis: '2026-04-01', zeit: '19:30' })
  })

  it('ohne Anlass gibt es nichts zu terminieren', () => {
    const ws = [makeWeek()]
    expect(setAnlassTermin(ws, 0, { von: '2026-10-17' })).toBe(ws)
  })
})

describe('Ränder', () => {
  it('eine Woche, die es nicht gibt, ändert nichts', () => {
    const ws = [makeWeek()]
    expect(setAnlass(ws, 7, 'kongress')).toBe(ws)
    expect(setAnlassTermin(ws, 7, { von: '2026-10-17' })).toBe(ws)
  })

  it('derselbe Anlass noch einmal gesetzt ist keine Änderung', () => {
    // Sonst liefe der Umbau ein zweites Mal — und ersetzte den Dienstvortrag
    // durch sich selbst, mit dem Original als Verlust.
    const ws = setAnlass([makeWeek()], 0, 'co')
    expect(setAnlass(ws, 0, 'co')).toBe(ws)
  })

  it('„kein Anlass" auf einer Woche ohne Anlass ebenso', () => {
    const ws = [makeWeek()]
    expect(setAnlass(ws, 0, null)).toBe(ws)
  })

  it('lässt die Lieder der umgebauten Sektion unangetastet', () => {
    const w = eine(setAnlass([makeWeek()], 0, 'co'))
    const sec = w.we.sections.find((s) => s.label === LABEL_DIENSTVORTRAG)
    expect(sec?.items.filter(isSong)).toHaveLength(0)
  })
})
