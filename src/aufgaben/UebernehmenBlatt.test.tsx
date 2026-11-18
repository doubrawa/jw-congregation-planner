/** @vitest-environment happy-dom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import {
  AppDispatchContext,
  AppStateContext,
  AppStoreContext,
  type AppState,
  type UebernehmenAuswahl,
  useStaticStore,
} from '../app/context'
import { reducer } from '../app/reducer'
import { demoZustand } from '../../tests/testdaten/demo-start'
import type { OffenerPlatz } from '../data/offene-plaetze'
import type { Notification, SubstituteReq } from '../data/types'
import { dict } from '../i18n/ui'
import { fill } from '../i18n/useT'
import { angebotZu } from './angebot-auswahl'
import { UebernehmenBlatt } from './UebernehmenBlatt'

/**
 * **Übernehmen?** (T185): Der Tipp auf „Übernehmen" trägt nicht mehr gleich
 * ein. Das Blatt legt vor, was man zusagt; erst sein Knopf trägt ein — und
 * benachrichtigt damit die Person, die abgesagt hat, und wer plant.
 */

const t = dict('de')
const GESUCH = '2026-09-07|mid|helper|mik|0'
const PLATZ = '2026-09-07|mid|helper|mik|1'

const gesuch = (over: Partial<SubstituteReq> = {}): SubstituteReq => ({
  key: GESUCH, svc: 'mik', title: 'Mikrofone', date: 'Dienstag, 8. September', declinedBy: 'Bernd Brand',
  schonHeute: [], ...over,
})
const platz = (over: Partial<OffenerPlatz> = {}): OffenerPlatz => ({
  key: PLATZ, title: '', rolle: 'Saalordner', date: 'Dienstag, 8. September', at: null, schonHeute: [], ...over,
})
const notif = (over: Partial<Notification>): Notification => ({
  id: 'n1', type: 'zuteilung', title: 'Ersatz gesucht', text: '', at: '2026-09-07T09:00:00Z', read: false, ...over,
})

function zeige(auswahl: UebernehmenAuswahl, over: Partial<AppState> = {}) {
  const dispatch = vi.fn()
  const state: AppState = { ...demoZustand(), substituteReqs: [gesuch()], offenePlaetze: [platz()], ...over }
  const angebot = angebotZu(auswahl, state)!
  function Buehne() {
    const store = useStaticStore(state)
    return (
      <AppDispatchContext.Provider value={dispatch}>
        <AppStoreContext.Provider value={store}>
          <AppStateContext.Provider value={state}>
            <UebernehmenBlatt angebot={angebot} />
          </AppStateContext.Provider>
        </AppStoreContext.Provider>
      </AppDispatchContext.Provider>
    )
  }
  return { dispatch, ...render(<Buehne />) }
}

beforeEach(() => {
  window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia
})
afterEach(cleanup)

const knopf = (c: HTMLElement, text: string) => [...c.querySelectorAll('button')].find((b) => b.textContent === text)

describe('Ein Ersatzgesuch', () => {
  it('nennt Dienst, Termin und für wen — bevor etwas geschieht', () => {
    const { container, dispatch } = zeige({ art: 'gesuch', key: GESUCH })
    expect(container.querySelector('.sheet-marke')?.textContent).toContain('Mikrofone')
    expect(container.querySelector('.sheet-marke')?.textContent).toContain('8.')
    expect(container.textContent).toContain(fill(t.uebernehmenGesuch, { name: 'Bernd Brand' }))
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('„Übernehmen" trägt genau dieses Gesuch ein', () => {
    const { container, dispatch } = zeige({ art: 'gesuch', key: GESUCH })
    fireEvent.click(knopf(container, t.uebernehmen)!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'takeSubstitute', key: GESUCH })
  })

  it('„Abbrechen" schließt nur — eingetragen wird nichts', () => {
    const { container, dispatch } = zeige({ art: 'gesuch', key: GESUCH })
    fireEvent.click(knopf(container, t.abbrechen)!)
    expect(dispatch.mock.calls.map((c) => c[0])).toEqual([{ type: 'closeUebernehmen' }])
  })

  it('wer übernimmt, hat die Mitteilung zu diesem Gesuch beantwortet — nur diese', () => {
    const { container, dispatch } = zeige(
      { art: 'gesuch', key: GESUCH },
      { notifs: [notif({ id: 'n1', taskId: GESUCH }), notif({ id: 'n2', taskId: 'anderes' })] },
    )
    fireEvent.click(knopf(container, t.uebernehmen)!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'mitteilungGelesen', id: 'n1' })
    expect(dispatch).not.toHaveBeenCalledWith({ type: 'mitteilungGelesen', id: 'n2' })
  })
})

describe('Ein freier Platz', () => {
  it('„Übernehmen" trägt in genau diesen Platz ein — nicht als Ersatz', () => {
    const { container, dispatch } = zeige({ art: 'platz', key: PLATZ })
    expect(container.querySelector('.sheet-marke')?.textContent).toContain('Saalordner')
    fireEvent.click(knopf(container, t.uebernehmen)!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'platzUebernehmen', key: PLATZ })
    expect(dispatch.mock.calls.some((c) => c[0].type === 'takeSubstitute')).toBe(false)
  })

  it('ein Platz hat niemanden, der abgesagt hat — der Satz dazu fehlt', () => {
    const { container } = zeige({ art: 'platz', key: PLATZ })
    expect(container.textContent).not.toContain('kann nicht —')
    cleanup()
    expect(zeige({ art: 'gesuch', key: GESUCH }).container.textContent).toContain('kann nicht —') // Gegenprobe
  })
})

describe('Was man an dem Tag schon hat', () => {
  it('steht im Blatt, wenn es etwas gibt', () => {
    const { container } = zeige(
      { art: 'gesuch', key: GESUCH },
      { substituteReqs: [gesuch({ schonHeute: [{ text: 'Vorsitz', lang: 'u' }] })] },
    )
    expect(container.querySelector('.hinweis-schon')?.textContent).toContain('Vorsitz')
  })

  it('und fehlt, wenn nicht', () => {
    expect(zeige({ art: 'gesuch', key: GESUCH }).container.querySelector('.hinweis-schon')).toBeNull()
  })
})

describe('Nicht mehr angeboten', () => {
  it('ist das Gesuch inzwischen vergeben, gibt es kein Angebot — das Blatt erscheint nicht', () => {
    expect(angebotZu({ art: 'gesuch', key: GESUCH }, { substituteReqs: [], offenePlaetze: [platz()] })).toBeNull()
    expect(angebotZu({ art: 'platz', key: PLATZ }, { substituteReqs: [gesuch()], offenePlaetze: [] })).toBeNull()
  })

  it('Gegenprobe: dieselbe Kennung als anderer Art findet nichts', () => {
    expect(angebotZu({ art: 'platz', key: GESUCH }, { substituteReqs: [gesuch()], offenePlaetze: [platz()] })).toBeNull()
  })
})

describe('Im Zustand', () => {
  it('öffnen merkt die Auswahl, schließen räumt sie ab', () => {
    const s = demoZustand()
    const offen = reducer(s, { type: 'openUebernehmen', auswahl: { art: 'gesuch', key: GESUCH } })
    expect(offen.uebernehmen).toEqual({ art: 'gesuch', key: GESUCH })
    expect(reducer(offen, { type: 'closeUebernehmen' }).uebernehmen).toBeNull()
  })
})
