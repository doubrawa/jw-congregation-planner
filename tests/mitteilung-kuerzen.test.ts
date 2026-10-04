import { describe, expect, it } from 'vitest'
import { cssDateien } from './css-quellen'

/**
 * **In der Glocke steht der Text einer Mitteilung höchstens zwei Zeilen hoch**
 * (Betreiber, 4.10.2026). Eine Sammelmeldung über ein Dutzend Personen streckte
 * die Liste sonst über den ganzen Bildschirm; den ganzen Text zeigt der
 * Tooltip, und ein Tipp führt dorthin, wo die Mitteilung herkommt.
 *
 * jsdom rechnet kein Layout. Gesichert ist hier nur, dass die Regel dasteht und
 * keine andere ihre Anzeige zurücksetzt — ohne `display: -webkit-box` greift
 * `line-clamp` nicht, und nichts meldet das.
 */

type Regel = { datei: string; selektor: string; rumpf: string }

const REGELN: Regel[] = cssDateien().flatMap(([datei, text]) =>
  [...text.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selektor, rumpf]) => ({
    datei,
    selektor: selektor!.trim().replace(/\s+/g, ' '),
    rumpf: rumpf!,
  })),
)

const trifftText = (r: Regel) => /\.notif-row-text(?![\w-])/.test(r.selektor)

describe('Mitteilungstext in der Glocke', () => {
  it('ist auf zwei Zeilen begrenzt', () => {
    const eigene = REGELN.filter((r) => r.selektor === '.notif-row-text')
    expect(eigene, 'genau eine Regel für .notif-row-text').toHaveLength(1)
    const rumpf = eigene[0]!.rumpf
    expect(rumpf).toMatch(/display:\s*-webkit-box/)
    expect(rumpf).toMatch(/-webkit-box-orient:\s*vertical/)
    expect(rumpf).toMatch(/-webkit-line-clamp:\s*2\s*;/)
    expect(rumpf).toMatch(/overflow:\s*hidden/)
  })

  it('und keine andere Regel setzt die Anzeige zurück', () => {
    const fremd = REGELN.filter((r) => trifftText(r) && r.selektor !== '.notif-row-text' && /(^|[;\s])display\s*:/.test(r.rumpf))
    expect(fremd.map((r) => `${r.datei}: ${r.selektor}`)).toEqual([])
  })
})
