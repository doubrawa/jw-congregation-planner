/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/react'
import {
  AppDispatchContext,
  AppStateContext,
  AppStoreContext,
  type AppState,
  useStaticStore,
} from '../app/context'
import { demoZustand } from '../../tests/testdaten/demo-start'
import type { Notification } from '../data/types'
import { MitteilungenScreen } from './MitteilungenScreen'

/**
 * **Was das Öffnen der Mitteilungen kostet — und was es liefern muss.**
 *
 * Beim Öffnen lief der **volle** Ladevorgang: dreizehn Abfragen, darunter 52
 * Wochen als JSONB, alle Bestätigungen und das Versand-Tagebuch — um fünfzig
 * Zeilen Text anzuzeigen. Wer die App als PWA offen liegen hat und
 * gelegentlich nachsieht, lud damit jedes Mal die ganze Versammlung neu.
 *
 * Das Nachladen selbst ist aber richtig und darf nicht verschwinden: Es gibt
 * kein Realtime-Abo. Ohne es sähe man auf der Seite den Stand vom letzten
 * echten Start — ein zweiter Planer teilt zu, jemand sagt ab, ein Ersatz wird
 * gesucht, und nichts davon käme an.
 *
 * Und es reicht **nicht**, nur die Zeilen zu holen: Eine frische Zuteilung
 * bringt einen Aufgaben-Schlüssel mit, aus dem die Seite einen
 * Bestätigen-Knopf macht — ob sie das darf, entscheidet `state.myTasks`, und
 * das hängt an Wochen und Bestätigungen. Deshalb die zweite Stufe.
 *
 * Diese Datei prüft beide Richtungen. Eine Fassung, die immer voll nachlädt,
 * fällt am ersten Fall; eine, die es nie tut, am dritten.
 */

const ladeMitteilungen = vi.fn()
const ladeAlles = vi.fn()

vi.mock('../lib/data', () => ({
  loadNotifications: (...args: unknown[]) => ladeMitteilungen(...args) as unknown,
}))
vi.mock('../app/hydrate', () => ({
  loadAndHydrate: (...args: unknown[]) => ladeAlles(...args) as unknown,
}))

const notif = (id: string, over: Partial<Notification> = {}): Notification => ({
  id,
  type: 'zuteilung',
  title: 'Neue Zuteilung',
  text: 'Bibellesung',
  at: new Date(Date.now() - 60_000).toISOString(),
  read: false,
  ...over,
})

function oeffneMitteilungen(over: Partial<AppState> = {}) {
  const dispatch = vi.fn()
  const state: AppState = {
    ...demoZustand(),
    dataStatus: 'ready',
    congregationId: 'c1',
    userId: 'u1',
    planner: false,
    notifs: [],
    myTasks: [],
    persons: [],
    weeks: [],
    fsWeeks: [],
    ...over,
  }
  function Buehne() {
    const store = useStaticStore(state)
    return (
      <AppDispatchContext.Provider value={dispatch}>
        <AppStoreContext.Provider value={store}>
          <AppStateContext.Provider value={state}>
            <MitteilungenScreen />
          </AppStateContext.Provider>
        </AppStoreContext.Provider>
      </AppDispatchContext.Provider>
    )
  }
  return { dispatch, ...render(<Buehne />) }
}

beforeEach(() => {
  ladeMitteilungen.mockReset()
  ladeAlles.mockReset()
  ladeAlles.mockResolvedValue(undefined)
  window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia
})
afterEach(cleanup)

