import { describe, expect, it } from 'vitest'
import { cssDateien, cssRegeln, type CssRegel } from './css-quellen'

/**
 * **Ein Titel je Breite unter „Planung"** (T144, Betreiber 25.10.2026: „auf
 * dem handy sollte die überschrift ‚Zusammenkünfte' oben rechts vom zurück
 * button sein und nicht eine zeile darunter").
 *
 * Am Handy tragen Zurück und Titel den Kopf der Unterseite
 * (`UnterseiteKopf`), die Zeile des Bereichstitels darunter ist aus; ab Tablet
 * ist es umgekehrt. Fehlte eine der beiden Regeln, stünde der Titel zweimal
 * da — oder am Handy wieder eine Zeile unter dem Pfeil. jsdom rechnet kein
 * Layout, und unter vitest kommt CSS leer an: Gesichert sind hier die Regeln.
 */

const CSS = Object.fromEntries(cssDateien())

/** Blendet eine Regel in dieser Abfrage den Selektor aus? */
function aus(datei: string, selektor: string, abfrage: RegExp): CssRegel[] {
  return cssRegeln(CSS[datei] ?? '').filter(
    (r) =>
      abfrage.test(r.abfragen) &&
      r.selektoren.includes(selektor) &&
      r.deklarationen.some(([e, w]) => e === 'display' && w === 'none'),
  )
}

describe('Der Titel im Kopf am Handy steht ganz da (Review 25.10.2026)', () => {
  /** Was für den Selektor ohne Abfrage gilt — spätere Regeln überschreiben frühere. */
  const werte = (selektor: string) =>
    new Map(
      cssRegeln(CSS['app/menue.css'] ?? '')
        .filter((r) => !r.abfragen && r.selektoren.includes(selektor))
        .flatMap((r) => r.deklarationen),
    )

  it.each(['.planenkopf-titel', '.unterseitenkopf-titel'])('%s bricht um und trennt, statt mit „…" abzuschneiden', (selektor) => {
    const w = werte(selektor)
    expect(w.get('hyphens')).toBe('auto')
    expect(w.get('overflow-wrap')).toMatch(/break-word|anywhere/)
    expect(w.has('text-overflow'), 'text-overflow').toBe(false)
    expect(w.get('white-space'), 'white-space').toBeUndefined()
  })

  it('beim Planen rückt „Fertig" in die nächste Zeile, bevor der Titel neben dem Kreuz trennt', () => {
    expect(werte('.planenkopf').get('flex-wrap')).toBe('wrap')
    // Grundmaß der eigene Text: Mit 0 passte „Fertig" immer daneben, und der
    // Titel trennte in einer Lücke von 100 px in vier Zeilen.
    expect(werte('.planenkopf-titel').get('flex')).toBe('1 1 auto')
    // Neben dem Kreuz bleibt er: höchstens die Zeile ohne Kreuz und Lücke.
    expect(werte('.planenkopf-titel').get('max-width')).toMatch(/^calc\(100% - \d+px\)$/)
    expect(werte('.planenkopf > .planen-knopf').get('margin-inline-start')).toBe('auto')
  })
})

describe('Unter „Planung" steht der Titel je Breite einmal', () => {
  it('am Handy ist die Zeile des Bereichstitels aus — Zurück und Titel stehen im Kopf', () => {
    expect(aus('bausteine/bausteine.css', '.bereichstitel--zurueck .bereichstitel-zeile', /max-width:\s*767\.98px/)).toHaveLength(1)
  })

  it('ab Tablet ist der Kopf der Unterseite aus — dort steht die Zeile des Bereichstitels', () => {
    expect(aus('app/menue.css', '.unterseitenkopf', /min-width:\s*768px/)).toHaveLength(1)
  })
})
