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
import { initialState } from '../app/init'
import { dict } from '../i18n/ui'
import type { MyTask, Notification, S89Payload } from '../data/types'
import { NotificationsPanel } from '../app/NotificationsPanel'
import { MyTaskSheet } from './MyTaskSheet'
import { S89Sheet } from './S89Sheet'

/**
 * **Die drei Overlays, die dem Verkündiger gehören.**
 *
 * Ein Verkündiger sieht von der App im Wesentlichen dreierlei: die Glocke, das
 * Blatt zu seiner Aufgabe und das S-89-Formular. Alle drei waren ungeprüft.
 *
 * Fachlich hängt daran der ganze **Bestätigungs-Flow**: bestätigen, absagen,
 * eine Absage zurücknehmen. Er hat drei Zustände und für jeden andere
 * Handlungen — steht die falsche da, sagt jemand ab, der zusagen wollte. Und
 * beim Hilfsdienst zieht das Absagen eine Ersatzsuche nach sich; darauf muss
 * hingewiesen werden, bevor getippt wird, nicht danach.
 */

const t = dict('de')

const notif = (over: Partial<Notification> = {}): Notification => ({
  id: 'n1', type: 'zuteilung', title: 'Neue Zuteilung', text: 'Bibellesung',
  at: new Date(Date.now() - 60_000).toISOString(), read: false, ...over,
})

const task = (over: Partial<MyTask> = {}): MyTask => ({
  id: '2026-09-07|mid|part|0|1|0', title: 'Bibellesung', rolle: 'Leser',
  date: 'Dienstag, 8. September · 19:00', chip: '', s89: null,
  status: 'offen', at: Date.now() + 86_400_000, ...over,
})

function zeige(
  was: 'notif' | 'myTask' | 's89',
  over: Partial<AppState> = {},
  payload?: S89Payload,
) {
  const dispatch = vi.fn()
  const state: AppState = {
    ...initialState(),
    dataStatus: 'ready', congregationId: 'c1', userId: 'u1', planner: false,
    notifs: [], myTasks: [], persons: [], weeks: [], fsWeeks: [],
    ...over,
  }
  function Buehne() {
    const store = useStaticStore(state)
    return (
      <AppDispatchContext.Provider value={dispatch}>
        <AppStoreContext.Provider value={store}>
          <AppStateContext.Provider value={state}>
            {was === 'notif' && <NotificationsPanel />}
            {was === 'myTask' && <MyTaskSheet />}
            {was === 's89' && <S89Sheet payload={payload!} />}
          </AppStateContext.Provider>
        </AppStoreContext.Provider>
      </AppDispatchContext.Provider>
    )
  }
  return { dispatch, ...render(<Buehne />) }
}

const knopf = (c: HTMLElement, sel: string) => c.querySelector<HTMLButtonElement>(sel)

beforeEach(() => {
  window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia
})
afterEach(cleanup)

