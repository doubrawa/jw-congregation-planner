import { describe, expect, it } from 'vitest'
import { APP_LANGS } from './langs'
import { relativeZeit } from './zeit'

/**
 * Die Zeitangabe in der Glocke — der Fall, der jahrelang durchrutschte.
 *
 * Erzeugt wurden fünf Formen (`gerade eben`, `vor N Min.`, `vor N Std.`,
 * `gestern`, `vor N Tagen`); im Wörterbuch standen zwei — `gerade eben` und
 * ausgerechnet `vor 2 Std.`, **weil genau diese Zeichenkette in den Testdaten
 * vorkam**. Alles andere blieb in 33 Sprachen deutsch. Nichts stürzte ab,
 * nichts fiel auf.
 *
 * Deshalb prüft das hier nicht „wirft nicht", sondern **wird übersetzt** — und
 * zwar für jede Zahl, nicht für die eine, die zufällig in einer Liste steht.
 */

const JETZT = Date.parse('2026-09-14T12:00:00Z')
const vor = (ms: number) => new Date(JETZT - ms).toISOString()

const MINUTE = 60_000
const STUNDE = 60 * MINUTE
const TAG = 24 * STUNDE

describe('relativeZeit: die Stufen', () => {
  it('unter einer Minute ist „jetzt"', () => {
    expect(relativeZeit(vor(20_000), 'de', JETZT)).toBe('jetzt')
    expect(relativeZeit(vor(20_000), 'en', JETZT)).toBe('now')
  })

  it('Minuten', () => {
    expect(relativeZeit(vor(5 * MINUTE), 'en', JETZT)).toBe('5 minutes ago')
  })

  it('Stunden — **jede** Zahl, nicht nur die aus den Testdaten', () => {
    for (const h of [1, 2, 3, 7, 23]) {
      expect(relativeZeit(vor(h * STUNDE), 'en', JETZT)).toBe(`${h} hour${h === 1 ? '' : 's'} ago`)
    }
  })

  it('ein Tag ist „gestern", nicht „vor 1 Tag"', () => {
    // `numeric: 'auto'` — dieselbe Sonderform, die der abgelöste deutsche Code
    // von Hand geschrieben hatte, nur eben in jeder Sprache.
    expect(relativeZeit(vor(TAG), 'de', JETZT)).toBe('gestern')
    expect(relativeZeit(vor(TAG), 'en', JETZT)).toBe('yesterday')
  })

  it('mehrere Tage', () => {
    expect(relativeZeit(vor(3 * TAG), 'en', JETZT)).toBe('3 days ago')
  })

  it('gerundet wird, nicht abgeschnitten', () => {
    // 90 Minuten sind „vor 2 Stunden" — wie im abgelösten Code.
    expect(relativeZeit(vor(90 * MINUTE), 'en', JETZT)).toBe('2 hours ago')
  })

  it('ein unlesbarer Zeitstempel ergibt nichts, kein „Invalid Date"', () => {
    expect(relativeZeit('kein Datum', 'de', JETZT)).toBe('')
    expect(relativeZeit('', 'en', JETZT)).toBe('')
  })
})

describe('Jede Sprache übersetzt jede Stufe', () => {
  const STUFEN: Array<[string, number]> = [
    ['Minuten', 5 * MINUTE],
    ['Stunden', 3 * STUNDE],
    ['gestern', TAG],
    ['Tage', 4 * TAG],
  ]

  it.each(APP_LANGS.map((l) => l.code).filter((c) => c !== 'de'))('%s', (code) => {
    for (const [name, ms] of STUFEN) {
      const eigen = relativeZeit(vor(ms), code, JETZT)
      const deutsch = relativeZeit(vor(ms), 'de', JETZT)
      expect(eigen, `${code}/${name}`).not.toBe('')
      expect(eigen, `${code}/${name} blieb deutsch`).not.toBe(deutsch)
    }
  })
})

describe('Nichts wirft — auch nicht an den Rändern', () => {
  it.each(APP_LANGS.map((l) => l.code))('%s', (code) => {
    for (const ms of [0, 59_000, MINUTE, 59 * MINUTE, STUNDE, 23 * STUNDE, TAG, 400 * TAG]) {
      expect(() => relativeZeit(vor(ms), code, JETZT)).not.toThrow()
      expect(relativeZeit(vor(ms), code, JETZT)).not.toMatch(/undefined|NaN|Invalid/)
    }
  })
})
