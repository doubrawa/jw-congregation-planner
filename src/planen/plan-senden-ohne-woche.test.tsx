/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render } from '@testing-library/react'

/**
 * **„Plan senden" ohne Woche — geklickt, nicht nur angezeigt** (T120).
 *
 * Das öffentliche Zeugnisgeben hat seine eigene Box (`ZeugnisSendenPanel`),
 * die über alle kommenden Schichten sendet, nicht je Woche. Bis zum 3.10.2026
 * klickte kein Test den Knopf: Eine Box, die den Plan der Woche schickt, wäre
 * grün geblieben, ebenso ein falscher Kalendertag oder eine Antwort, die
 * nirgends ankommt.
 */
vi.mock('../lib/data', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  sendZeugnisPlan: vi.fn(),
  sendPlan: vi.fn(),
}))
vi.mock('../app/hydrate', () => ({ loadAndHydrate: vi.fn().mockResolvedValue(undefined) }))

import {
  AppDispatchContext,
  AppStateContext,
  AppStoreContext,
  type AppState,
  useStaticStore,
} from '../app/context'
import { loadAndHydrate } from '../app/hydrate'
import { demoZustand } from '../../tests/testdaten/demo-start'
import { dict } from '../i18n/ui'
import { fill } from '../i18n/useT'
import { sendPlan, sendZeugnisPlan, type PlanVersand } from '../lib/data'
import { PlanenScreen } from './PlanenScreen'

const t = dict('de')

/** Ein zugeteilter, unbestätigter Eintrag im Zeugnisgeben. */
const ZEUGNIS: Partial<AppState> = {
  tab: 'fs',
  fsBereich: 'zeugnis',
  ozTermine: [{ id: 't1', wd: 3, von: '10:00', bis: '12:00', ort: 'Marktplatz', plaetze: 2 }],
  ozEintraege: [{ id: 'e1', terminId: 't1', datum: '2026-09-09', pid: 'p1', selbst: false }],
}

function zeige(over: Partial<AppState> = {}) {
  const dispatch = vi.fn()
  const state: AppState = {
    ...demoZustand(),
    screen: 'planen',
    planner: true,
    dataStatus: 'ready',
    congregationId: 'c1',
    userId: 'u1',
    confirmations: {},
    sentLog: {},
    ...ZEUGNIS,
    ...over,
  }
  function Buehne() {
    const store = useStaticStore(state)
    return (
      <AppDispatchContext.Provider value={dispatch}>
        <AppStoreContext.Provider value={store}>
          <AppStateContext.Provider value={state}>
            <PlanenScreen />
          </AppStateContext.Provider>
        </AppStoreContext.Provider>
      </AppDispatchContext.Provider>
    )
  }
  return { dispatch, ...render(<Buehne />) }
}

const box = (c: HTMLElement) => c.querySelector('.plan-senden') as HTMLElement | null
const sendeKnopf = (c: HTMLElement) =>
  [...(box(c)?.querySelectorAll('button') ?? [])].find((b) => b.textContent === t.planSenden || b.textContent === '…')!

/** Eine Antwort, die erst auf Zuruf kommt — damit der Zwischenstand zu sehen ist. */
function aufZuruf() {
  let antworten!: (v: PlanVersand | null) => void
  const versprochen = new Promise<PlanVersand | null>((r) => (antworten = r))
  return { versprochen, antworten }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 8, 7, 9, 0)) // Montag, 7. September 2026
  vi.mocked(sendZeugnisPlan).mockReset()
  vi.mocked(sendPlan).mockReset()
  vi.mocked(loadAndHydrate).mockClear()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('„Plan senden" im Zeugnisgeben', () => {
  it('ruft die eigene Function mit dem Kalendertag — nicht den Plan der Woche', async () => {
    const { versprochen, antworten } = aufZuruf()
    vi.mocked(sendZeugnisPlan).mockReturnValue(versprochen)
    const { container, dispatch } = zeige()
    fireEvent.click(sendeKnopf(container))

    expect(sendZeugnisPlan).toHaveBeenCalledTimes(1)
    expect(sendZeugnisPlan).toHaveBeenCalledWith('2026-09-07')
    expect(sendPlan).not.toHaveBeenCalled()
    // Während es läuft: gesperrt, ein zweiter Druck schickt nichts doppelt.
    expect(sendeKnopf(container).disabled).toBe(true)
    fireEvent.click(sendeKnopf(container))
    expect(sendZeugnisPlan).toHaveBeenCalledTimes(1)

    await act(async () => antworten({ personen: 2, ohneKonto: ['Karl Onto'] }))
    expect(dispatch).toHaveBeenCalledWith({ type: 'showToast', text: fill(t.toastPlanGesendet, { n: 2 }) })
    // Wer kein Konto hat, steht danach in der Box — der Planer spricht ihn selbst an.
    expect(box(container)?.textContent).toContain(fill(t.planSendenOhneKonto, { namen: 'Karl Onto' }))
    // Und nachgeladen wird, damit die Zahl am Knopf zum Tagebuch passt.
    expect(loadAndHydrate).toHaveBeenCalledWith(dispatch, 'u1', { silent: true })
  })

  it('niemand Neues: eigener Hinweis, kein Name', async () => {
    vi.mocked(sendZeugnisPlan).mockResolvedValue({ personen: 0, ohneKonto: [] })
    const { container, dispatch } = zeige()
    await act(async () => fireEvent.click(sendeKnopf(container)))
    expect(dispatch).toHaveBeenCalledWith({ type: 'showToast', text: t.toastPlanNichts })
    expect(box(container)?.querySelector('.plan-senden-ohne')).toBeNull()
  })

  it('scheitert der Aufruf, meldet es der Schreibfehler-Hinweis — und nichts wird nachgeladen', async () => {
    vi.mocked(sendZeugnisPlan).mockResolvedValue(null)
    const { container, dispatch } = zeige()
    await act(async () => fireEvent.click(sendeKnopf(container)))
    expect(dispatch).toHaveBeenCalledWith({ type: 'showToast', text: t.toastSpeicherFehler })
    expect(loadAndHydrate).not.toHaveBeenCalled()
    // Der Knopf ist wieder frei für einen zweiten Versuch.
    expect(sendeKnopf(container).disabled).toBe(false)
  })

  it('offline (Momentaufnahme) steht die Box gar nicht da', () => {
    const { container } = zeige({ staleAt: Date.now() - 3_600_000 })
    expect(box(container)).toBeNull()
  })
})
