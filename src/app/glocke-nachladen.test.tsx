/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/react'
import {
  AppDispatchContext,
  AppStateContext,
  AppStoreContext,
  type AppState,
  useStaticStore,
} from './context'
import { initialState } from './init'
import { NotificationsPanel } from './NotificationsPanel'
import type { Notification } from '../data/types'

/**
 * **Was das Öffnen der Glocke kostet — und was es liefern muss.**
 *
 * Beim Öffnen lief der **volle** Ladevorgang: dreizehn Abfragen, darunter 52
 * Wochen als JSONB, alle Bestätigungen und das Versand-Tagebuch — um fünfzig
 * Zeilen Text anzuzeigen. Wer die App als PWA offen liegen hat und
 * gelegentlich nachsieht, lud damit jedes Mal die ganze Versammlung neu.
 *
 * Das Nachladen selbst ist aber richtig und darf nicht verschwinden: Es gibt
 * kein Realtime-Abo. Ohne es sähe man in der Glocke den Stand vom letzten
 * echten Start — ein zweiter Planer teilt zu, jemand sagt ab, ein Ersatz wird
 * gesucht, und nichts davon käme an.
 *
 * Und es reicht **nicht**, nur die Zeilen zu holen: Eine frische Zuteilung
 * bringt einen Aufgaben-Schlüssel mit, aus dem die Glocke einen
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
vi.mock('./hydrate', () => ({
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

function oeffneGlocke(over: Partial<AppState> = {}) {
  const dispatch = vi.fn()
  const state: AppState = {
    ...initialState(),
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
            <NotificationsPanel />
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

describe('Die Glocke lädt beim Öffnen nach — so wenig wie möglich', () => {
  it('ist nichts Neues da, bleibt es bei der einen Abfrage', async () => {
    const bekannt = notif('n1')
    ladeMitteilungen.mockResolvedValue([bekannt])
    const { dispatch } = oeffneGlocke({ notifs: [bekannt] })

    await waitFor(() => expect(dispatch).toHaveBeenCalled())
    expect(ladeMitteilungen).toHaveBeenCalledTimes(1)
    // Der teure Teil bleibt aus — das ist der ganze Zweck.
    expect(ladeAlles).not.toHaveBeenCalled()
    expect(dispatch).toHaveBeenCalledWith({ type: 'setNotifs', notifs: [bekannt] })
  })

  it('der frische Stand kommt an — auch wenn nur der Gelesen-Haken sich geändert hat', async () => {
    // Ein anderes Gerät hat die Zeile gelesen. Kein neuer Eintrag, aber die
    // Glocke soll den Punkt nicht weiter als ungelesen zeigen.
    ladeMitteilungen.mockResolvedValue([notif('n1', { read: true })])
    const { dispatch } = oeffneGlocke({ notifs: [notif('n1', { read: false })] })

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
     * zeigte die Glocke die frische Zuteilung an und verschwiege genau den
     * Knopf, für den sie den Schlüssel mitbringt.
     */
    ladeMitteilungen.mockResolvedValue([notif('n2', { taskId: 'k' }), notif('n1')])
    const { dispatch } = oeffneGlocke({ notifs: [notif('n1')] })

    await waitFor(() => expect(ladeAlles).toHaveBeenCalledTimes(1))
    // Und dann NICHT zusätzlich die halbe Liste setzen — der volle Lauf bringt
    // sie ohnehin mit, und zwar mit den Wochen dazu.
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'setNotifs' }))
  })

  it('eine gelöschte Zeile verschwindet, ohne alles neu zu laden', async () => {
    // „Alle löschen" auf einem anderen Gerät. Nichts Neues, also keine zweite
    // Stufe — aber die Liste muss leer werden.
    ladeMitteilungen.mockResolvedValue([])
    const { dispatch } = oeffneGlocke({ notifs: [notif('n1')] })

    await waitFor(() => expect(dispatch).toHaveBeenCalled())
    expect(dispatch).toHaveBeenCalledWith({ type: 'setNotifs', notifs: [] })
    expect(ladeAlles).not.toHaveBeenCalled()
  })

  it('ohne Netz bleibt der bisherige Stand stehen', async () => {
    // `null` heißt „nicht gelesen". Die Liste hier zu leeren hieße, dem
    // Betrachter seine Mitteilungen wegen eines Funklochs zu nehmen.
    ladeMitteilungen.mockResolvedValue(null)
    const { dispatch } = oeffneGlocke({ notifs: [notif('n1')] })

    await waitFor(() => expect(ladeMitteilungen).toHaveBeenCalled())
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'setNotifs' }))
    expect(ladeAlles).not.toHaveBeenCalled()
  })

  it('im Demo-Modus wird gar nichts geladen', async () => {
    oeffneGlocke({ congregationId: null, userId: null, notifs: [notif('n1')] })
    await Promise.resolve()
    expect(ladeMitteilungen).not.toHaveBeenCalled()
    expect(ladeAlles).not.toHaveBeenCalled()
  })
})
