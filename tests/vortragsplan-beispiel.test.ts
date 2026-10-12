/** @vitest-environment jsdom */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { vortragsplanLesen } from '../src/lib/vortragsplan-xml'

/**
 * **Die Beispieldatei der Formatbeschreibung liest die App so, wie es dort
 * steht** (T122). Wer das Format ändert, ohne die Beschreibung nachzuziehen —
 * oder umgekehrt —, bekommt es hier gesagt: Die Beispieldatei ist das, was ein
 * Planungsprogramm zum Vorbild nimmt.
 */
describe('docs/vortragsplan-beispiel.xml', () => {
  it('wird vollständig gelesen; das Feld außerhalb des Formats bleibt draußen', () => {
    // Über das Arbeitsverzeichnis (die Wurzel des Repos): Unter jsdom — der
    // Leser braucht `DOMParser` — ist `import.meta.url` keine Datei-Adresse.
    const bytes = readFileSync(join(process.cwd(), 'docs', 'vortragsplan-beispiel.xml'))
    const e = vortragsplanLesen(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer)
    if (!e.ok) throw new Error(`nicht gelesen: ${e.grund}`)
    expect(e.fehler).toEqual([])
    expect(e.ignoriert).toEqual(['telefon'])
    expect(e.plan.von).toBe('2026-11-01')
    expect(e.plan.bis).toBe('2026-11-30')
    expect(e.plan.vortraege).toEqual([
      { datum: '2026-11-08', redner: 'Max Mustermann', versammlung: 'Musterstadt', eigener: false, thema: 'Demo-Thema 1', lied: '151' },
      { datum: '2026-11-15', redner: 'Peter Beispiel', versammlung: '', eigener: true, thema: 'Demo-Thema 2', lied: '27' },
      { datum: '2026-11-22', redner: 'Klaus Platzhalter', versammlung: 'Beispielhausen', eigener: false, thema: '', lied: '' },
    ])
  })
})
