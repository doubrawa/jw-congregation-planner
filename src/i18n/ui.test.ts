import { beforeAll, describe, expect, it } from 'vitest'
import { APP_LANGS } from './langs'
import { DE, dict, loadOverlay } from './ui'

describe('UI-Wörterbücher (Fallback-Kette DE ← EN ← Sprache)', () => {
  const deKeys = Object.keys(DE).sort()

  // Overlays sind lazy (Code-Splitting) — für die Vollständigkeitsprüfung
  // alle Sprachen vorab nachladen.
  beforeAll(async () => {
    await Promise.all(APP_LANGS.map(({ code }) => loadOverlay(code)))
  })

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

  it('dict schichtet DE ← EN ← Sprache (eigene Übersetzung gewinnt vor EN)', () => {
    // Alle App-Sprachen sind inzwischen vollständig übersetzt; die eigene
    // Übersetzung hat Vorrang vor der EN-Fallback-Schicht.
    expect(dict('hr').keineWochenTitel).not.toBe(dict('en').keineWochenTitel)
    expect(dict('es').konfMehr).not.toBe(dict('en').konfMehr)
    // DE ist die Basis, EN eine getrennte Schicht darüber.
    expect(dict('de').keineWochenTitel).not.toBe(dict('en').keineWochenTitel)
  })

  it('EN bleibt Fallback-Basis für nicht (nach)geladene Sprach-Overlays', () => {
    // dict() legt EN unter die Sprache; ist ein Overlay (noch) nicht geladen,
    // greift EN. Hier verifiziert an DE↔EN-Trennung + vorhandenem EN-Wert.
    expect(typeof dict('en').keineWochenTitel).toBe('string')
    expect(dict('en').keineWochenTitel).not.toBe(DE.keineWochenTitel)
  })
})