describe('Die Mitteilungen laden beim Öffnen nach — so wenig wie möglich', () => {
  it('ist nichts Neues da, bleibt es bei der einen Abfrage', async () => {
    const bekannt = notif('n1')
    ladeMitteilungen.mockResolvedValue([bekannt])
    const { dispatch } = oeffneMitteilungen({ notifs: [bekannt] })

    await waitFor(() => expect(dispatch).toHaveBeenCalled())
    expect(ladeMitteilungen).toHaveBeenCalledTimes(1)
    // Der teure Teil bleibt aus — das ist der ganze Zweck.
    expect(ladeAlles).not.toHaveBeenCalled()
    expect(dispatch).toHaveBeenCalledWith({ type: 'setNotifs', notifs: [bekannt] })
  })

  it('der frische Stand kommt an — auch wenn nur der Gelesen-Haken sich geändert hat', async () => {
    // Ein anderes Gerät hat die Zeile gelesen. Kein neuer Eintrag, aber die
    // Seite soll sie nicht weiter als neu zeigen.
    ladeMitteilungen.mockResolvedValue([notif('n1', { read: true })])
    const { dispatch } = oeffneMitteilungen({ notifs: [notif('n1', { read: false })] })

    await waitFor(() => expect(dispatch).toHaveBeenCalled())
    expect(dispatch).toHaveBeenCalledWith({
      type: 'setNotifs',
      notifs: [expect.objectContaining({ id: 'n1', read: true })],
    })
    expect(ladeAlles).not.toHaveBeenCalled()
  })

  it('ist eine NEUE Zeile dabei, läuft der volle Ladevorgang nach', async () => {
    /*
     * Die Zeile bringt einen Aufgaben-Schlüssel mit; ob daraus ein
     * Bestätigen-Knopf wird, entscheidet `state.myTasks`. Ohne den Nachlauf
     * zeigte die Seite die frische Zuteilung an und verschwiege genau den
     * Knopf, für den sie den Schlüssel mitbringt.
     */
    ladeMitteilungen.mockResolvedValue([notif('n2', { taskId: 'k' }), notif('n1')])
    const { dispatch } = oeffneMitteilungen({ notifs: [notif('n1')] })

    await waitFor(() => expect(ladeAlles).toHaveBeenCalledTimes(1))
    // Und dann NICHT zusätzlich die halbe Liste setzen — der volle Lauf bringt
    // sie ohnehin mit, und zwar mit den Wochen dazu.
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'setNotifs' }))
  })

  it('eine gelöschte Zeile verschwindet, ohne alles neu zu laden', async () => {
    // Ein Ersatzgesuch ist vergeben — der Server räumt „Ersatz gesucht" aus
    // allen Glocken. Nichts Neues, also keine zweite Stufe — aber die Liste
    // muss leer werden.
    ladeMitteilungen.mockResolvedValue([])
    const { dispatch } = oeffneMitteilungen({ notifs: [notif('n1')] })

    await waitFor(() => expect(dispatch).toHaveBeenCalled())
    expect(dispatch).toHaveBeenCalledWith({ type: 'setNotifs', notifs: [] })
    expect(ladeAlles).not.toHaveBeenCalled()
  })

  it('ohne Netz bleibt der bisherige Stand stehen', async () => {
    // `null` heißt „nicht gelesen". Die Liste hier zu leeren hieße, dem
    // Betrachter seine Mitteilungen wegen eines Funklochs zu nehmen.
    ladeMitteilungen.mockResolvedValue(null)
    const { dispatch } = oeffneMitteilungen({ notifs: [notif('n1')] })

    await waitFor(() => expect(ladeMitteilungen).toHaveBeenCalled())
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'setNotifs' }))
    expect(ladeAlles).not.toHaveBeenCalled()
  })

  it('„Alle löschen", während das Nachladen noch läuft: Die alte Liste kommt nicht zurück (T140)', async () => {
    // Review 24.10.2026: Die Abfrage beim Öffnen kann länger dauern als zwei
    // Tipps auf „Alle löschen" (Token-Erneuerung nach über einer Stunde). Kam
    // sie danach an, setzte sie den Stand von vor dem Löschen wieder ein.
    let liefern: (n: Notification[]) => void = () => {}
    ladeMitteilungen.mockReturnValue(new Promise<Notification[]>((r) => (liefern = r)))
    const dispatch = vi.fn()
    const vorher: AppState = {
      ...demoZustand(),
      dataStatus: 'ready',
      congregationId: 'c1',
      userId: 'u1',
      planner: false,
      notifs: [notif('n1'), notif('n2', { read: true })],
      myTasks: [],
      persons: [],
      weeks: [],
      fsWeeks: [],
    }
    function Buehne({ state }: { state: AppState }) {
      const store = useStaticStore(state)
      return (
        <AppDispatchContext.Provider value={dispatch}>
          <AppStoreContext.Provider value={store}>
            <AppStateContext.Provider value={state}>
              <MitteilungenScreen />
            </AppStateContext.Provider>
          </AppStoreContext.Provider>
        </AppDispatchContext.Provider>
      )
    }
    const { rerender } = render(<Buehne state={vorher} />)
    await waitFor(() => expect(ladeMitteilungen).toHaveBeenCalledTimes(1))
    // Gelöscht (`clearNotifs`), bevor die Abfrage zurückkommt — mit einer neuen Zeile darin.
    rerender(<Buehne state={{ ...vorher, notifs: [] }} />)
    liefern([notif('n3'), notif('n1'), notif('n2', { read: true })])
    await new Promise((r) => setTimeout(r, 0))
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'setNotifs' }))
    expect(ladeAlles).not.toHaveBeenCalled()
  })

  it('im Demo-Modus wird gar nichts geladen', async () => {
    oeffneMitteilungen({ congregationId: null, userId: null, notifs: [notif('n1')] })
    await Promise.resolve()
    expect(ladeMitteilungen).not.toHaveBeenCalled()
    expect(ladeAlles).not.toHaveBeenCalled()
  })
})
