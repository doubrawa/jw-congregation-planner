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

describe('Unter „Planung" steht der Titel je Breite einmal', () => {
  it('am Handy ist die Zeile des Bereichstitels aus — Zurück und Titel stehen im Kopf', () => {
    expect(aus('bausteine/bausteine.css', '.bereichstitel--zurueck .bereichstitel-zeile', /max-width:\s*767\.98px/)).toHaveLength(1)
  })

  it('ab Tablet ist der Kopf der Unterseite aus — dort steht die Zeile des Bereichstitels', () => {
    expect(aus('app/menue.css', '.unterseitenkopf', /min-width:\s*768px/)).toHaveLength(1)
  })
})
