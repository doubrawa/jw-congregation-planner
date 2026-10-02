import { describe, expect, it } from 'vitest'
import { cssDateien } from './css-quellen'

/**
 * **Wächst die Zeile mit der Schrift, muss der Kasten mitwachsen.**
 *
 * Die Schriftstufe (`--fs`, im Profil 0,9 bis 1,45) skaliert jede Schriftgröße
 * und jede Zeilenhöhe als `calc(<px> * var(--fs))`. Steht daneben eine **feste**
 * Höhe, wird die Zeile größer als ihr Kasten: Die Ziffer im Zählerkreis rutscht
 * unten heraus und wird abgeschnitten.
 *
 * Gefunden am 1.10.2026 bei Stufe 1,45 im Planen-Banner (5–6 px Überstand,
 * gemessen am Element) — und dasselbe Muster als Abschrift im Personen-Hinweis
 * zu Namensdubletten und im Hinweis „Ohne Predigtdienstgruppe". jsdom rechnet
 * kein Layout, ein Screenshot gehört nicht zum Lauf; deshalb liest diese Probe
 * das CSS selbst.
 */

/** Regeln, deren Zeilenhöhe mit `--fs` wächst, deren `height` aber fest in px steht. */
function festeKaesten(css: string): string[] {
  const out: string[] = []
  for (const regel of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const rumpf = regel[2] ?? ''
    if (!/line-height:\s*calc\([^;]*var\(--fs\)/.test(rumpf)) continue
    // `height` für sich — nicht `line-height`, nicht `min-height`.
    const hoehe = /(?:^|[;{\s])height:\s*([\d.]+px)\s*(?:;|$)/m.exec(rumpf)
    if (!hoehe) continue
    const selektor = (regel[1] ?? '').trim().split('\n').pop()?.trim() ?? ''
    out.push(`${selektor} { height: ${hoehe[1]} }`)
  }
  return out
}

const DATEIEN = cssDateien()

describe('Kein fester Kasten um eine mitwachsende Zeile', () => {
  it.each(DATEIEN.map(([pfad]) => pfad))('%s', (pfad) => {
    const inhalt = DATEIEN.find(([p]) => p === pfad)?.[1] ?? ''
    const gefunden = festeKaesten(inhalt)
    expect(gefunden, `${pfad}: ${gefunden.join(' | ')}`).toEqual([])
  })

  it('die Prüfung findet das Muster auch wirklich', () => {
    // Ohne diese Zeile wäre ein zu enger Ausdruck von „alles in Ordnung" nicht
    // zu unterscheiden.
    expect(festeKaesten('.x { height: 22px; line-height: calc(22px * var(--fs)); }')).toEqual([
      '.x { height: 22px }',
    ])
    // Mitwachsende Höhe, feste Zeile, nur Mindesthöhe: alles kein Befund.
    expect(festeKaesten('.x { height: calc(22px * var(--fs)); line-height: calc(22px * var(--fs)); }')).toEqual([])
    expect(festeKaesten('.x { height: 22px; line-height: 22px; }')).toEqual([])
    expect(festeKaesten('.x { min-height: 22px; line-height: calc(22px * var(--fs)); }')).toEqual([])
  })
})
