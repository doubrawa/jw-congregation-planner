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
import type { MyTask, Notification, SubstituteReq } from '../data/types'
import { dict } from '../i18n/ui'
import { MitteilungenScreen } from './MitteilungenScreen'

/**
 * **Die Mitteilungen als Seite** (T121) — bis zum Umbau die Glocke, die sich
 * über die Seite legte.
 *
 * Fachlich hängt daran mehr als Lesen: Eine neue Zuteilung lässt sich hier
 * gleich bestätigen oder absagen, ein Ersatzgesuch gleich übernehmen. Steht
 * dort ein Knopf, der nichts mehr bewirkt — bei einer schon bestätigten
 * Aufgabe, einem vergebenen Gesuch, einer Absage —, sagt jemand zu, was er
 * nicht meinte.
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

const HILFSDIENST = '2026-09-07|mid|helper|mik|0'
const gesuch = (key: string): SubstituteReq => ({
  key, svc: 'mik', title: 'Mikrofone', date: 'Dienstag, 8. September', declinedBy: 'Bernd Klein', schonHeute: [],
})

function zeige(over: Partial<AppState> = {}) {
  const dispatch = vi.fn()
  const state: AppState = {
    ...demoZustand(),
    screen: 'mitteilungen',
    dataStatus: 'ready', congregationId: null, userId: null, planner: false,
    notifs: [], myTasks: [], substituteReqs: [], persons: [], weeks: [], fsWeeks: [],
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

/** Ein Knopf an seiner Beschriftung. */
const knopf = (c: HTMLElement, beschriftung: string) =>
  [...c.querySelectorAll('button')].find((b) => b.textContent === beschriftung)
const typen = (dispatch: ReturnType<typeof vi.fn>) => dispatch.mock.calls.map((c) => c[0].type as string)
const abschnitt = (c: HTMLElement, art: 'neu' | 'frueher') => c.querySelector(`[data-abschnitt="${art}"]`)

beforeEach(() => {
  window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia
})
afterEach(cleanup)

describe('Die Seite', () => {
  it('trägt ihren Titel als Überschrift', () => {
    const { container } = zeige()
    expect(container.querySelector('h1')?.textContent).toBe(t.mitteilungen)
  })

  it('ohne Mitteilungen sagt sie es — und bietet nichts an, was nichts zu tun hätte', () => {
    const { container } = zeige()
    expect(container.querySelector('.mitteilungen-leer')?.textContent).toBe(t.keineMitteilungen)
    expect(knopf(container, t.alleGelesen)).toBeUndefined()
  })

  it('Neues steht unter „Neu", Gelesenes unter „Früher"', () => {
    const { container } = zeige({ notifs: [notif({ id: 'n1', read: false }), notif({ id: 'n2', read: true })] })
    expect(abschnitt(container, 'neu')?.querySelector('h2')?.textContent).toBe(t.mitteilungenNeu)
    expect(abschnitt(container, 'neu')?.querySelectorAll('.mitteilung')).toHaveLength(1)
    expect(abschnitt(container, 'frueher')?.querySelector('h2')?.textContent).toBe(t.mitteilungenFrueher)
    expect(abschnitt(container, 'frueher')?.querySelectorAll('.mitteilung')).toHaveLength(1)
  })

  it('ein leerer Abschnitt steht gar nicht da', () => {
    const { container } = zeige({ notifs: [notif({ read: true })] })
    expect(abschnitt(container, 'neu')).toBeNull()
    expect(abschnitt(container, 'frueher')).not.toBeNull()
  })

  it('„Alle gelesen" steht nur da, solange es Neues gibt — und meldet alle als gelesen', () => {
    expect(knopf(zeige({ notifs: [notif({ read: true })] }).container, t.alleGelesen)).toBeUndefined()
    cleanup()
    const { container, dispatch } = zeige({ notifs: [notif()] })
    fireEvent.click(knopf(container, t.alleGelesen)!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'markAllRead' })
  })

  it('die eigene, lokal entstandene Absage-Meldung sieht ein Verkündiger nicht — sie gilt den Admins', () => {
    const lokal = notif({ id: 'lokal', type: 'verhindert', title: 'Verhinderung gemeldet', local: true })
    const { container } = zeige({ notifs: [lokal], planner: false })
    expect(container.querySelectorAll('.mitteilung')).toHaveLength(0)
    expect(container.querySelector('.mitteilungen-leer')).toBeTruthy()
    cleanup()
    const admin = zeige({ notifs: [lokal], planner: true })
    expect(admin.container.querySelectorAll('.mitteilung')).toHaveLength(1)
  })
})