describe('Die Mitteilungen', () => {
  it('sind ein modaler Dialog mit Titel', () => {
    const { container } = zeige('notif')
    const dlg = container.querySelector('.notif-panel')!
    expect(dlg.getAttribute('role')).toBe('dialog')
    expect(dlg.getAttribute('aria-modal')).toBe('true')
    expect(container.querySelector('.notif-title')?.textContent).toBe(t.mitteilungen)
  })

  it('Hintergrund-Klick und Escape schließen', () => {
    const { container, dispatch } = zeige('notif')
    fireEvent.click(container.querySelector('.notif-backdrop')!)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(dispatch.mock.calls.filter((c) => c[0].type === 'closeNotifs')).toHaveLength(2)
  })

  it('Ungelesenes hebt sich ab, Gelesenes nicht', () => {
    const { container } = zeige('notif', {
      notifs: [notif({ id: 'n1', read: false }), notif({ id: 'n2', read: true })],
    })
    const zeilen = [...container.querySelectorAll('.notif-row')]
    expect(zeilen[0]!.className).toContain('is-unread')
    expect(zeilen[1]!.className).not.toContain('is-unread')
  })

  it('der kanonisch deutsche Titel aus der Datenbank wird übersetzt', () => {
    // In der Datenbank steht „Neue Zuteilung"; angezeigt wird die Sprache des
    // Lesers. Ohne das stünde die halbe Glocke auf Deutsch.
    const { container } = zeige('notif', { notifs: [notif({ title: 'Neue Zuteilung' })] })
    expect(container.querySelector('.notif-row-title')?.textContent).toBe(t.notifZuteilung)
  })

  it('ein unbekannter Titel bleibt stehen, statt zu verschwinden', () => {
    const { container } = zeige('notif', { notifs: [notif({ title: 'Etwas Neues' })] })
    expect(container.querySelector('.notif-row-title')?.textContent).toBe('Etwas Neues')
  })

  it('jede Zeile nennt, wie lange sie her ist — als Form, nicht als fertiger Satz', () => {
    // Der Zeitstempel steht ISO in der Datenbank; die Form entsteht beim
    // Anzeigen. Stünde dort ein gebauter deutscher Satz, bliebe er deutsch.
    const zweiStunden = new Date(Date.now() - 2 * 3600_000).toISOString()
    const { container } = zeige('notif', { notifs: [notif({ at: zweiStunden })] })
    expect(container.querySelector('.notif-row-time')?.textContent).toBe('vor 2 Stunden')
  })

  it('ein unlesbarer Zeitstempel bleibt leer — nicht „Invalid Date"', () => {
    const { container } = zeige('notif', { notifs: [notif({ at: 'kaputt' })] })
    expect(container.querySelector('.notif-row-time')?.textContent).toBe('')
  })

  it('„Alle gelesen" meldet sie als gelesen', () => {
    const { container, dispatch } = zeige('notif', { notifs: [notif()] })
    fireEvent.click(knopf(container, '.notif-mark-read')!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'markAllRead' })
  })

  it('„Alle löschen" steht nur da, solange es etwas zu löschen gibt', () => {
    expect(knopf(zeige('notif').container, '.notif-clear')).toBeNull()
    cleanup()
    const { container, dispatch } = zeige('notif', { notifs: [notif()] })
    fireEvent.click(knopf(container, '.notif-clear')!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'clearNotifs' })
  })
})

describe('Aus der Mitteilung heraus bestätigen', () => {
  it('eine offene eigene Aufgabe lässt sich hier gleich bestätigen', () => {
    const eigene = task({ id: 'T1', status: 'offen' })
    const { container, dispatch } = zeige('notif', {
      notifs: [notif({ taskId: 'T1' })], myTasks: [eigene],
    })
    fireEvent.click(knopf(container, '.notif-confirm')!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'confirmTask', id: 'T1' })
  })

  it('eine schon bestätigte bietet es nicht mehr an', () => {
    const { container } = zeige('notif', {
      notifs: [notif({ taskId: 'T1' })], myTasks: [task({ id: 'T1', status: 'bestätigt' })],
    })
    expect(knopf(container, '.notif-confirm')).toBeNull()
  })

  it('eine abgesagte ebenso wenig — dort wäre „Bestätigen" ein Rückschritt ohne Hinweis', () => {
    const { container } = zeige('notif', {
      notifs: [notif({ taskId: 'T1' })], myTasks: [task({ id: 'T1', status: 'verhindert' })],
    })
    expect(knopf(container, '.notif-confirm')).toBeNull()
  })

  it('eine Mitteilung ohne Aufgabenbezug hat nichts zu bestätigen', () => {
    const { container } = zeige('notif', {
      notifs: [notif({ taskId: undefined })], myTasks: [task({ id: 'T1' })],
    })
    expect(knopf(container, '.notif-confirm')).toBeNull()
  })

  it('und eine, deren Aufgabe es nicht mehr gibt, auch nicht', () => {
    // Der Planer hat umgeteilt: die Mitteilung steht noch, die Aufgabe ist weg.
    const { container } = zeige('notif', { notifs: [notif({ taskId: 'T-weg' })], myTasks: [task()] })
    expect(knopf(container, '.notif-confirm')).toBeNull()
  })
})

