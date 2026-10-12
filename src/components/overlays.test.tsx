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
import { dict } from '../i18n/ui'
import type { MyTask, Notification, S89Payload } from '../data/types'
import { NotificationsPanel } from '../app/NotificationsPanel'
import { AbsageBlatt } from '../aufgaben/AbsageBlatt'
import { AufgabeBlatt } from '../aufgaben/AufgabeBlatt'
import { S89Sheet } from './S89Sheet'

/**
 * **Die drei Overlays, die dem Verkündiger gehören.**
 *
 * Ein Verkündiger sieht von der App im Wesentlichen dreierlei: die Glocke, das
 * Blatt zu seiner Aufgabe (seit T121 mit dem Absage-Blatt dahinter) und das
 * S-89-Formular. Alle drei waren ungeprüft.
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
  date: 'Dienstag, 8. September · 19:00', s89: null,
  status: 'offen', at: Date.now() + 86_400_000, ...over,
})

function zeige(
  was: 'notif' | 'myTask' | 'absage' | 's89',
  over: Partial<AppState> = {},
  payload?: S89Payload,
) {
  const dispatch = vi.fn()
  const state: AppState = {
    ...demoZustand(),
    dataStatus: 'ready', congregationId: 'c1', userId: 'u1', planner: false,
    notifs: [], myTasks: [], persons: [], weeks: [], fsWeeks: [],
    ...over,
  }
  // Wie die Hülle (AppShell): ein Blatt nur, solange es seine Aufgabe gibt.
  const meine = state.myTasks.find((x) => x.id === state.myTaskId)
  const abzusagen = state.myTasks.find((x) => x.id === state.absageId)
  function Buehne() {
    const store = useStaticStore(state)
    return (
      <AppDispatchContext.Provider value={dispatch}>
        <AppStoreContext.Provider value={store}>
          <AppStateContext.Provider value={state}>
            {was === 'notif' && <NotificationsPanel />}
            {was === 'myTask' && meine && <AufgabeBlatt task={meine} />}
            {was === 'absage' && abzusagen && <AbsageBlatt task={abzusagen} />}
            {was === 's89' && <S89Sheet payload={payload!} />}
          </AppStateContext.Provider>
        </AppStoreContext.Provider>
      </AppDispatchContext.Provider>
    )
  }
  return { dispatch, ...render(<Buehne />) }
}

const knopf = (c: HTMLElement, sel: string) => c.querySelector<HTMLButtonElement>(sel)
/** Ein Knopf an seiner Beschriftung. */
const text = (c: HTMLElement, beschriftung: string) =>
  [...c.querySelectorAll('button')].find((b) => b.textContent === beschriftung)

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
    const { container } = zeige('notif', { notifs: [notif()] })
    expect(knopf(container, '.notif-clear')?.textContent).toBe(t.alleLoeschen)
  })

  it('„Alle löschen" fragt einmal nach — erst der zweite Tipp löscht', () => {
    // Gelöscht wird endgültig; bis zum 1.10.2026 genügte ein einziger Fehltipp.
    const { container, dispatch } = zeige('notif', { notifs: [notif()] })
    const clear = () => knopf(container, '.notif-clear')!
    fireEvent.click(clear())
    expect(dispatch.mock.calls.some((c) => c[0].type === 'clearNotifs')).toBe(false)
    expect(clear().textContent).toBe(t.loeschenSicher)
    expect(clear().className).toContain('is-armed')
    fireEvent.click(clear())
    expect(dispatch).toHaveBeenCalledWith({ type: 'clearNotifs' })
  })

  it('„Alle gelesen" entschärft ein bewaffnetes „Alle löschen"', () => {
    const { container } = zeige('notif', { notifs: [notif()] })
    fireEvent.click(knopf(container, '.notif-clear')!)
    fireEvent.click(knopf(container, '.notif-mark-read')!)
    expect(knopf(container, '.notif-clear')?.textContent).toBe(t.alleLoeschen)
  })

  it('ohne Mitteilungen sagt die Glocke es — statt eines nackten Kopfes', () => {
    const { container } = zeige('notif')
    expect(container.querySelector('.notif-empty')?.textContent).toBe(t.keineMitteilungen)
    // Und es steht kein Knopf da, der nichts zu tun hätte.
    expect(knopf(container, '.notif-mark-read')).toBeNull()
  })

  it('die eigene, lokal entstandene Absage-Meldung sieht ein Verkündiger nicht — sie gilt den Admins', () => {
    const lokal = notif({ id: 'lokal', type: 'verhindert', title: 'Verhinderung gemeldet', local: true })
    const { container } = zeige('notif', { notifs: [lokal], planner: false })
    expect(container.querySelectorAll('.notif-row')).toHaveLength(0)
    expect(container.querySelector('.notif-empty')).toBeTruthy()
    cleanup()
    const admin = zeige('notif', { notifs: [lokal], planner: true })
    expect(admin.container.querySelectorAll('.notif-row')).toHaveLength(1)
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

  it('eine Absage nie — auch wenn ihr Schlüssel inzwischen die eigene offene Aufgabe ist', () => {
    // Seit dem 4.10.2026 trägt die Absage den Schlüssel der abgesagten
    // Aufgabe. Übernimmt der Planer den Platz selbst, ist es seine — an der
    // Meldung über die Absage stünde sonst „Bestätigen".
    const absage = notif({ type: 'verhindert', title: 'Verhinderung gemeldet', taskId: 'T1' })
    const { container } = zeige('notif', { notifs: [absage], myTasks: [task({ id: 'T1' })], planner: true })
    expect(knopf(container, '.notif-confirm')).toBeNull()
  })
})

