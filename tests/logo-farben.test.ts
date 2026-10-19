import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { startbildInstalliert } from './paletten'

/**
 * **Das Logo in den Farben des Designs** (T121, Phase 10; Entscheid des
 * Betreibers am 15.10.2026: „A · Graphit"): Die Dateien in `public/` — und
 * damit App-Icons, iOS-Icon und Favicon — tragen die Farben der dunklen
 * Darstellung. Kachel wie die Karte, Plätze in der Textfarbe, das Pult in
 * Minze. Bis dahin standen dort Petrol, Creme und Gold vom 4. Oktober, während
 * die App längst Graphit · Minze zeigte.
 *
 * **Das Manifest in der Kachelfarbe:** Android zeichnet beim Start der
 * installierten App das maskable-Icon auf `background_color` und färbt die
 * Bedienleiste unten mit `theme_color` — fehlt die, scheint
 * `background_color` durch, mit hellen Knöpfen. Bis zum 15.10.2026 waren
 * beide Weiß: weiße Knöpfe auf weißer Leiste (Bildschirmfoto des Betreibers,
 * dunkle Darstellung). Dunkel tragen die Knöpfe in beiden Darstellungen, und
 * das randfüllende maskable-Icon (`make-icons.mjs`) geht auf dem
 * Startbildschirm auf, statt als Quadrat dazustehen.
 */
const WURZEL = fileURLToPath(new URL('../', import.meta.url))

/** Ein Token der dunklen Palette aus `tokens.css`. */
function dunkel(token: string): string {
  const css = readFileSync(`${WURZEL}src/styles/tokens.css`, 'utf8')
  const block = /:root\[data-theme='dunkel'\]\s*\{([^}]*)\}/.exec(css)?.[1] ?? ''
  const wert = new RegExp(`${token}:\\s*(#[0-9a-fA-F]{6})`).exec(block)?.[1]
  if (!wert) throw new Error(`${token} fehlt in der dunklen Palette`)
  return wert.toLowerCase()
}

/** Kachel, Plätze und Pult einer Logo-Datei. */
function farben(datei: string): { kachel?: string; platz?: string; pult?: string } {
  const svg = readFileSync(`${WURZEL}public/${datei}`, 'utf8')
  return {
    kachel: /<rect\b[^>]*\bfill="(#[0-9a-fA-F]{6})"/.exec(svg)?.[1]?.toLowerCase(),
    platz: /<g fill="(#[0-9a-fA-F]{6})"/.exec(svg)?.[1]?.toLowerCase(),
    // Das Pult ist der einzige Kreis mit eigener Füllung. Seine Höhe steht hier
    // nicht: Sie hat sich am 16.10.2026 geändert, die Farbe nicht.
    pult: /<circle cx="256" cy="[\d.]+" r="\d+" fill="(#[0-9a-fA-F]{6})"/.exec(svg)?.[1]?.toLowerCase(),
  }
}

describe('Die Farben des Logos', () => {
  it.each(['logo.svg', 'logo-klein.svg'])('%s: Kachel wie die Karte, Plätze in der Textfarbe, Pult in Minze', (datei) => {
    expect(farben(datei)).toEqual({ kachel: dunkel('--karte'), platz: dunkel('--text'), pult: dunkel('--akzent') })
  })

  it('das Manifest färbt Startbildschirm und Bedienleiste in der Kachelfarbe', () => {
    const manifest = JSON.parse(readFileSync(`${WURZEL}public/manifest.webmanifest`, 'utf8')) as Record<string, string>
    const kachel = farben('logo.svg').kachel
    expect(manifest.background_color?.toLowerCase()).toBe(kachel)
    expect(manifest.theme_color?.toLowerCase()).toBe(kachel)
  })

  /*
   * **Das Startbild der installierten App setzt das Bild von Android fort**
   * (19.10.2026): derselbe Grund wie `background_color`, das Logo in denselben
   * Farben wie das Symbol darauf. Wiche eine ab, wechselte die Farbe in dem
   * Augenblick, in dem die App das Bild übernimmt.
   */
  it('das Startbild der installierten App trägt die Farben des Bilds von Android', () => {
    const manifest = JSON.parse(readFileSync(`${WURZEL}public/manifest.webmanifest`, 'utf8')) as Record<string, string>
    const start = startbildInstalliert()
    expect(start['start-grund']).toBe(manifest.background_color?.toLowerCase())
    expect(start['start-platz']).toBe(dunkel('--text'))
    expect(start['start-pult']).toBe(dunkel('--akzent'))
    expect(start['start-text']).toBe(dunkel('--text2'))
  })
})
