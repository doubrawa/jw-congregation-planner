/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import {
  AppDispatchContext,
  AppStateContext,
  AppStoreContext,
  type AppState,
  useStaticStore,
} from '../app/context'
import { initialState } from '../app/init'
import type { MyTask, SubstituteReq } from '../data/types'
import { ConfirmDialog } from './ConfirmDialog'

/**
 * T69 — „Einspringen" beim Öffnen der App, wie das Bestätigen.
 *
 * Ein Ersatzgesuch erreichte bis dahin nur, wer von selbst unter „Aufgaben"
 * nachsah oder über einen Push hereinkam. Wer die App einfach öffnete, erfuhr
 * nie davon — und der Abgesagte blieb ohne Ersatz. Jetzt liegt beides in
 * **einem** Blatt: die Bestätigung als Pflicht, das Gesuch als Bitte.
 */

const aufgabe = (id: string): MyTask => ({
  id, title: 'Bibellesung', rolle: '', date: 'Di, 8. September', chip: '',
  status: 'offen', s89: null,
})

const gesuch = (key: string, title = 'Mikrofone'): SubstituteReq => ({
  key, svc: 'mik', title, date: 'Di, 8. September', declinedBy: 'Jonas Berger',
})

function zeige(over: Partial<AppState>) {
  const dispatch = vi.fn()
  const state: AppState = { ...initialState(), ...over }
  function Buehne() {
    const store = useStaticStore(state)
    return (
      <AppDispatchContext.Provider value={dispatch}>
        <AppStoreContext.Provider value={store}>
          <AppStateContext.Provider value={state}>
            <ConfirmDialog />
          </AppStateContext.Provider>
        </AppStoreContext.Provider>
      </AppDispatchContext.Provider>
    )
  }
  return { dispatch, ...render(<Buehne />) }
}

afterEach(cleanup)

const karten = (c: HTMLElement) => [...c.querySelectorAll('.confirm-task')]
const schliessen = (c: HTMLElement) => c.querySelector('.sheet-close')

describe('T69 — das Blatt beim Öffnen zeigt auch Ersatzgesuche', () => {
  it('zeigt ein Gesuch, obwohl nichts zu bestätigen ist', () => {
    const { container } = zeige({ myTasks: [], substituteReqs: [gesuch('k1')] })
    expect(karten(container)).toHaveLength(1)
    expect(karten(container)[0]?.textContent).toContain('Mikrofone')
    // Wer nicht kann, steht dabei — sonst weiß man nicht, worum es geht.
    expect(karten(container)[0]?.textContent).toContain('Jonas Berger')
  })

  it('legt sich weg, solange es nur eine Bitte ist', () => {
    const { container, dispatch } = zeige({ myTasks: [], substituteReqs: [gesuch('k1')] })
    fireEvent.click(schliessen(container)!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'closeConfirm' })
    // Auch der Hintergrund schließt — einspringen muss niemand.
    fireEvent.click(container.querySelector('.confirm-backdrop')!)
    expect(dispatch).toHaveBeenCalledTimes(2)
  })

  it('mit offener Bestätigung bleibt es stehen: kein ✕, kein Hintergrund-Klick', () => {
    const { container, dispatch } = zeige({
      myTasks: [aufgabe('t1')],
      substituteReqs: [gesuch('k1')],
    })
    expect(schliessen(container)).toBeNull()
    fireEvent.click(container.querySelector('.confirm-backdrop')!)
    expect(dispatch).not.toHaveBeenCalled()
    // Beides steht da: die Pflicht zuerst, die Bitte darunter.
    expect(karten(container)).toHaveLength(2)
    expect(container.querySelector('.confirm-subs--nach')).not.toBeNull()
  })

  it('„Übernehmen" nimmt das Gesuch an', () => {
    const { container, dispatch } = zeige({ myTasks: [], substituteReqs: [gesuch('k1')] })
    fireEvent.click(container.querySelector('.confirm-subs .confirm-yes')!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'takeSubstitute', key: 'k1' })
  })

  it('ohne Gesuch bleibt das Blatt, was es war', () => {
    const { container } = zeige({ myTasks: [aufgabe('t1')], substituteReqs: [] })
    expect(container.querySelector('.confirm-subs')).toBeNull()
    expect(container.querySelector('.confirm-foot')).not.toBeNull()
    expect(schliessen(container)).toBeNull()
  })
})