describe('Ein Tipp auf die Mitteilung führt dorthin, wo sie herkommt (4.10.2026)', () => {
  const typen = (dispatch: ReturnType<typeof vi.fn>) => dispatch.mock.calls.map((c) => c[0].type as string)

  it('die Zeile ist ein Knopf; „Bestätigen" steht daneben, nicht darin', () => {
    const { container } = zeige('notif', { notifs: [notif({ taskId: 'T1' })], myTasks: [task({ id: 'T1' })] })
    const link = knopf(container, '.notif-row-link')!
    expect(link.tagName).toBe('BUTTON')
    expect(link.querySelector('.notif-row-title')?.textContent).toBe(t.notifZuteilung)
    // Geschachtelte Knöpfe gibt es nicht — der Browser risse sie auseinander.
    expect(link.querySelector('.notif-confirm')).toBeNull()
    expect(knopf(container, '.notif-confirm')).not.toBeNull()
  })

  it('eine ungelesene gilt danach als gelesen, dann geht es zum Ziel', () => {
    const { container, dispatch } = zeige('notif', {
      notifs: [notif({ id: 'n7', taskId: 'T1' })], myTasks: [task({ id: 'T1' })],
    })
    fireEvent.click(knopf(container, '.notif-row-link')!)
    expect(dispatch.mock.calls.map((c) => c[0])).toEqual([
      { type: 'mitteilungGelesen', id: 'n7' },
      { type: 'navigate', screen: 'aufgaben' },
      { type: 'openMyTask', id: 'T1' },
    ])
  })

  it('eine gelesene wird nicht noch einmal gemeldet', () => {
    const { container, dispatch } = zeige('notif', { notifs: [notif({ read: true })] })
    fireEvent.click(knopf(container, '.notif-row-link')!)
    expect(typen(dispatch)).toEqual(['navigate'])
  })

  it('offline springt sie trotzdem — ohne „gelesen", das dort nur „nur lesen" hervorriefe', () => {
    const { container, dispatch } = zeige('notif', { notifs: [notif()], staleAt: Date.now() - 3600_000 })
    fireEvent.click(knopf(container, '.notif-row-link')!)
    expect(typen(dispatch)).toEqual(['navigate'])
  })

  it('„Bestätigen" bestätigt nur — es springt nicht zusätzlich weg', () => {
    const { container, dispatch } = zeige('notif', { notifs: [notif({ taskId: 'T1' })], myTasks: [task({ id: 'T1' })] })
    fireEvent.click(knopf(container, '.notif-confirm')!)
    expect(typen(dispatch)).toEqual(['confirmTask'])
  })

  it('der Text steht in der Liste gekürzt (CSS), im Tooltip ganz', () => {
    const lang = 'Mikrofone · Sonntag, 20. September · Gebet · Dienstag, 22. September · Ordner · Sonntag, 27. September'
    const { container } = zeige('notif', { notifs: [notif({ text: lang })] })
    const text = container.querySelector('.notif-row-text')!
    expect(text.textContent).toBe(lang)
    expect(text.getAttribute('title')).toBe(lang)
  })
})

