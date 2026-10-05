import { describe, expect, it } from 'vitest'
import { dePaare, geaenderteSchluessel, matrixText, overlayPaare } from './uebersetzungs-matrix.mjs'

/**
 * Das Lese-Werkzeug fürs Übersetzungs-Review (5.10.2026). Was es übersieht,
 * liest niemand — darum die Fälle, an denen ein Zeilenmuster gern scheitert:
 * Anführungszeichen und Rückstriche im Wert, Schreibrichtung von rechts, mehrere
 * Paare je Zeile in `de.ts`, Kopfzeilen und entfernte Zeilen im Diff.
 */

describe('overlayPaare', () => {
  it('liest Werte mit Anführungszeichen, Rückstrich und Schrift von rechts', () => {
    const text = [
      'export default {',
      '  "a": "Er sagt \\"Ja\\"",',
      '  "b": "C:\\\\Pfad",',
      '  "c": "بعد النشر تراه الجماعة كلها."',
      '} satisfies Dict',
    ].join('\n')
    expect([...overlayPaare(text)]).toEqual([
      ['a', 'Er sagt "Ja"'],
      ['b', 'C:\\Pfad'],
      ['c', 'بعد النشر تراه الجماعة كلها.'],
    ])
  })
})

describe('dePaare', () => {
  it('liest mehrere Paare je Zeile — auch mit typografischen Anführungszeichen im Wert', () => {
    const text = "    navStart: 'Start', gbLeitetDann: '{name} leitet dann euren Treffpunkt.',\n    x: 'Plan „senden“'"
    expect(dePaare(text)).toEqual(
      new Map([
        ['navStart', 'Start'],
        ['gbLeitetDann', '{name} leitet dann euren Treffpunkt.'],
        ['x', 'Plan „senden“'],
      ]),
    )
  })
})

describe('geaenderteSchluessel', () => {
  it('nimmt neue und geänderte Zeilen, nicht die Kopfzeile und nicht Entferntes', () => {
    const diff = [
      '--- a/src/i18n/overlays/en.ts',
      '+++ b/src/i18n/overlays/en.ts',
      '-  "alt": "weg",',
      '+  "neu": "da",',
      '+  "geaendert": "anders"',
      '   "gleich": "bleibt",',
    ].join('\n')
    expect([...geaenderteSchluessel(diff)]).toEqual(['neu', 'geaendert'])
  })
})

describe('matrixText', () => {
  it('nennt je Schlüssel Deutsch und jede Sprache — und was fehlt', () => {
    const text = matrixText(
      new Set(['b', 'a']),
      new Map([['a', 'Eins']]),
      new Map([
        ['en', new Map([['a', 'One'], ['b', 'Two']])],
        ['fr', new Map([['a', 'Un']])],
      ]),
    )
    expect(text).toContain('### a\nde: Eins\nen: One\nfr: Un\n')
    expect(text).toContain('### b\nde: (fehlt in de.ts)\nen: Two\nfr: (FEHLT)\n')
    expect(text.indexOf('### a')).toBeLessThan(text.indexOf('### b'))
    expect(text).toContain('2 Schlüssel, 2 Sprachen')
  })
})