describe('Eine Mitteilung', () => {
  it('der kanonisch deutsche Titel aus der Datenbank wird übersetzt', () => {
    // In der Datenbank steht „Neue Zuteilung"; angezeigt wird die Sprache des
    // Lesers. Ohne das stünden die halben Mitteilungen auf Deutsch.
    const { container } = zeige({ notifs: [notif({ title: 'Neue Zuteilung' })] })
    expect(container.querySelector('.mitteilung-titel')?.textContent).toBe(t.notifZuteilung)
  })

  it('ein unbekannter Titel bleibt stehen, statt zu verschwinden', () => {
    const { container } = zeige({ notifs: [notif({ title: 'Etwas Neues' })] })
    expect(container.querySelector('.mitteilung-titel')?.textContent).toBe('Etwas Neues')
  })

  it('nennt, wie lange sie her ist — als Form, nicht als fertiger Satz', () => {
    // Der Zeitstempel steht ISO in der Datenbank; die Form entsteht beim
    // Anzeigen. Stünde dort ein gebauter deutscher Satz, bliebe er deutsch.
    const zweiStunden = new Date(Date.now() - 2 * 3600_000).toISOString()
    const { container } = zeige({ notifs: [notif({ at: zweiStunden })] })
    expect(container.querySelector('.mitteilung-zeit')?.textContent).toBe('vor 2 Stunden')
  })

  it('ein unlesbarer Zeitstempel bleibt leer — nicht „Invalid Date"', () => {
    const { container } = zeige({ notifs: [notif({ at: 'kaputt' })] })
    expect(container.querySelector('.mitteilung-zeit')?.textContent).toBe('')
  })

  it('der Text steht in der Liste gekürzt (CSS), im Tooltip ganz', () => {
    const lang = 'Mikrofone · Sonntag, 20. September · Gebet · Dienstag, 22. September · Ordner · Sonntag, 27. September'
    const { container } = zeige({ notifs: [notif({ text: lang })] })
    const text = container.querySelector('.mitteilung-text')!
    expect(text.textContent).toBe(lang)
    expect(text.getAttribute('title')).toBe(lang)
  })
})

describe('Ein Tipp auf die Mitteilung führt dorthin, wo sie herkommt (4.10.2026)', () => {
  it('die Zeile ist ein Knopf; die Handlungen stehen daneben, nicht darin', () => {
    const { container } = zeige({ notifs: [notif({ taskId: 'T1' })], myTasks: [task({ id: 'T1' })] })
    const link = container.querySelector<HTMLButtonElement>('.mitteilung-link')!
    expect(link.tagName).toBe('BUTTON')
    // Geschachtelte Knöpfe gibt es nicht — der Browser risse sie auseinander.
    expect(link.querySelector('button')).toBeNull()
    expect(knopf(container, t.bestaetigen)).toBeDefined()
  })

  it('eine neue gilt danach als gelesen, dann geht es zum Ziel', () => {
    const { container, dispatch } = zeige({ notifs: [notif({ id: 'n7', taskId: 'T1' })], myTasks: [task({ id: 'T1' })] })
    fireEvent.click(container.querySelector('.mitteilung-link')!)
    expect(dispatch.mock.calls.map((c) => c[0])).toEqual([
      { type: 'mitteilungGelesen', id: 'n7' },
      { type: 'navigate', screen: 'aufgaben' },
      { type: 'openMyTask', id: 'T1' },
    ])
  })

  it('eine gelesene wird nicht noch einmal gemeldet', () => {
    const { container, dispatch } = zeige({ notifs: [notif({ read: true })] })
    fireEvent.click(container.querySelector('.mitteilung-link')!)
    expect(typen(dispatch)).toEqual(['navigate'])
  })

  it('offline springt sie trotzdem — ohne „gelesen", das dort nur „nur lesen" hervorriefe', () => {
    const { container, dispatch } = zeige({ notifs: [notif()], staleAt: Date.now() - 3600_000 })
    fireEvent.click(container.querySelector('.mitteilung-link')!)
    expect(typen(dispatch)).toEqual(['navigate'])
  })
})

