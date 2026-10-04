import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * **Das Logo in zwei Größen** (4.10.2026): `logo.svg` (4-6-8) für Anmeldung
 * und App-Icons, `logo-klein.svg` (3-5-7, kräftigere Punkte) für Favicon,
 * Kopfzeile am Handy und Seitenleiste.
 *
 * Gelesen wird über `node:fs` — die Dateien liegen in `public/` und gehen
 * unverändert in den Build.
 */
const WURZEL = fileURLToPath(new URL('../', import.meta.url))
const PUBLIC = `${WURZEL}public/`

describe('Die kleine Fassung des Logos', () => {
  it('jede Datei der App-Hülle liegt in public/ — fehlt eine, scheitert die Installation des Workers', () => {
    // `cache.addAll` bricht beim ersten 404 ab; dann gibt es keinen Offline-Start.
    const sw = readFileSync(`${PUBLIC}sw.js`, 'utf8')
    const liste = /const SHELL = \[([^\]]*)\]/.exec(sw)?.[1] ?? ''
    const dateien = [...liste.matchAll(/'([^']+)'/g)].map((m) => m[1]!).filter((d) => d !== './' && d !== 'index.html')
    expect(dateien, 'SHELL nicht gefunden').toContain('logo-klein.svg')
    for (const datei of dateien) expect(existsSync(`${PUBLIC}${datei}`), datei).toBe(true)
  })

  it('hat 3, 5 und 7 Plätze und das Pult', () => {
    const svg = readFileSync(`${PUBLIC}logo-klein.svg`, 'utf8')
    expect(svg.match(/<circle /g)?.length).toBe(3 + 5 + 7 + 1)
  })

  it('ist das Favicon', () => {
    const index = readFileSync(`${WURZEL}index.html`, 'utf8')
    expect(index).toMatch(/<link rel="icon" type="image\/svg\+xml" href="logo-klein\.svg" \/>/)
  })
})
