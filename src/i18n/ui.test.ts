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

  it('Platzhalter ({n}, {name}, …) stimmen in jeder Sprache mit DE überein', () => {
    const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(',')
    const broken: string[] = []
    for (const { code } of APP_LANGS) {
      const d = dict(code) as unknown as Record<string, string>
      for (const key of deKeys) {
        const want = placeholders((DE as Record<string, string>)[key])
        const got = placeholders(d[key])
        if (got !== want) broken.push(`${code}.${key}: [${got}] statt [${want}]`)
      }
    }
    expect(broken).toEqual([])
  })

  it('keine Werte mit führendem/doppeltem Leerraum (Ausnahme: bewusste Suffixe)', () => {
    const suffixKeys = new Set(['duMarker', 'demoSuffix']) // beginnen bewusst mit Leerzeichen
    for (const { code } of APP_LANGS) {
      const d = dict(code) as unknown as Record<string, string>
      for (const key of deKeys) {
        if (!suffixKeys.has(key)) {
          expect(d[key], `${code}.${key}`).toBe(d[key].trim())
        }
        expect(d[key].includes('  '), `${code}.${key} doppelter Leerraum`).toBe(false)
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
