import { describe, expect, it } from 'vitest'
import { deklarationen } from './css-quellen'

/**
 * **Welcher Tag gewählt ist, sieht man auf einen Blick** (Betreiber,
 * 22.10.2026: „welcher der beiden tage selektiert ist, zeigt nur ein schmaler
 * rand um den button. die darstellung muss deutlicher sein als nur so ein
 * schmaler rand").
 *
 * Die Karten der beiden Zusammenkünfte (`MeetingTabs`, beim Ansehen und beim
 * Planen) zeigen den gewählten Tag seitdem wie die übrigen Wahlen der App: in
 * der Textfarbe hinterlegt, die Schrift in der Farbe des Grunds — auch Datum
 * und Uhrzeit, die sonst blass auf der dunklen Fläche stünden. Das Paar
 * Grund auf Text prüft `npm run contrast` in beiden Darstellungen.
 *
 * jsdom rechnet kein CSS; gesichert ist hier, dass die Regeln dastehen.
 */

const DATEI = 'components/components.css'

describe('Die Karten der Zusammenkünfte', () => {
  it('der gewählte Tag ist in der Textfarbe hinterlegt, nicht nur umrandet', () => {
    const gewaehlt = deklarationen(DATEI, '.meeting-tab.is-active')
    expect(gewaehlt).toMatch(/background:\s*var\(--text\)/)
    expect(gewaehlt).toMatch(/color:\s*var\(--grund\)/)
  })

  it('Datum und Uhrzeit auf der gewählten Karte stehen in der Farbe des Grunds, nicht blass', () => {
    expect(deklarationen(DATEI, '.meeting-tab.is-active .meeting-tab-wann')).toMatch(/color:\s*var\(--grund\)/)
  })
})