describe('Das Blatt zur eigenen Aufgabe — drei Zustände, drei Angebote', () => {
  const mitAufgabe = (over: Partial<MyTask> = {}) => {
    const eigene = task(over)
    return zeige('myTask', { myTasks: [eigene], myTaskId: eigene.id })
  }

  it('nennt Aufgabe, Rolle und Termin', () => {
    const { container } = mitAufgabe()
    expect(container.querySelector('.sheet-title')?.textContent).toBe('Bibellesung')
    expect(container.querySelector('.sheet-sub')?.textContent).toBe('Leser')
    expect(container.querySelector('.aufgabe-wann')?.textContent).toContain('8. September')
  })

  it('offen: bestätigen — oder „Ich kann nicht", das ins Absage-Blatt führt', () => {
    const { container, dispatch } = mitAufgabe({ status: 'offen' })
    fireEvent.click(text(container, t.bestaetigen)!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'confirmTask', id: task().id })
    fireEvent.click(text(container, t.kannNicht)!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'openAbsage', id: task().id })
  })

  it('bestätigt: der Zustand steht da, und man kann noch absagen', () => {
    const { container, dispatch } = mitAufgabe({ status: 'bestätigt' })
    expect(container.querySelector('.aufgabe-stand')?.textContent).toBe(t.bestaetigt)
    expect(text(container, t.bestaetigen)).toBeUndefined()
    fireEvent.click(text(container, t.kannNicht)!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'openAbsage', id: task().id })
  })

  it('verhindert: die Absage lässt sich zurücknehmen — es ist keine Einbahnstraße', () => {
    const { container, dispatch } = mitAufgabe({ status: 'verhindert' })
    expect(container.querySelector('.aufgabe-stand.is-problem')?.textContent).toBe(t.verhindertChip)
    expect(text(container, t.kannNicht)).toBeUndefined()
    fireEvent.click(text(container, t.dochBestaetigen)!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'confirmTask', id: task().id })
  })

  it('das ✕, der Hintergrund und Escape schließen alle drei', () => {
    // Escape fehlte hier einmal — ausgerechnet in einer der beiden Dateien,
    // wegen derer `useEscape` überhaupt herausgelöst wurde.
    const { container, dispatch } = mitAufgabe()
    fireEvent.click(container.querySelector(`[aria-label="${t.a11yClose}"]`)!)
    fireEvent.click(container.querySelector('.sheet-backdrop')!)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(dispatch.mock.calls.filter((c) => c[0].type === 'closeMyTask')).toHaveLength(3)
  })

  it('zeigt gar nichts, wenn die Aufgabe inzwischen weg ist — statt abzustürzen', () => {
    const { container } = zeige('myTask', { myTasks: [], myTaskId: 'gibt-es-nicht' })
    expect(container.querySelector('.sheet')).toBeNull()
  })
})

/**
 * **Absagen** (T121): „Du kannst nicht?" — mit dem Weg, der danach kommt, einer
 * Nachricht an den Planer und dem Tag als abwesend (freiwillig, aus).
 */
