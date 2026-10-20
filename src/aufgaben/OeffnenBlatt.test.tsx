/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import {
  AppDispatchContext,
  AppStateContext,
  AppStoreContext,
  type AppState,
  useStaticStore,
} from '../app/context'
import { demoZustand } from '../../tests/testdaten/demo-start'
import type { MyTask, SubstituteReq } from '../data/types'
import { dict } from '../i18n/ui'
import { zahlBinden } from '../i18n/zahl-binden'
import { OeffnenBlatt } from './OeffnenBlatt'

/**
 * **Das Blatt beim Öffnen der App** (T121): offene Zuteilungen zum Bestätigen
 * und — seit T69 — offene Ersatzgesuche. Ein Gesuch erreichte bis dahin nur,
 * wer von selbst unter „Aufgaben" nachsah oder über einen Push hereinkam.
 *
 * Bis zum 12.10.2026 hielt das Blatt, bis alles bestätigt war. Seither legt
 * „Später" es weg; beim nächsten Öffnen liegt es wieder da (das prüft
 * `reducer.test.ts`).
 */

const t = dict('de')

const aufgabe = (id: string, over: Partial<MyTask> = {}): MyTask => ({
  id, title: 'Bibellesung', rolle: '', date: 'Di, 8. September',
  status: 'offen', s89: null, ...over,
})

const gesuch = (key: string, title = 'Mikrofone'): SubstituteReq => ({
  key, svc: 'mik', title, date: 'Di, 8. September', declinedBy: 'Jonas Berger', schonHeute: [],
})

function zeige(over: Partial<AppState>) {
  const dispatch = vi.fn()
  const state: AppState = { ...demoZustand(), ...over }
  function Buehne() {
    const store = useStaticStore(state)
    return (
      <AppDispatchContext.Provider value={dispatch}>
        <AppStoreContext.Provider value={store}>
          <AppStateContext.Provider value={state}>
            <OeffnenBlatt />
          </AppStateContext.Provider>
        </AppStoreContext.Provider>
      </AppDispatchContext.Provider>
    )
  }
  return { dispatch, ...render(<Buehne />) }
}

// Das Herunterwischen der Hülle fragt nach der Bildschirmbreite; jsdom kennt keine.
beforeEach(() => {
  window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia
})
afterEach(cleanup)

const karten = (c: HTMLElement) => [...c.querySelectorAll('.oeffnen-aufgabe')]
const text = (root: Element | null, beschriftung: string) =>
  [...(root?.querySelectorAll('button') ?? [])].filter((b) => b.textContent === beschriftung)

describe('Offene Zuteilungen', () => {
  it('jede offene Aufgabe bekommt eine eigene Karte — die bestätigten nicht', () => {
    const { container } = zeige({
      myTasks: [aufgabe('t1'), aufgabe('t2'), aufgabe('t3', { status: 'bestätigt' })],
      substituteReqs: [],
    })
    expect(karten(container)).toHaveLength(2)
    expect(container.querySelector('.sheet-sub')?.textContent).toBe(zahlBinden(`${t.dashZuBest}: 2`))
  })

  it('„Bestätigen" trifft genau die Aufgabe seiner Karte', () => {
    const { container, dispatch } = zeige({ myTasks: [aufgabe('t1'), aufgabe('t2')], substituteReqs: [] })
    fireEvent.click(text(karten(container)[1]!, t.bestaetigen)[0]!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'confirmTask', id: 't2' })
  })

  it('„Ich kann nicht" öffnet das Absage-Blatt — ebenso für genau diese Aufgabe', () => {
    const { container, dispatch } = zeige({ myTasks: [aufgabe('t1'), aufgabe('t2')], substituteReqs: [] })
    fireEvent.click(text(karten(container)[0]!, t.kannNicht)[0]!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'openAbsage', id: 't1' })
    expect(dispatch.mock.calls.some((c) => c[0].type === 'declineTask')).toBe(false)
  })

  it('„Alle bestätigen" sagt alles auf einmal zu — bei nur einer Aufgabe steht es nicht da', () => {
    const { container, dispatch } = zeige({ myTasks: [aufgabe('t1'), aufgabe('t2')], substituteReqs: [] })
    fireEvent.click(text(container, t.alleBestaetigen)[0]!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'confirmAll' })
    cleanup()
    expect(text(zeige({ myTasks: [aufgabe('t1')], substituteReqs: [] }).container, t.alleBestaetigen)).toHaveLength(0)
  })

  it('„Später", Hintergrund und Escape legen es weg — auch mit offenen Zuteilungen', () => {
    const { container, dispatch } = zeige({ myTasks: [aufgabe('t1')], substituteReqs: [] })
    fireEvent.click(text(container, t.spaeter)[0]!)
    fireEvent.click(container.querySelector('.sheet-backdrop')!)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(dispatch.mock.calls.filter((c) => c[0].type === 'closeConfirm')).toHaveLength(3)
  })

  it('ein ✕ hat es nicht — den Ausgang bietet „Später" unten an', () => {
    const { container } = zeige({ myTasks: [aufgabe('t1')], substituteReqs: [] })
    expect(container.querySelector(`[aria-label="${t.a11yClose}"]`)).toBeNull()
  })
})

describe('T69 — das Blatt beim Öffnen zeigt auch Ersatzgesuche', () => {
  it('zeigt ein Gesuch, obwohl nichts zu bestätigen ist — und nennt, wer nicht kann', () => {
    const { container } = zeige({ myTasks: [], substituteReqs: [gesuch('k1')] })
    expect(container.querySelector('.sheet-title')?.textContent).toBe(t.einspringenTitle)
    expect(karten(container)).toHaveLength(1)
    expect(karten(container)[0]?.textContent).toContain('Mikrofone')
    expect(karten(container)[0]?.textContent).toContain('Jonas Berger')
  })

  it('stehen beide da: die Zuteilung zuerst, die Bitte darunter', () => {
    const { container } = zeige({ myTasks: [aufgabe('t1')], substituteReqs: [gesuch('k1')] })
    expect(karten(container)).toHaveLength(2)
    const bitte = container.querySelector('.oeffnen-gesuche.is-nach')!
    expect(bitte.querySelector('h3')?.textContent).toBe(t.einspringenTitle)
    expect(bitte.textContent).toContain('Mikrofone')
  })

  it('„Übernehmen" nimmt das Gesuch an', () => {
    const { container, dispatch } = zeige({ myTasks: [], substituteReqs: [gesuch('k1')] })
    fireEvent.click(text(container, t.uebernehmen)[0]!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'takeSubstitute', key: 'k1' })
  })

  it('was ich an dem Tag schon habe, steht vor dem Zusagen da', () => {
    const { container } = zeige({
      myTasks: [],
      substituteReqs: [{ ...gesuch('k1'), schonHeute: [{ text: 'Vorsitz', lang: 'u' }] }],
    })
    expect(container.querySelector('.hinweis-schon')?.textContent).toContain('Vorsitz')
  })
})