describe('Gleich hier erledigen (T121)', () => {
  it('eine offene eigene Zuteilung: „Bestätigen" bestätigt, gilt als gelesen und springt nicht weg', () => {
    const { container, dispatch } = zeige({ notifs: [notif({ id: 'n3', taskId: 'T1' })], myTasks: [task({ id: 'T1' })] })
    fireEvent.click(knopf(container, t.bestaetigen)!)
    expect(dispatch.mock.calls.map((c) => c[0])).toEqual([
      { type: 'mitteilungGelesen', id: 'n3' },
      { type: 'confirmTask', id: 'T1' },
    ])
  })

  it('„Ich kann nicht" öffnet das Blatt zum Absagen — gelesen ist sie damit noch nicht', () => {
    // Wer das Blatt abbricht, hat nichts beantwortet; die Mitteilung bleibt neu.
    const { container, dispatch } = zeige({ notifs: [notif({ taskId: 'T1' })], myTasks: [task({ id: 'T1' })] })
    fireEvent.click(knopf(container, t.kannNicht)!)
    expect(dispatch.mock.calls.map((c) => c[0])).toEqual([{ type: 'openAbsage', id: 'T1' }])
  })

  it('schon bestätigt, abgesagt, umgeteilt oder ohne Aufgabe: kein Knopf', () => {
    const faelle: Array<[string, Partial<AppState>]> = [
      ['bestätigt', { notifs: [notif({ taskId: 'T1' })], myTasks: [task({ id: 'T1', status: 'bestätigt' })] }],
      ['abgesagt', { notifs: [notif({ taskId: 'T1' })], myTasks: [task({ id: 'T1', status: 'verhindert' })] }],
      ['umgeteilt', { notifs: [notif({ taskId: 'T-weg' })], myTasks: [task()] }],
      ['ohne Aufgabe', { notifs: [notif({ taskId: undefined })], myTasks: [task({ id: 'T1' })] }],
    ]
    for (const [name, over] of faelle) {
      const { container } = zeige(over)
      expect(knopf(container, t.bestaetigen), name).toBeUndefined()
      expect(knopf(container, t.kannNicht), name).toBeUndefined()
      cleanup()
    }
  })

  it('an einer Absage nie — auch wenn ihr Schlüssel inzwischen die eigene offene Aufgabe ist', () => {
    // Seit dem 4.10.2026 trägt die Absage den Schlüssel der abgesagten
    // Aufgabe. Übernimmt der Planer den Platz selbst, ist es seine — an der
    // Meldung über die Absage stünde sonst „Bestätigen".
    const absage = notif({ type: 'verhindert', title: 'Verhinderung gemeldet', taskId: 'T1' })
    const { container } = zeige({ notifs: [absage], myTasks: [task({ id: 'T1' })], planner: true })
    expect(knopf(container, t.bestaetigen)).toBeUndefined()
  })

  it('an einer gelesenen nicht — „Früher" ist zum Nachlesen', () => {
    const { container } = zeige({ notifs: [notif({ taskId: 'T1', read: true })], myTasks: [task({ id: 'T1' })] })
    expect(knopf(container, t.bestaetigen)).toBeUndefined()
  })

  it('ein offenes Ersatzgesuch: „Übernehmen" übernimmt und gilt als gelesen', () => {
    const n = notif({ id: 'n9', title: 'Ersatz gesucht', taskId: HILFSDIENST })
    const { container, dispatch } = zeige({ notifs: [n], substituteReqs: [gesuch(HILFSDIENST)] })
    fireEvent.click(knopf(container, t.uebernehmen)!)
    expect(dispatch.mock.calls.map((c) => c[0])).toEqual([
      { type: 'mitteilungGelesen', id: 'n9' },
      { type: 'takeSubstitute', key: HILFSDIENST },
    ])
  })

  it('ist das Gesuch schon vergeben, steht kein „Übernehmen" da', () => {
    const n = notif({ title: 'Ersatz gesucht', taskId: HILFSDIENST })
    const { container } = zeige({ notifs: [n], substituteReqs: [] })
    expect(knopf(container, t.uebernehmen)).toBeUndefined()
  })
})
