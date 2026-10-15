import { describe, expect, it } from 'vitest'
import { blaetterVerteilen } from './verteilen'

/**
 * **Blöcke auf Blätter verteilen** — so viele, wie passen, in ihrer
 * Reihenfolge. Der Entwurf legt zwei Wochen auf ein Monatsblatt; eine
 * Versammlung mit sieben Hilfsdiensten und langen Namen braucht aber mehr Platz
 * als das Szenario mit vier (gemessen am 15.10.2026: 501 px je Woche, 912 px
 * Platz). Eine feste Zahl je Blatt schnitt dann das Ende ab.
 */
describe('blaetterVerteilen', () => {
  it('legt Blöcke aufs selbe Blatt, solange sie samt Abstand passen', () => {
    expect(blaetterVerteilen([400, 400, 400], 900, 18)).toEqual([
      { indizes: [0, 1], ueberlang: false },
      { indizes: [2], ueberlang: false },
    ])
  })

  it('der Abstand zählt mit — ohne ihn passten zwei, mit ihm nicht', () => {
    expect(blaetterVerteilen([450, 450], 905, 18)).toEqual([
      { indizes: [0], ueberlang: false },
      { indizes: [1], ueberlang: false },
    ])
    expect(blaetterVerteilen([450, 450], 918, 18)).toEqual([{ indizes: [0, 1], ueberlang: false }])
  })

  it('die Reihenfolge bleibt — ein kurzer Block rückt nicht nach vorn in eine Lücke', () => {
    // Eine Woche später gehört nicht vor eine frühere, nur weil sie dort Platz hätte.
    expect(blaetterVerteilen([600, 500, 200], 900, 10).map((b) => b.indizes)).toEqual([[0], [1, 2]])
  })

  it('ein Block, höher als ein Blatt, bekommt eins für sich — und der nächste ein neues', () => {
    expect(blaetterVerteilen([300, 1200, 300], 900, 10)).toEqual([
      { indizes: [0], ueberlang: false },
      { indizes: [1], ueberlang: true },
      { indizes: [2], ueberlang: false },
    ])
  })

  it('die nächste Zeile einer Tabelle schließt ohne Abstand an — so passen mehr aufs Blatt', () => {
    // 3 × 300 = 900 passt genau; mit zwei Abständen von 10 nicht mehr.
    expect(blaetterVerteilen([300, 300, 300], 900, 10).map((b) => b.indizes)).toEqual([[0, 1], [2]])
    expect(blaetterVerteilen([300, 300, 300], 900, 10, [false, true, true]).map((b) => b.indizes)).toEqual([[0, 1, 2]])
  })

  it('ohne Blöcke ein leeres Blatt — sonst druckte der Bogen gar nichts', () => {
    expect(blaetterVerteilen([], 900, 10)).toEqual([{ indizes: [], ueberlang: false }])
  })
})
