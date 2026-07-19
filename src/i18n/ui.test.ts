import { describe, expect, it } from 'vitest'
import { APP_LANGS } from './langs'
import { DE, dict } from './ui'

describe('UI-Wörterbücher (Fallback-Kette DE ← EN ← Sprache)', () => {
  const deKeys = Object.keys(DE).sort()

  it('jede App-Sprache liefert alle Keys mit nicht-leeren Strings', () => {
    for (const { code } of APP_LANGS) {
      const d = dict(code) as unknown as Record<string, string>
      expect(Object.keys(d).sort(), code).toEqual(deKeys)
      for (const key of deKeys) {
        expect(typeof d[key], `${code}.${key}`).toBe('string')
        expect(d[key].length, `${code}.${key}`).toBeGreaterThan(0)
      }
    }
  })

  it('Sprachen ohne eigene Übersetzung eines Keys fallen auf Englisch zurück', () => {
    // keineWochenTitel existiert nur in DE/EN/AR — Kroatisch nutzt das EN-Wort
    expect(dict('hr').keineWochenTitel).toBe(dict('en').keineWochenTitel)
    expect(dict('de').keineWochenTitel).not.toBe(dict('en').keineWochenTitel)
    expect(dict('ar').keineWochenTitel).not.toBe(dict('en').keineWochenTitel)
  })
})
