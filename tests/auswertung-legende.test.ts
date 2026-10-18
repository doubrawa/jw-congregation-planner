import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * **Jedes Muster der Legende hat die Farbe seiner Felder** (Auswertung, T126).
 *
 * Muster und Feld sind getrennte CSS-Regeln: `.aw-muster.is-hilfsdienst` in der
 * Legende, `.aw-woche.is-hilfsdienst` in den Wochen einer Person. Bis zum
 * 17.10.2026 trug das eine `--text3`, das andere `--umriss`, und das „nie" im
 * Wartebalken `--text2` statt `--text3` wie seine Legende (Review). Die Legende
 * erklärte damit eine Farbe, die im Diagramm nicht vorkam.
 *
 * Gelesen wird die Datei selbst — unter vitest ist CSS leer.
 */

const CSS = readFileSync(fileURLToPath(new URL('../src/auswertung/auswertung.css', import.meta.url)), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')

/** Je Selektor die Farb-Tokens seiner Regeln: `var(--x)` in `background` und `border…`. */
function farben(): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>()
  for (const [, kopf, rumpf] of CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const tokens = new Set<string>()
    for (const [, eigenschaft, wert] of (rumpf ?? '').matchAll(/([\w-]+)\s*:\s*([^;]+);/g)) {
      if (!/^(background|border)/.test(eigenschaft ?? '')) continue
      for (const [, token] of (wert ?? '').matchAll(/var\(--([\w-]+)\)/g)) tokens.add(token ?? '')
    }
    for (const selektor of (kopf ?? '').split(',').map((s) => s.trim())) {
      if (tokens.size > 0) out.set(selektor, new Set([...(out.get(selektor) ?? []), ...tokens]))
    }
  }
  return out
}

/** Jedes Legendenmuster mit den Feldern, die es erklärt. */
const PAARE: Array<[string, string[]]> = [
  ['.aw-muster.is-andere', ['.aw-wert']],
  ['.aw-muster.is-leer', ['.aw-nie', '.aw-mini.is-nie', '.aw-zelle.is-nie']],
  ['.aw-muster.is-band', ['.aw-band']],
  ['.aw-muster.is-strich', ['.aw-strich']],
  ['.aw-muster.is-ueber', ['.aw-wert.is-ueber']],
  ['.aw-muster.is-unter', ['.aw-luecke']],
  ['.aw-muster.is-hilfsdienst', ['.aw-wert.is-hilfsdienst', '.aw-woche.is-hilfsdienst']],
  ['.aw-muster.is-stufe1', ['.aw-zelle.is-stufe1']],
  ['.aw-muster.is-stufe2', ['.aw-zelle.is-stufe2']],
  ['.aw-muster.is-stufe3', ['.aw-zelle.is-stufe3']],
  ['.aw-muster.is-ohne', ['.aw-zelle.is-ohne-bereich']],
  ['.aw-muster.is-aufgabe', ['.aw-woche.is-aufgabe']],
  ['.aw-muster.is-abwesend', ['.aw-woche.is-abwesend']],
]

describe('Legende und Diagramm der Auswertung sprechen dieselbe Farbe', () => {
  const f = farben()

  it('jedes Muster und jedes Feld hat eine Farbe — sonst prüfte die Probe nichts', () => {
    const ohne = PAARE.flatMap(([muster, felder]) => [muster, ...felder]).filter((s) => !f.get(s)?.size)
    expect(ohne).toEqual([])
  })

  it.each(PAARE)('%s', (muster, felder) => {
    const soll = [...(f.get(muster) ?? [])]
    for (const feld of felder) expect([...(f.get(feld) ?? [])], feld).toEqual(soll)
  })

  it('jedes Muster der Legende steht in der Liste', () => {
    // Ein neues Muster ohne Paar fiele sonst still durch.
    const muster = [...CSS.matchAll(/\.aw-muster\.is-[\w-]+/g)].map((m) => m[0])
    expect([...new Set(muster)].sort()).toEqual(PAARE.map(([m]) => m).sort())
  })
})