describe('Das Absage-Blatt', () => {
  const HILFSDIENST = '2026-09-07|mid|helper|mik|0'
  /** Dienstag, 8. September — der Tag der Testaufgabe als UTC-Mitternacht. */
  const DIENSTAG = Date.UTC(2026, 8, 8)
  const absagen = (over: Partial<MyTask> = {}, zustand: Partial<AppState> = {}) => {
    const eigene = task({ at: DIENSTAG, ...over })
    return zeige('absage', { myTasks: [eigene], absageId: eigene.id, personId: 'p-a', ...zustand })
  }
  const schritte = (c: HTMLElement) => [...c.querySelectorAll('.spur-name')].map((s) => s.textContent)
  const schalter = (c: HTMLElement) => c.querySelector<HTMLButtonElement>('[role="switch"]')

  it('fragt und nennt die Aufgabe, um die es geht', () => {
    const { container } = absagen()
    expect(container.querySelector('.sheet-title')?.textContent).toBe(t.absageFrage)
    expect(container.querySelector('.sheet-marke')?.textContent).toContain('Bibellesung · Leser')
  })

  it('beim Programmpunkt: Der Planer erfährt es und teilt neu zu', () => {
    const { container } = absagen()
    expect(schritte(container)).toEqual([t.spurDuSagstAb, t.spurPlanerErfaehrt, t.spurNeuZugeteilt])
    expect(container.querySelector('[aria-current="step"]')?.textContent).toContain(t.spurDuSagstAb)
    expect(container.querySelector('.absage-erklaerung')?.textContent).toBe(t.absageErklaerung)
  })

  it('beim Hilfsdienst: Es wird von selbst ein Ersatz gesucht — gesagt VOR dem Absagen', () => {
    const { container } = absagen({ id: HILFSDIENST })
    expect(schritte(container)).toEqual([t.spurDuSagstAb, t.spurErsatzGesucht, t.spurUebernommen])
    expect(container.querySelector('.absage-erklaerung')?.textContent).toBe(t.ersatzHint)
  })

  it('beim Zeugnisgeben keine Spur — der Platz wird einfach frei', () => {
    const { container } = absagen({ id: 'oz|2026-09-07|e1' })
    expect(container.querySelector('.spur')).toBeNull()
  })

  it('„Absagen" sagt ab und gibt die Nachricht mit', () => {
    const { container, dispatch } = absagen()
    fireEvent.change(container.querySelector('input.feld')!, { target: { value: 'bin verreist' } })
    fireEvent.click(text(container, t.absagen)!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'declineTask', id: task().id, nachricht: 'bin verreist' })
  })

  it('der Tag als abwesend: der Schalter steht aus, und ohne ihn wird nichts eingetragen', () => {
    const { container, dispatch } = absagen()
    expect(schalter(container)?.getAttribute('aria-checked')).toBe('false')
    fireEvent.click(text(container, t.absagen)!)
    expect(dispatch.mock.calls.some((c) => c[0].type === 'addAbsence')).toBe(false)
  })

  it('mit Schalter: genau dieser Tag, für die eigene Person — die Nachricht nicht als Grund', () => {
    // Eine Abwesenheit kann jedes Mitglied lesen, die Nachricht gilt dem Planer.
    const { container, dispatch } = absagen()
    fireEvent.change(container.querySelector('input.feld')!, { target: { value: 'krank' } })
    fireEvent.click(schalter(container)!)
    fireEvent.click(text(container, t.absagen)!)
    expect(dispatch).toHaveBeenCalledWith({
      type: 'addAbsence',
      absence: expect.objectContaining({ personId: 'p-a', from: '2026-09-08', to: '2026-09-08', reason: '' }),
    })
    // Erst die Abwesenheit, dann die Absage — beides geht hinaus.
    const typen = dispatch.mock.calls.map((c) => c[0].type)
    expect(typen.indexOf('addAbsence')).toBeLessThan(typen.indexOf('declineTask'))
  })

  it('kein Schalter, wo es nichts einzutragen gibt: Tag schon abwesend, keine eigene Person, kein Termin', () => {
    const abwesend = { id: 'a', personId: 'p-a', userId: null, from: '2026-09-07', to: '2026-09-09', reason: '' }
    expect(schalter(absagen({}, { absences: [abwesend] }).container)).toBeNull()
    cleanup()
    expect(schalter(absagen({}, { personId: null }).container)).toBeNull()
    cleanup()
    expect(schalter(absagen({ at: null }).container)).toBeNull()
  })

  it('„Doch bestätigen" sagt stattdessen zu — nur, solange die Aufgabe offen ist', () => {
    const { container, dispatch } = absagen()
    fireEvent.click(text(container, t.dochBestaetigen)!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'confirmTask', id: task().id })
    cleanup()
    expect(text(absagen({ status: 'bestätigt' }).container, t.dochBestaetigen)).toBeUndefined()
  })

  it('„Abbrechen", ✕, Hintergrund und Escape legen das Blatt weg, ohne abzusagen', () => {
    const { container, dispatch } = absagen()
    fireEvent.click(text(container, t.abbrechen)!)
    fireEvent.click(container.querySelector(`[aria-label="${t.a11yClose}"]`)!)
    fireEvent.click(container.querySelector('.sheet-backdrop')!)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(dispatch.mock.calls.filter((c) => c[0].type === 'closeAbsage')).toHaveLength(4)
    expect(dispatch.mock.calls.some((c) => c[0].type === 'declineTask')).toBe(false)
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

  it('ist ein modaler Dialog über dem Blatt darunter und trägt die Karte mit den Daten', () => {
    const { container } = zeige('s89', {}, PAYLOAD)
    const dlg = container.querySelector('.sheet--oben')!
    expect(dlg.getAttribute('role')).toBe('dialog')
    expect(dlg.textContent).toContain('Anton Alt')
  })

  it('✕, Hintergrund und Escape schließen alle drei', () => {
    const { container, dispatch } = zeige('s89', {}, PAYLOAD)
    fireEvent.click(container.querySelector(`[aria-label="${t.a11yClose}"]`)!)
    fireEvent.click(container.querySelector('.sheet-backdrop--oben')!)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(dispatch.mock.calls.filter((c) => c[0].type === 'closeS89')).toHaveLength(3)
  })
})
