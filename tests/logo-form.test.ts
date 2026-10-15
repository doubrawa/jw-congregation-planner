import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { LOGO_GROSS, LOGO_KLEIN, REIHEN_DECKKRAFT, type LogoForm } from '../src/bausteine/logo-form'

/**
 * **Das Logo in zwei Größen** (4.10.2026): `logo.svg` (4-6-8) für die App-Icons,
 * `logo-klein.svg` (3-5-7, kräftigere Punkte) für das Favicon. In der App
 * zeichnet `bausteine/Logo.tsx` beide Formen selbst, ohne Kachel, aus
 * `logo-form.ts` — dieselben Plätze wie in den Dateien, sonst sähe das Icon auf
 * dem Startbildschirm anders aus als das Logo in der App.
 *
 * Gelesen wird über `node:fs` — die Dateien liegen in `public/` und gehen
 * unverändert in den Build.
 */
const WURZEL = fileURLToPath(new URL('../', import.meta.url))
const PUBLIC = `${WURZEL}public/`

/** Kreise einer Datei: Mittelpunkt, Halbmesser und die Deckkraft ihrer Gruppe. */
function kreise(datei: string): Array<{ x: number; y: number; r: number; deckkraft: number }> {
  const svg = readFileSync(`${PUBLIC}${datei}`, 'utf8')
  const out: Array<{ x: number; y: number; r: number; deckkraft: number }> = []
  let deckkraft = 1
  for (const m of svg.matchAll(/<g fill-opacity="([\d.]+)">|<\/g>|<circle cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)"/g)) {
    if (m[1]) deckkraft = Number(m[1])
    else if (m[0] === '</g>') deckkraft = 1
    else out.push({ x: Number(m[2]), y: Number(m[3]), r: Number(m[4]), deckkraft })
  }
  return out
}

/** Was eine Form zeichnet, in derselben Gestalt — das Pult zuletzt, wie in den Dateien. */
function ausForm(form: LogoForm) {
  return [
    ...form.reihen.flatMap((reihe, i) => reihe.map(([x, y]) => ({ x, y, r: form.r, deckkraft: REIHEN_DECKKRAFT[i] }))),
    { x: form.pult.mitte[0], y: form.pult.mitte[1], r: form.pult.r, deckkraft: 1 },
  ]
}

describe('Die Form des Logos', () => {
  it('die große Fassung hat 4, 6 und 8 Plätze und das Pult — wie logo-form.ts', () => {
    expect(LOGO_GROSS.reihen.map((reihe) => reihe.length)).toEqual([4, 6, 8])
    expect(kreise('logo.svg')).toEqual(ausForm(LOGO_GROSS))
  })

  it('die kleine Fassung hat 3, 5 und 7 Plätze und das Pult — wie logo-form.ts', () => {
    expect(LOGO_KLEIN.reihen.map((reihe) => reihe.length)).toEqual([3, 5, 7])
    expect(kreise('logo-klein.svg')).toEqual(ausForm(LOGO_KLEIN))
  })

  it('der Ausschnitt der App umfasst jede Fassung ganz — nichts ist abgeschnitten', () => {
    for (const form of [LOGO_GROSS, LOGO_KLEIN]) {
      const [x, y, b, h] = form.viewBox.split(' ').map(Number) as [number, number, number, number]
      for (const k of ausForm(form)) {
        expect(k.x - k.r, form.viewBox).toBeGreaterThanOrEqual(x)
        expect(k.y - k.r, form.viewBox).toBeGreaterThanOrEqual(y)
        expect(k.x + k.r, form.viewBox).toBeLessThanOrEqual(x + b)
        expect(k.y + k.r, form.viewBox).toBeLessThanOrEqual(y + h)
      }
    }
  })
})

describe('Die Dateien in der App-Hülle', () => {
  it('jede Datei der App-Hülle liegt in public/ — fehlt eine, scheitert die Installation des Workers', () => {
    // `cache.addAll` bricht beim ersten 404 ab; dann gibt es keinen Offline-Start.
    const sw = readFileSync(`${PUBLIC}sw.js`, 'utf8')
    const liste = /const SHELL = \[([^\]]*)\]/.exec(sw)?.[1] ?? ''
    const dateien = [...liste.matchAll(/'([^']+)'/g)].map((m) => m[1]!).filter((d) => d !== './' && d !== 'index.html')
    expect(dateien, 'SHELL nicht gefunden').toContain('logo-klein.svg')
    for (const datei of dateien) expect(existsSync(`${PUBLIC}${datei}`), datei).toBe(true)
  })

  it('die kleine Fassung ist das Favicon', () => {
    const index = readFileSync(`${WURZEL}index.html`, 'utf8')
    expect(index).toMatch(/<link rel="icon" type="image\/svg\+xml" href="logo-klein\.svg" \/>/)
  })
})
