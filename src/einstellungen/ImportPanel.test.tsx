/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { AppContext, type AppState } from '../app/context'
import { initialState } from '../app/init'
import type { Week } from '../data/types'
import { ImportPanel } from './ImportPanel'

/**
 * Die Statuszeile trug früher eine feste Beschriftung („Arbeitsheft Sep/Okt
 * 2026"), die nichts über den Stand aussagte. Diese Tests halten fest, dass
 * dort jetzt der tatsächlich geladene Zeitraum steht — inklusive der beiden
 * Fälle ohne ISO-Datum, die sich am Bildschirm kaum herstellen lassen.
 */
const woche = (patch: Partial<Week> = {}): Week =>
  ({ range: '7.–13. September', book: 'Jeremia', current: false, ...patch }) as Week

function zeige(weeks: Week[], patch: Partial<AppState> = {}) {
  const state: AppState = { ...initialState(), weeks, ...patch }
  return render(
    <AppContext.Provider value={{ state, dispatch: () => {} }}>
      <ImportPanel />
    </AppContext.Provider>,
  )
}

afterEach(cleanup)

describe('ImportPanel — „Geladen bis"', () => {
  it('nennt das Ende der spätesten Woche, nicht deren Anfang', () => {
    const { getByText } = zeige([woche({ start: '2026-08-31' }), woche({ start: '2026-09-07' })])
    expect(getByText(/Geladen bis 13\. Sept\. 2026/)).toBeTruthy()
  })

  it('zählt daneben die geladenen Wochen', () => {
    const { getByText } = zeige([woche({ start: '2026-09-07' }), woche({ start: '2026-09-14' })])
    expect(getByText('2 Wochen geladen')).toBeTruthy()
  })

  it('ohne ISO-Datum den Wochenbereich im Klartext (Demo- und Vorlagenwochen)', () => {
    // Sonst stünde dort gar nichts — die Demo hat keine echten Kalenderdaten.
    const { getByText } = zeige([woche({ range: '28. Sep – 4. Okt' })])
    expect(getByText('Geladen bis 28. Sep – 4. Okt')).toBeTruthy()
  })

  it('der Klartext-Bereich wird in die Versammlungssprache übersetzt', () => {
    // Ohne tp() bliebe hier deutscher Programmtext in einer englischen App.
    const { getByText } = zeige([woche({ range: '7.–13. September' })], { congLang: 'Englisch' })
    expect(getByText(/September 7–13/)).toBeTruthy()
  })

  it('ganz ohne Wochen ein eigener Satz statt einer leeren Angabe', () => {
    const { getByText, queryByText } = zeige([])
    expect(getByText('Noch keine Woche geladen')).toBeTruthy()
    // „0 Wochen geladen" daneben wäre nur Rauschen.
    expect(queryByText(/Wochen geladen/)).toBeNull()
  })
})
