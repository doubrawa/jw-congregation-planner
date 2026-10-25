import { describe, expect, it } from 'vitest'
import type { Rechte } from '../data/rechte'
import { hatPlanungsWahl, zurueckInDerPlanung } from './bereich'

/**
 * **Wohin Zurück unter „Planung" führt** (T144) — die Rechnung allein, für
 * jeden Weg hinein. Wie die Wege in der App aussehen, prüfen
 * `zurueck-am-handy.test.tsx` (echter Verlauf) und `shell.test.tsx` (der Kopf).
 */

const PLANER: Rechte = { admin: false, zuteilen: true, gruppe: null }
const AUFSEHER: Rechte = { admin: false, zuteilen: false, gruppe: 'g1' }

describe('zurueckInDerPlanung', () => {
  it('die Seite der Wochen führt zur Wahl', () => {
    for (const mitSpalte of [false, true]) {
      expect(zurueckInDerPlanung('wochen', null, PLANER, mitSpalte)).toBe('planung')
    }
  })

  it('ein Plan von der Seite der Wochen führt dorthin zurück — wo die Wochen daneben stehen, zur Wahl', () => {
    expect(zurueckInDerPlanung('planen', 'wochen', PLANER, false)).toBe('wochen')
    expect(zurueckInDerPlanung('planen', 'wochen', PLANER, true)).toBe('planung')
  })

  it('ein Plan direkt von der Wahl führt zur Wahl', () => {
    for (const mitSpalte of [false, true]) {
      expect(zurueckInDerPlanung('planen', 'planung', PLANER, mitSpalte)).toBe('planung')
    }
  })

  it('aus der Ansicht oder von außen gibt es keinen Weg hinauf — dann gelten ✕ und „Fertig"', () => {
    for (const von of ['ansicht', null] as const) {
      expect(zurueckInDerPlanung('planen', von, PLANER, false), String(von)).toBeNull()
    }
  })

  it('ohne Wahl (der Gruppenaufseher) auch nicht', () => {
    expect(hatPlanungsWahl(AUFSEHER)).toBe(false)
    expect(zurueckInDerPlanung('planen', 'planung', AUFSEHER, false)).toBeNull()
  })

  it('auf anderen Bildschirmen nicht — auch wenn noch eine Herkunft im Zustand steht', () => {
    // Ein abgewiesener Sprung ins Planen landet im Programm; `planenVon` steht dann noch da.
    for (const screen of ['programm', 'planung', 'start', 'mitteilungen'] as const) {
      expect(zurueckInDerPlanung(screen, 'wochen', PLANER, false), screen).toBeNull()
    }
  })
})
