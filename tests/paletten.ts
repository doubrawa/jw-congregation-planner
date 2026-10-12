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

export function palette(modus: FarbModus): Record<string, string> {
  const start = TOKENS.indexOf(SELEKTOR[modus])
  if (start < 0) throw new Error(`tokens.css: keine Palette „${modus}"`)
  const rumpf = TOKENS.slice(start, TOKENS.indexOf('\n}', start))
  return Object.fromEntries([...rumpf.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]))
}
