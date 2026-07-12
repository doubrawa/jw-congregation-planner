import { describe, expect, it } from 'vitest'
import { makeTr } from './translate'

describe('makeTr — Programm-Inhalts-Übersetzer', () => {
  const en = makeTr('en')
  const es = makeTr('es')
  const fr = makeTr('fr')

  it('Deutsch ist die Identität', () => {
    const de = makeTr('de')
    expect(de('SCHÄTZE AUS GOTTES WORT')).toBe('SCHÄTZE AUS GOTTES WORT')
  })

  it('übersetzt offizielle S-38-Sektionslabels', () => {
    expect(en('UNS IM DIENST VERBESSERN')).toBe('APPLY YOURSELF TO THE FIELD MINISTRY')
    expect(es('SCHÄTZE AUS GOTTES WORT')).toBe('TESOROS DE LA BIBLIA')
    expect(fr('UNSER LEBEN ALS CHRIST')).toBe('VIE CHRÉTIENNE')
  })

  it('übersetzt Daten und Wochenbereiche', () => {
    expect(en('Dienstag, 8. September')).toBe('Tuesday, September 8')
    expect(en('7.–13. September')).toBe('September 7–13')
  })

  it('übersetzt zusammengesetzte Meta-Zeilen (getrennt durch ·)', () => {
    expect(en('4 Min. · th Lektion 2')).toBe('4 min. · th lesson 2')
    expect(en('Von Haus zu Haus · 3 Min.')).toBe('House to house · 3 min.')
  })

  it('übersetzt Rahmen, Begleiter und Countdown', () => {
    expect(es('Interesse fördern')).toBe('Haga revisitas')
    expect(fr('mit A. Hoffmann')).toBe('avec A. Hoffmann')
    expect(en('in 4 Tagen')).toBe('in 4 days')
  })

  it('übersetzt Sonderwochen-Begriffe', () => {
    expect(en('GEDÄCHTNISMAHL')).toBe('MEMORIAL')
    expect(en('Kreisaufseher')).toBe('Circuit overseer')
    expect(en('„Lauft so, dass ihr den Preis gewinnt“')).toContain('Run in Such a Way')
  })

  it('lässt Unbekanntes unverändert (Rückfall auf Deutsch)', () => {
    expect(en('Irgendetwas Unbekanntes')).toBe('Irgendetwas Unbekanntes')
  })
})
