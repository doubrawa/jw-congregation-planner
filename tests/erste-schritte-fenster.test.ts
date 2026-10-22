import { describe, expect, it } from 'vitest'
import { cssDateien, cssRegeln } from './css-quellen'

/**
 * **Der Film als Fenster nur, wo es hoch genug ist** (Review vom 22.10.2026).
 *
 * Am Desktop steht der Film „Erste Schritte" als Fenster in der Mitte. Galt
 * das ab 920 px Breite allein, bekam ein großes Handy quer (iPhone Pro Max,
 * 932 × 430) ein Fenster von 440 × 396: hochkant gesetzt, das Handy auf ein
 * Drittel geschrumpft, der Knopf „Pause" herausgerollt. Dort gehört der ganze
 * Schirm her, die Worte neben dem Bild.
 *
 * jsdom rechnet kein Layout und unter vitest kommt CSS leer an: Gesichert ist
 * hier die Regel, die es im Browser richtet.
 */

const CSS = Object.fromEntries(cssDateien())['erste-schritte/erste-schritte.css'] ?? ''

describe('Das Fenster des Films', () => {
  it('gilt nur bei genug Breite und genug Höhe', () => {
    const fenster = cssRegeln(CSS).filter(
      (r) => r.selektoren.includes('.film') && r.deklarationen.some(([e, w]) => e === 'width' && w === '440px'),
    )
    expect(fenster).toHaveLength(1)
    const abfrage = fenster[0]?.abfragen ?? ''
    expect(abfrage).toMatch(/min-width:\s*920px/)
    const hoehe = Number(/min-height:\s*(\d+)px/.exec(abfrage)?.[1] ?? 0)
    // Höher als ein Handy quer (430), damit es dort den ganzen Schirm bekommt.
    expect(hoehe, abfrage).toBeGreaterThan(430)
  })
})
