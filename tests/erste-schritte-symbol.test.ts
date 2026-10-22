import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * **Das Symbol im Film ist das der App** (22.10.2026).
 *
 * Der Film „Erste Schritte" zeigt, wie die App auf dem Startbildschirm des
 * Handys landet. Das Symbol dort zeichnet er selbst (`FilmBilder.tsx`) — in
 * den Farben `--symbol-grund` und `--symbol-platz`. Stimmten sie nicht mit
 * `public/logo.svg` überein, suchte jemand nach dem Film ein Symbol, das es so
 * nicht gibt. Das Pult ist Minze wie überall (`--akzent`, logo-farben.test.ts).
 */

const WURZEL = fileURLToPath(new URL('../', import.meta.url))

function token(name: string): string | undefined {
  const css = readFileSync(`${WURZEL}src/styles/tokens.css`, 'utf8')
  return new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css)?.[1]?.toLowerCase()
}

describe('Das Symbol im Film', () => {
  const svg = readFileSync(`${WURZEL}public/logo.svg`, 'utf8')
  it('hat die Kachel der App-Datei', () => {
    expect(token('--symbol-grund')).toBe(/<rect\b[^>]*\bfill="(#[0-9a-fA-F]{6})"/.exec(svg)?.[1]?.toLowerCase())
  })

  it('hat ihre Plätze', () => {
    expect(token('--symbol-platz')).toBe(/<g fill="(#[0-9a-fA-F]{6})"/.exec(svg)?.[1]?.toLowerCase())
  })
})
