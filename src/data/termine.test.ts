import { describe, expect, it } from 'vitest'
import { terminAdd, terminRemove, terminUpdate, termineVon } from './termine'
import type { Week } from './types'

/**
 * T63 Teil A · Weitere Termine der Woche.
 *
 * Reine Ankündigung: kein Bearbeiter, keine Bestätigung, keine Erinnerung.
 * Geprüft wird deshalb nur, was es hier überhaupt gibt — Anlegen, Ändern,
 * Entfernen, Reihenfolge — und die beiden Eigenschaften, an denen dieses
 * Projekt sonst hängt: **unveränderte Wochen behalten ihre Referenz** (daran
 * erkennt der Aufrufer, was zu speichern ist) und **kein Feld bleibt leer
 * zurück**.
 */

function woche(patch: Partial<Week> = {}): Week {
  return {
    range: '7.–13. September',
    book: '',
    current: false,
    mid: { date: '', sections: [] },
    we: { date: '', sections: [] },
    ...patch,
  } as Week
}

describe('T63 · Termine anlegen, ändern, entfernen', () => {
  it('ein neuer Termin ist leer und trägt seine Kennung', () => {
    const [w] = terminAdd([woche()], 0, 't1')
    expect(w?.termine).toEqual([{ id: 't1', title: '' }])
  })

  it('mehrere Termine je Woche — es ist eine Liste, kein Sonderfall', () => {
    let weeks = terminAdd([woche()], 0, 't1')
    weeks = terminAdd(weeks, 0, 't2')
    expect(weeks[0]?.termine).toHaveLength(2)
  })

  it('Ändern trifft nur den gemeinten Termin', () => {
    let weeks = terminAdd(terminAdd([woche()], 0, 't1'), 0, 't2')
    weeks = terminUpdate(weeks, 0, 't2', { title: 'Ältestenbesprechung', day: 'Donnerstag' })
    expect(weeks[0]?.termine?.[0]).toEqual({ id: 't1', title: '' })
    expect(weeks[0]?.termine?.[1]).toEqual({
      id: 't2',
      title: 'Ältestenbesprechung',
      day: 'Donnerstag',
    })
  })

  it('nur die bearbeitete Woche wird ersetzt — die übrigen behalten ihre Referenz', () => {
    const vorher = [woche(), woche()]
    const nachher = terminAdd(vorher, 0, 't1')
    expect(nachher[1]).toBe(vorher[1])
    expect(nachher[0]).not.toBe(vorher[0])
  })

  it('ein unbekannter Termin ändert gar nichts — dieselbe Referenz zurück', () => {
    const vorher = terminAdd([woche()], 0, 't1')
    expect(terminUpdate(vorher, 0, 'gibtsnicht', { title: 'x' })).toBe(vorher)
    expect(terminRemove(vorher, 0, 'gibtsnicht')).toBe(vorher)
  })

  it('der letzte Termin nimmt das Feld mit — sonst bliebe eine leere Liste stehen', () => {
    // Eine Woche ohne Termine soll aussehen wie eine, die nie welche hatte.
    let weeks = terminAdd(terminAdd([woche()], 0, 't1'), 0, 't2')
    weeks = terminRemove(weeks, 0, 't1')
    expect(weeks[0]?.termine).toHaveLength(1)
    weeks = terminRemove(weeks, 0, 't2')
    expect(weeks[0]).not.toHaveProperty('termine')
  })
})

describe('T63 · Reihenfolge entsteht beim Lesen', () => {
  it('nach Wochentag, dann Uhrzeit', () => {
    const w = woche({
      termine: [
        { id: 'c', title: 'Sonntag früh', day: 'Sonntag', time: '08:00' },
        { id: 'b', title: 'Dienstag spät', day: 'Dienstag', time: '19:30' },
        { id: 'a', title: 'Dienstag früh', day: 'Dienstag', time: '09:00' },
      ],
    })
    expect(termineVon(w).map((t) => t.id)).toEqual(['a', 'b', 'c'])
  })

  it('Termine ohne Tag stehen hinten — sie sind unfertig, nicht „am Montag"', () => {
    const w = woche({
      termine: [
        { id: 'ohne', title: 'noch offen' },
        { id: 'mit', title: 'Pionierbesprechung', day: 'Freitag' },
      ],
    })
    expect(termineVon(w).map((t) => t.id)).toEqual(['mit', 'ohne'])
  })

  it('sortiert wird eine Kopie — die gespeicherte Reihenfolge bleibt, damit beim Tippen nichts springt', () => {
    const liste = [
      { id: 'b', title: 'zweiter', day: 'Sonntag' },
      { id: 'a', title: 'erster', day: 'Montag' },
    ]
    const w = woche({ termine: liste })
    termineVon(w)
    expect(liste.map((t) => t.id)).toEqual(['b', 'a'])
  })

  it('keine Termine, keine Zeilen', () => {
    expect(termineVon(woche())).toEqual([])
    expect(termineVon(undefined)).toEqual([])
  })

  it('„Sonnabend" gilt wie „Samstag" — die Tabelle ist die der Wochendaten', () => {
    const w = woche({
      termine: [
        { id: 'so', title: 'Sonntag', day: 'Sonntag' },
        { id: 'sa', title: 'Sonnabend', day: 'Sonnabend' },
      ],
    })
    expect(termineVon(w).map((t) => t.id)).toEqual(['sa', 'so'])
  })
})
