import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { FarbModus } from '../src/data/types'

/**
 * **Die beiden Paletten aus `src/styles/tokens.css`** (T121), als Name → Wert —
 * für Proben, die Abschriften der Farben gegen ihre Quelle halten: die
 * Statusleiste im Vorab-Skript von `index.html`, das Chevron der Auswahlfelder.
 * Ein Bild oder ein Skript vor dem Laden kennt keine CSS-Variablen; dort steht
 * die Farbe ein zweites Mal, und nur so eine Probe merkt, wenn sie abweicht.
 */
const TOKENS = readFileSync(fileURLToPath(new URL('../src/styles/tokens.css', import.meta.url)), 'utf8')

const SELEKTOR: Record<FarbModus, string> = {
  hell: ":root[data-theme='hell'] {",
  dunkel: ":root[data-theme='dunkel'] {",
}

/**
 * **Die Farben des Startbilds in der installierten App** (`@media (display-mode:
 * standalone)` in tokens.css) — dort setzt es das Bild von Android fort und
 * gilt in beiden Darstellungen gleich.
 */
export function startbildInstalliert(): Record<string, string> {
  const block = TOKENS.indexOf('@media (display-mode: standalone) {')
  if (block < 0) throw new Error('tokens.css: kein Block für die installierte App')
  const start = TOKENS.indexOf(':root {', block)
  const rumpf = TOKENS.slice(start, TOKENS.indexOf('}', start))
  return Object.fromEntries([...rumpf.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]))
}

export function palette(modus: FarbModus): Record<string, string> {
  const start = TOKENS.indexOf(SELEKTOR[modus])
  if (start < 0) throw new Error(`tokens.css: keine Palette „${modus}"`)
  const rumpf = TOKENS.slice(start, TOKENS.indexOf('\n}', start))
  return Object.fromEntries([...rumpf.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]))
}
