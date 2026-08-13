/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import type { ReactNode } from 'react'
import {
  AppDispatchContext,
  AppStateContext,
  AppStoreContext,
  type AppState,
  useStaticStore,
} from '../app/context'
import { initialState } from '../app/init'
import { reducer } from '../app/reducer'
import { MeetingTabs } from '../components/MeetingTabs'
import { buildDemoWeeks } from '../data/testdaten'
import { anlassArt } from '../data/anlass'
import { dict } from '../i18n/ui'
import { WochePanel } from './WochePanel'

/**
 * T64 — der Bearbeiten-Reiter und die Ansicht dahinter.
 *
 * Der Befund war ein Bedienelement auf der falschen Ebene: Der
 * Kreisaufseher-Schalter stand im Panel **einer** Zusammenkunft, änderte aber
 * **beide**. Geprüft wird deshalb dreierlei — dass es den Reiter gibt und nur
 * dort, wo er hingehört; dass die Ansicht **beide** Zusammenkünfte zeigt; und
 * dass der Schalter aus dem Zusammenkunfts-Panel verschwunden ist.
 */

function Buehne({ state, children }: { state: AppState; children: ReactNode }) {
  const store = useStaticStore(state)
  return (
    <AppDispatchContext.Provider value={() => {}}>
      <AppStoreContext.Provider value={store}>
        <AppStateContext.Provider value={state}>{children}</AppStateContext.Provider>
      </AppStoreContext.Provider>
    </AppDispatchContext.Provider>
  )
}

afterEach(cleanup)

const t = dict('de')
const basis = (): AppState => ({ ...initialState(), weeks: buildDemoWeeks(), week: 0, planner: true })

describe('Der Bearbeiten-Reiter', () => {
  it('erscheint nur, wenn er angefordert wird', () => {
    const { queryByLabelText, rerender } = render(
      <Buehne state={basis()}>
        <MeetingTabs tab="mid" onChange={() => {}} showFs />
      </Buehne>,
    )
    expect(queryByLabelText(t.einstellungen)).toBeNull()

    rerender(
      <Buehne state={basis()}>
        <MeetingTabs tab="mid" onChange={() => {}} showFs showEdit />
      </Buehne>,
    )
    // Ein Symbol braucht einen vorgelesenen Namen — er kommt aus `einstellungen`,
    // damit kein Schlüssel erfunden werden muss (33 Overlays, ui.test.ts).
    expect(queryByLabelText(t.einstellungen)).not.toBeNull()
  })

  it('schaltet auf „edit" um', () => {
    let gewaehlt: string | null = null
    const { getByLabelText } = render(
      <Buehne state={basis()}>
        <MeetingTabs tab="mid" onChange={(tab) => (gewaehlt = tab)} showFs showEdit />
      </Buehne>,
    )
    fireEvent.click(getByLabelText(t.einstellungen))
    expect(gewaehlt).toBe('edit')
  })
})

describe('Die Wochen-Ansicht', () => {
  it('zeigt die drei Anlässe und „kein Anlass"', () => {
    const { getByLabelText } = render(
      <Buehne state={basis()}>
        <WochePanel />
      </Buehne>,
    )
    const select = getByLabelText(t.einstellungen) as HTMLSelectElement
    expect([...select.options].map((o) => o.value)).toEqual(['', 'co', 'mem', 'kongress'])
    // Der erste Eintrag ist ein Gedankenstrich: er braucht keine Übersetzung.
    expect(select.options[0]?.textContent).toBe('—')
    expect([...select.options].map((o) => o.textContent).slice(1)).toEqual([
      t.coWoche,
      t.memWoche,
      t.kongress,
    ])
  })

  it('zeigt **beide** Zusammenkünfte auf einmal', () => {
    // Vorher ging nur die des offenen Reiters: „Mittwoch statt Dienstag" und
    // „Wochenende entfällt" waren zwei Reiterwechsel.
    const { getAllByRole } = render(
      <Buehne state={basis()}>
        <WochePanel />
      </Buehne>,
    )
    const namen = getAllByRole('switch').map((el) => el.getAttribute('aria-label'))
    expect(namen).toEqual([t.tabMid, t.tabWe])
  })

  it('der Kreisaufseher-Schalter steht **nicht** mehr bei einer Zusammenkunft', () => {
    // Genau der Befund, aus dem T64 entstand.
    const { queryByLabelText } = render(
      <Buehne state={basis()}>
        <WochePanel />
      </Buehne>,
    )
    expect(queryByLabelText(t.coWoche)).toBeNull()
  })

  it('zeigt die Termin-Felder erst zum passenden Anlass', () => {
    const ohne = basis()
    const { queryByLabelText, rerender } = render(
      <Buehne state={ohne}>
        <WochePanel />
      </Buehne>,
    )
    expect(queryByLabelText(t.von)).toBeNull()
    expect(queryByLabelText(t.s89Datum)).toBeNull()

    const mit = reducer(ohne, { type: 'setAnlass', art: 'kongress' })
    rerender(
      <Buehne state={mit}>
        <WochePanel />
      </Buehne>,
    )
    expect(anlassArt(mit.weeks[0])).toBe('kongress')
    expect(queryByLabelText(t.von)).not.toBeNull()
    expect(queryByLabelText(t.bis)).not.toBeNull()
  })
})

describe('Der Reiter gilt nur im Planen', () => {
  it('ein Wechsel ins Programm setzt ihn zurück', () => {
    // Das Programm ist für alle nur lesend — dort gibt es nichts zu bearbeiten.
    const stand = { ...basis(), screen: 'planen' as const, tab: 'edit' as const }
    expect(reducer(stand, { type: 'navigate', screen: 'programm' }).tab).toBe('mid')
  })

  it('der Treffpunkt-Reiter überlebt den Wechsel ins Programm dagegen', () => {
    // Gegenprobe zur Regel: „nicht überall erlaubt" heißt nicht „nirgends".
    const stand = { ...basis(), screen: 'planen' as const, tab: 'fs' as const }
    expect(reducer(stand, { type: 'navigate', screen: 'programm' }).tab).toBe('fs')
  })
})
