/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import {
  AppDispatchContext,
  AppStateContext,
  AppStoreContext,
  type AppState,
  useStaticStore,
} from '../app/context'
import { demoZustand } from '../../tests/testdaten/demo-start'
import type { Week } from '../data/types'
import { zahlBinden } from '../i18n/zahl-binden'
import { useWochenImport } from './useWochenImport'

/**
 * **„Geladen bis"** — bis wann Programme vorliegen. Die Zeile trug früher eine
 * feste Beschriftung („Arbeitsheft Sep/Okt 2026"), die nichts über den Stand
 * aussagte. Sie steht auf dem Start, wenn die Programme knapp werden; bis
 * Phase 10 von T121 stand sie auch in den Einstellungen (`ProgrammKarte`).
 * Geprüft wird der Hook, der sie rechnet — mit den beiden Fällen ohne
 * ISO-Datum, die sich am Bildschirm kaum herstellen lassen.
 */
const woche = (patch: Partial<Week> = {}): Week => ({ range: '7.–13. September', book: 'Jeremia', ...patch }) as Week

function Probe() {
  const { geladenBis } = useWochenImport()
  return <p>{geladenBis ?? '—'}</p>
}

/**
 * Bühne mit allen drei Kontexten. Der Speicher gehört seit T41 dazu: `useT`
 * liest über Selektoren, und die gehen am Zustands-Kontext vorbei.
 */
function Buehne({ state }: { state: AppState }) {
  const store = useStaticStore(state)
  return (
    <AppDispatchContext.Provider value={() => {}}>
      <AppStoreContext.Provider value={store}>
        <AppStateContext.Provider value={state}>
          <Probe />
        </AppStateContext.Provider>
      </AppStoreContext.Provider>
    </AppDispatchContext.Provider>
  )
}

const geladenBis = (weeks: Week[], patch: Partial<AppState> = {}): string | null =>
  render(<Buehne state={{ ...demoZustand(), weeks, ...patch }} />).container.textContent

afterEach(cleanup)

describe('„Geladen bis"', () => {
  it('nennt das Ende der spätesten Woche, nicht deren Anfang', () => {
    expect(geladenBis([woche({ start: '2026-08-31' }), woche({ start: '2026-09-07' })])).toBe('13. Sept. 2026')
  })

  it('ohne ISO-Datum den Wochenbereich im Klartext (Demo- und Vorlagenwochen)', () => {
    // Sonst stünde dort gar nichts — die Demo hat keine echten Kalenderdaten.
    // Tag und Monat gebunden wie jede Spanne aus dem Arbeitsheft (`programmSpanne`, T128).
    expect(geladenBis([woche({ range: '28. Sep – 4. Okt' })])).toBe(zahlBinden('28. Sep – 4. Okt'))
  })

  it('der Klartext-Bereich wird in die Versammlungssprache übersetzt', () => {
    // Ohne tp() bliebe hier deutscher Programmtext in einer englischen App.
    expect(geladenBis([woche({ range: '7.–13. September' })], { congLang: 'en' })).toMatch(/September 7–13/)
  })

  it('ganz ohne Wochen nichts — den Satz dazu wählt der Aufrufer', () => {
    expect(geladenBis([])).toBe('—')
  })
})
