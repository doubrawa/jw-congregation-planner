/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest'
import { vermessen } from './film-szenen'

/**
 * **Das Handy steht nie unter dem ✕** (Review vom 22.10.2026).
 *
 * Hochkant liegt das ✕ zum Schließen oben über der Bühne — genau über der
 * Ecke des nachgezeichneten Handys, in der die Glocke sitzt. Weil das Handy
 * über den Film langsam steigt, geschah der Tipp auf die Glocke in Szene 4
 * halb unter dem ✕ („Tippe auf die Glocke" — und man sah sie nicht). Seitdem
 * misst `vermessen` das ✕ und lässt das Handy darunter beginnen; quer steht
 * das ✕ über den Worten, dann bleibt der schmale Rand.
 *
 * jsdom rechnet kein Layout: Die Proben geben Bühne und ✕ ihre Lage selbst.
 */

type Rahmen = { left: number; top: number; width: number; height: number }

function film(buehne: Rahmen, kreuz: Rahmen): HTMLElement {
  const wurzel = document.createElement('div')
  wurzel.innerHTML = '<button data-f="schliessen"></button><div data-f="buehne"></div>'
  const setze = (el: Element, r: Rahmen) => {
    el.getBoundingClientRect = () =>
      ({ ...r, x: r.left, y: r.top, right: r.left + r.width, bottom: r.top + r.height, toJSON: () => r }) as DOMRect
  }
  setze(wurzel.querySelector('[data-f="buehne"]')!, buehne)
  setze(wurzel.querySelector('[data-f="schliessen"]')!, kreuz)
  document.body.append(wurzel)
  return wurzel
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('Wo das Handy oben beginnt', () => {
  it('hochkant liegt das ✕ über der Bühne — das Handy beginnt darunter', () => {
    // 390 × 844: die Bühne oben über die ganze Breite, das ✕ oben rechts.
    const m = vermessen(film({ left: 0, top: 0, width: 390, height: 535 }, { left: 334, top: 10, width: 44, height: 44 }))
    expect(m.oben).toBeGreaterThanOrEqual(54)
  })

  it('quer steht das ✕ über den Worten — das Handy bleibt am oberen Rand', () => {
    // 844 × 390: links die Bühne, rechts die Worte mit dem ✕ darüber.
    const breit = vermessen(film({ left: 0, top: 0, width: 422, height: 390 }, { left: 788, top: 10, width: 44, height: 44 }))
    expect(breit.oben).toBeLessThan(20)
  })

  it('wo oben Platz bleibt, wird das Handy dafür kleiner — es ragt nicht unten aus dem Bild', () => {
    const mitKreuz = vermessen(film({ left: 0, top: 0, width: 390, height: 535 }, { left: 334, top: 10, width: 44, height: 44 }))
    const ohneKreuz = vermessen(film({ left: 0, top: 0, width: 390, height: 535 }, { left: 500, top: 10, width: 44, height: 44 }))
    expect(mitKreuz.k).toBeLessThan(ohneKreuz.k)
  })
})
