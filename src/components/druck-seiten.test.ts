import { describe, expect, it } from 'vitest'
import { seiten } from './druck-seiten'

/**
 * **Die Aufteilung steht im Bauplan** (T71): Wie viele Zettel auf ein Blatt
 * kommen, entscheidet nicht der Browser. Chrome brach sowohl ein CSS-Raster
 * als auch eine durchgehende Tabelle nach zwei Reihen um, obwohl die dritte
 * noch aufs Blatt gepasst hätte — aus „6 je Seite" wurden stillschweigend 4.
 * Deshalb je Blatt eine eigene Tabelle, und die Aufteilung ist hier
 * nachrechenbar. Heute für die Anmelde-Zettel.
 */
describe('seiten', () => {
  const zettel = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `P${i}` }))

  it('sechs je Seite: drei Reihen, der Rest auf die nächste', () => {
    const s = seiten(zettel(8), 6)
    expect(s).toHaveLength(2)
    expect(s[0]).toHaveLength(3)
    expect(s[1]).toHaveLength(1)
  })

  it('vier je Seite: zwei Reihen', () => {
    const s = seiten(zettel(8), 4)
    expect(s.map((seite) => seite.length)).toEqual([2, 2])
  })

  it('die letzte Reihe darf halb leer bleiben', () => {
    const s = seiten(zettel(3), 6)
    expect(s[0]?.[1]).toEqual([expect.objectContaining({ name: 'P2' }), undefined])
  })

  it('ohne Zettel keine Seite', () => {
    expect(seiten([], 6)).toEqual([])
  })
})
