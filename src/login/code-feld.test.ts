import { describe, expect, it } from 'vitest'
import { codeImFeld, stelleImFeld, zeichenVor } from './code-feld'

/**
 * **Das Feld für den Code vom Zettel** (2.11.2026): Es gliedert, während
 * getippt wird, und die Schreibmarke bleibt dabei hinter dem Zeichen, hinter
 * dem sie stand. Sonst spränge sie bei jeder Korrektur mitten im Code ans Ende.
 */
describe('Was das Feld zeigt', () => {
  it('die Lücke kommt mit dem vierten Zeichen, beim Löschen nicht', () => {
    expect(codeImFeld('K7RD', false)).toBe('K7RD ')
    expect(codeImFeld('K7RD', true)).toBe('K7RD')
    expect(codeImFeld('K7R', false)).toBe('K7R')
    expect(codeImFeld('K7RD2', false)).toBe('K7RD 2')
    expect(codeImFeld('K7RD2', true)).toBe('K7RD 2')
  })

  it('der volle Code bekommt keine Lücke am Ende', () => {
    expect(codeImFeld('K7RD2QWM', false)).toBe('K7RD 2QWM')
  })
})

describe('Wo die Schreibmarke danach steht', () => {
  it('am Ende hinter der eben gesetzten Lücke — dort geht das Tippen weiter', () => {
    expect(stelleImFeld('K7RD ', zeichenVor('K7RD', 4))).toBe(5)
  })

  it('hinter dem fünften Zeichen, auch wenn davor die Lücke steht', () => {
    expect(stelleImFeld('K7RD 2', zeichenVor('K7RD 2', 6))).toBe(6)
  })

  it('beim Löschen mitten in der ersten Gruppe bleibt sie dort, statt ans Ende zu springen', () => {
    // „K7RD 2QWM", die 7 gelöscht: Im Feld steht „KRD 2QWM", die Marke hinter dem K.
    const neu = codeImFeld('KRD 2QWM', true)
    expect(neu).toBe('KRD2 QWM')
    expect(stelleImFeld(neu, zeichenVor('KRD 2QWM', 1))).toBe(1)
  })

  it('beim Einfügen in der ersten Gruppe steht sie hinter dem neuen Zeichen', () => {
    // In „K7RD 2QWM" hinter der 7 ein X: acht Zeichen bleiben, das letzte fällt weg.
    const neu = codeImFeld('K7XRD 2QWM', false)
    expect(neu).toBe('K7XR D2QW')
    expect(stelleImFeld(neu, zeichenVor('K7XRD 2QWM', 3))).toBe(3)
  })

  it('Gegenprobe: vor der Lücke in der Mitte bleibt sie vor ihr — dort wird die erste Gruppe bearbeitet', () => {
    expect(stelleImFeld('K7RD 2QWM', 4)).toBe(4)
  })

  it('zählt nur Zeichen des Codes, keine Lücken, Striche oder Fremdzeichen', () => {
    expect(zeichenVor('K7-R D', 6)).toBe(4)
    expect(zeichenVor('K0O', 3)).toBe(1)
  })
})