describe('Das Blatt zur eigenen Aufgabe — drei Zustände, drei Angebote', () => {
  const mitAufgabe = (over: Partial<MyTask> = {}) => {
    const eigene = task(over)
    return zeige('myTask', { myTasks: [eigene], myTaskId: eigene.id })
  }

  it('nennt Aufgabe und Termin', () => {
    const { container } = mitAufgabe()
    expect(container.querySelector('.confirm-task-title')?.textContent).toContain('Bibellesung')
    expect(container.querySelector('.confirm-task-date')?.textContent).toContain('8. September')
  })

  it('offen: bestätigen oder absagen', () => {
    const { container, dispatch } = mitAufgabe({ status: 'offen' })
    expect(knopf(container, '.confirm-yes')?.textContent).toContain(t.bestaetigen)
    expect(knopf(container, '.confirm-no')?.textContent).toBe(t.kannNicht)
    fireEvent.click(knopf(container, '.confirm-yes')!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'confirmTask', id: task().id })
  })

  it('bestätigt: der Zustand steht da, und man kann noch absagen', () => {
    const { container, dispatch } = mitAufgabe({ status: 'bestätigt' })
    expect(container.querySelector('.mytask-status')?.textContent).toContain(t.bestaetigt)
    expect(knopf(container, '.confirm-yes')).toBeNull()
    expect(knopf(container, '.confirm-no')?.textContent).toBe(t.absagen)
    fireEvent.click(knopf(container, '.confirm-no')!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'declineTask', id: task().id })
  })

  it('verhindert: die Absage lässt sich zurücknehmen — es ist keine Einbahnstraße', () => {
    const { container, dispatch } = mitAufgabe({ status: 'verhindert' })
    expect(container.querySelector('.mytask-status--verh')?.textContent).toBe(t.verhindertChip)
    expect(knopf(container, '.confirm-no')).toBeNull()
    expect(knopf(container, '.confirm-yes')?.textContent).toContain(t.dochBestaetigen)
    fireEvent.click(knopf(container, '.confirm-yes')!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'confirmTask', id: task().id })
  })

  it('beim Hilfsdienst steht der Hinweis auf die Ersatzsuche — VOR dem Absagen', () => {
    const { container } = zeige('myTask', {
      myTasks: [task({ id: '2026-09-07|mid|helper|mik|0', status: 'offen' })],
      myTaskId: '2026-09-07|mid|helper|mik|0',
    })
    expect(container.querySelector('.mytask-hint')?.textContent).toBe(t.ersatzHint)
  })

  it('bei einem Programmpunkt nicht — dort sucht niemand Ersatz', () => {
    expect(mitAufgabe().container.querySelector('.mytask-hint')).toBeNull()
  })

  it('nach dem Absagen steht der Hinweis nicht mehr — die Suche läuft schon', () => {
    const { container } = zeige('myTask', {
      myTasks: [task({ id: '2026-09-07|mid|helper|mik|0', status: 'verhindert' })],
      myTaskId: '2026-09-07|mid|helper|mik|0',
    })
    expect(container.querySelector('.mytask-hint')).toBeNull()
  })

  it('das ✕, der Hintergrund und Escape schließen alle drei', () => {
    // Escape fehlte hier — ausgerechnet in einer der beiden Dateien, wegen
    // derer `useEscape` überhaupt herausgelöst wurde. Am Schreibtisch ist die
    // Taste der gewohnte Weg hinaus; das Blatt blieb stehen.
    const { container, dispatch } = mitAufgabe()
    fireEvent.click(knopf(container, '.mytask-close')!)
    fireEvent.click(container.querySelector('.confirm-backdrop')!)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(dispatch.mock.calls.filter((c) => c[0].type === 'closeMyTask')).toHaveLength(3)
  })

  it('zeigt gar nichts, wenn die Aufgabe inzwischen weg ist — statt abzustürzen', () => {
    const { container } = zeige('myTask', { myTasks: [], myTaskId: 'gibt-es-nicht' })
    expect(container.querySelector('.confirm-modal')).toBeNull()
  })
})

describe('Das S-89-Formular', () => {
  const PAYLOAD: S89Payload = {
    name: 'Anton Alt',
    partner: 'Bernd Brand',
    date: 'Di, 8. September · 19:00',
    type: 'Gespräche beginnen · Informell',
    point: 'lmd Lektion 1',
  }

  it('nennt sich beim Namen — das Formular heißt S-89', () => {
    const { container } = zeige('s89', {}, PAYLOAD)
    expect(container.querySelector('.s89-eyebrow')?.textContent).toBe('S-89')
    expect(container.querySelector('.sheet-title')?.textContent).toBe(t.s89Title)
  })

  it('ist ein modaler Dialog und trägt die Karte mit den Daten', () => {
    const { container } = zeige('s89', {}, PAYLOAD)
    const dlg = container.querySelector('.sheet--s89')!
    expect(dlg.getAttribute('role')).toBe('dialog')
    expect(dlg.textContent).toContain('Anton Alt')
  })

  it('✕, Hintergrund und Escape schließen alle drei', () => {
    const { container, dispatch } = zeige('s89', {}, PAYLOAD)
    fireEvent.click(container.querySelector('.sheet-close')!)
    fireEvent.click(container.querySelector('.sheet-backdrop--s89')!)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(dispatch.mock.calls.filter((c) => c[0].type === 'closeS89')).toHaveLength(3)
  })
})
