/** @vitest-environment happy-dom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { demoZustand } from '../../tests/testdaten/demo-start'
import { AppDispatchContext, AppStateContext, AppStoreContext, type AppState, useStaticStore } from '../app/context'
import type { Week } from '../data/types'
import { MeetingTabs } from './MeetingTabs'

/**
 * **Die Karten der Zusammenkünfte nach einem Wechsel der Regelzeit**
 * (13.11.2026): Jede Woche zeigt den Tag und die Uhrzeit, die in ihr gelten.
 * Ohne Woche — wenn noch kein Programm geholt ist — steht da, was heute gilt,
 * nicht die Grundzeit von vor dem Wechsel.
 */

/** Seit der Woche vom 7. September am Donnerstag um halb acht, davor am Dienstag um sieben. */
const ZEITEN = {
  mid: { wd: 2, time: '19:00', spaeter: [{ ab: '2026-09-07', wd: 4, time: '19:30' }] },
  we: { wd: 0, time: '10:00' },
}

const woche = (start: string): Week => {
  const leer = { date: '', end: '', sections: [], helpers: {} }
  return { range: '', book: '', start, mid: { ...leer }, we: { ...leer } }
}

function zeige(week?: Week) {
  const state: AppState = { ...demoZustand(), lang: 'de', congregation: { name: 'Probe', hall: '', times: ZEITEN } }
  function Buehne() {
    const store = useStaticStore(state)
    return (
      <AppDispatchContext.Provider value={() => {}}>
        <AppStoreContext.Provider value={store}>
          <AppStateContext.Provider value={state}>
            <MeetingTabs tab="mid" onChange={() => {}} week={week} />
          </AppStateContext.Provider>
        </AppStoreContext.Provider>
      </AppDispatchContext.Provider>
    )
  }
  const { container } = render(<Buehne />)
  const karte = container.querySelector('.meeting-tab')!
  return [karte.querySelector('.meeting-tab-name')?.textContent, karte.querySelector('.meeting-tab-wann')?.textContent]
}

beforeEach(() => vi.useFakeTimers({ toFake: ['Date'] }))
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('Die Karten der Zusammenkünfte nach einem Wechsel der Regelzeit', () => {
  it('mit Woche: vor dem Wechsel der alte Tag, ab seiner Woche der neue', () => {
    expect(zeige(woche('2026-08-31'))).toEqual(['Dienstag', '1.9. · 19:00'])
    cleanup()
    expect(zeige(woche('2026-09-07'))).toEqual(['Donnerstag', '10.9. · 19:30'])
  })

  it('ohne Woche: was heute gilt — nicht die Grundzeit von vor dem Wechsel', () => {
    vi.setSystemTime(new Date(2026, 8, 9, 9)) // Mittwoch, 9. September
    expect(zeige()).toEqual(['Donnerstag', '19:30'])
  })

  it('Gegenprobe: Eine Woche vor dem Wechsel steht ohne Woche noch der Dienstag da', () => {
    vi.setSystemTime(new Date(2026, 8, 2, 9)) // Mittwoch, 2. September
    expect(zeige()).toEqual(['Dienstag', '19:00'])
  })
})
