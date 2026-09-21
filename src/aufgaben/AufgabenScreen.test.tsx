/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import {
  AppDispatchContext,
  AppStateContext,
  AppStoreContext,
  type AppAction,
  type AppState,
  useStaticStore,
} from '../app/context'
import { initialState } from '../app/init'
import { emptyQualifications } from '../data/helpers'
import { dict } from '../i18n/ui'
import type { MyTask, Person, S89Payload, SubstituteReq } from '../data/types'
import { AufgabenScreen } from './AufgabenScreen'

/**
 * **„Meine Aufgaben" — der Bildschirm, den ein Verkündiger benutzt.**
 *
 * Er trägt drei Dinge, und alle drei haben eine Regel, die man nicht sieht:
 *
 * - Die **Aufgabenliste** mit dem Bestätigungs-Flow (dieselben drei Zustände
 *   wie im Blatt, hier aber als Liste).
 * - **Einspringen**: offene Ersatzgesuche. Entscheidend ist, dass „was ich an
 *   dem Tag schon habe" **vor** dem Zusagen dasteht — es stand früher hinterher
 *   im Toast, und das ist die falsche Reihenfolge.
 * - **„Deine Einträge"**: seit die Abwesenheiten versammlungsweit geladen
 *   werden, entscheidet die **betroffene Person**, nicht der Ersteller. Sonst
 *   stünden dem Planer alle Abwesenheiten der Versammlung als seine eigenen da.
 */

const t = dict('de')

const ICH: Person = {
  id: 'p-a', fn: 'Anton', ln: 'Alt', role: 'verkuendiger', female: false,
  tel: '', mail: '', priv: emptyQualifications(),
}

const S89: S89Payload = {
  name: 'Anton Alt', partner: '', date: 'Di, 8. September · 19:00',
  type: 'Bibellesung', point: 'lmd Lektion 1',
}

const task = (over: Partial<MyTask> = {}): MyTask => ({
  id: 'T1', title: 'Bibellesung', rolle: '', date: 'Di, 8. September · ca. 19:35',
  chip: '', at: null, status: 'offen', s89: null, ...over,
})

const gesuch = (over: Partial<SubstituteReq> = {}): SubstituteReq => ({
  key: '2026-09-07|mid|helper|mik|0', svc: 'mik', title: 'Mikrofone',
  date: 'Di, 8. September · 19:00', declinedBy: 'Bernd Brand', schonHeute: [], ...over,
})

function zeige(over: Partial<AppState> = {}) {
  const dispatch = vi.fn()
  const state: AppState = {
    ...initialState(),
    screen: 'aufgaben', dataStatus: 'ready',
    congregationId: 'c1', userId: 'u1', personId: 'p-a', planner: false,
    persons: [ICH], services: [], groups: [], absences: [],
    weeks: [], fsWeeks: [], myTasks: [], substituteReqs: [], notifs: [],
    congregation: { name: 'Nordheim', hall: 'Saal', times: { mid: { wd: 2, time: '19:00' }, we: { wd: 0, time: '10:00' } } },
    ...over,
  }
  function Buehne() {
    const store = useStaticStore(state)
    return (
      <AppDispatchContext.Provider value={dispatch}>
        <AppStoreContext.Provider value={store}>
          <AppStateContext.Provider value={state}>
            <AufgabenScreen />
          </AppStateContext.Provider>
        </AppStoreContext.Provider>
      </AppDispatchContext.Provider>
    )
  }
  return { dispatch, ...render(<Buehne />) }
}

const zeilen = (c: HTMLElement) => [...c.querySelectorAll('.auf-row')]

afterEach(cleanup)

describe('Kopf', () => {
  it('nennt Namen und Versammlung — man sieht, als wer man angemeldet ist', () => {
    const { container } = zeige()
    expect(container.querySelector('.screen-subtitle')?.textContent).toContain('Anton Alt')
    expect(container.querySelector('.screen-subtitle')?.textContent).toContain('Nordheim')
  })

  it('ohne verknüpfte Person bleibt der Name weg, ohne „undefined"', () => {
    const { container } = zeige({ personId: null })
    expect(container.querySelector('.screen-subtitle')?.textContent).not.toContain('undefined')
  })
})

describe('Die Aufgabenliste', () => {
  it('ohne Aufgaben bleibt die Karte leer, aber vorhanden', () => {
    const { container } = zeige()
    expect(container.querySelector('.panel-label')?.textContent).toBe(t.naechsteAufgaben)
    expect(zeilen(container)).toHaveLength(0)
  })

  it('jede Aufgabe steht mit Bezeichnung und Termin da', () => {
    const { container } = zeige({ myTasks: [task(), task({ id: 'T2', title: 'Vorsitz' })] })
    expect(zeilen(container)).toHaveLength(2)
    expect(zeilen(container)[0]!.querySelector('.auf-title')?.textContent).toContain('Bibellesung')
    expect(zeilen(container)[0]!.querySelector('.auf-date')?.textContent).toContain('8. September')
  })

  it('ein Tipp öffnet das Blatt zu genau dieser Aufgabe', () => {
    const { container, dispatch } = zeige({ myTasks: [task({ id: 'T1' }), task({ id: 'T2' })] })
    fireEvent.click(zeilen(container)[1]!.querySelector('.auf-open')!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'openMyTask', id: 'T2' })
  })

  it('offen: bestätigen geht direkt aus der Liste', () => {
    const { container, dispatch } = zeige({ myTasks: [task({ status: 'offen' })] })
    fireEvent.click(container.querySelector('.auf-confirm')!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'confirmTask', id: 'T1' })
  })

  it('bestätigt und verhindert zeigen ihren Zustand statt eines Knopfs', () => {
    const { container } = zeige({
      myTasks: [task({ id: 'T1', status: 'bestätigt' }), task({ id: 'T2', status: 'verhindert' })],
    })
    expect(container.querySelector('.auf-confirm')).toBeNull()
    expect(container.querySelector('.auf-badge--best')?.textContent).toContain(t.bestaetigt)
    expect(container.querySelector('.auf-badge--verh')?.textContent).toBe(t.verhindertChip)
  })

  it('das S-89 steht nur bei Schulungsaufgaben', () => {
    const { container, dispatch } = zeige({
      myTasks: [task({ id: 'T1', s89: S89 }), task({ id: 'T2', s89: null })],
    })
    expect(container.querySelectorAll('.auf-s89')).toHaveLength(1)
    fireEvent.click(container.querySelector('.auf-s89')!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'openS89', payload: S89 })
  })

  it('der Countdown rechnet aus dem echten Termin', () => {
    // `MyTask.at` ist ein Kalendertag als UTC-Mitternacht, kein Zeitpunkt —
    // `Date.now() + 24h` wäre eine Form, die keine Quelle erzeugt, und der
    // Test hinge an der Uhrzeit des Laufs (siehe MyTask.at in types.ts).
    const heute = new Date()
    const morgen = Date.UTC(heute.getFullYear(), heute.getMonth(), heute.getDate() + 1)
    const { container } = zeige({ myTasks: [task({ at: morgen })] })
    expect(container.querySelector('.auf-chip')?.textContent).toBe('morgen')
  })

  it('ohne Termin und ohne Chip-Text steht kein leerer Chip da', () => {
    const { container } = zeige({ myTasks: [task({ at: null, chip: '' })] })
    expect(container.querySelector('.auf-chip')).toBeNull()
  })
})

describe('Einspringen', () => {
  it('ohne Gesuch steht die Karte gar nicht da', () => {
    const { container } = zeige()
    expect(container.querySelector('.auf-sub')).toBeNull()
  })

  it('ein Gesuch nennt Dienst, Termin und wer abgesagt hat', () => {
    const { container } = zeige({ substituteReqs: [gesuch()] })
    const zeile = container.querySelector('.auf-sub-row')!
    expect(zeile.querySelector('.auf-sub-title')?.textContent).toBe('Mikrofone')
    expect(zeile.querySelector('.auf-sub-meta')?.textContent).toContain('8. September')
    expect(zeile.querySelector('.auf-sub-meta')?.textContent).toContain('Bernd Brand')
  })

  it('was ich an dem Tag schon habe, steht VOR dem Zusagen da', () => {
    // Früher kam der Hinweis hinterher im Toast — wer es vorher weiß, entscheidet anders.
    const { container } = zeige({
      substituteReqs: [gesuch({ schonHeute: [{ text: 'Vorsitz', lang: 'u' }] })],
    })
    const warnung = container.querySelector('.auf-sub-warn')!
    expect(warnung.textContent).toContain(t.sheetSchonHeute)
    expect(warnung.textContent).toContain('Vorsitz')
  })

  it('habe ich an dem Tag nichts, steht auch kein Hinweis da', () => {
    const { container } = zeige({ substituteReqs: [gesuch({ schonHeute: [] })] })
    expect(container.querySelector('.auf-sub-warn')).toBeNull()
  })

  it('„Übernehmen" sagt für genau diesen Platz zu', () => {
    const { container, dispatch } = zeige({ substituteReqs: [gesuch()] })
    fireEvent.click(container.querySelector('.auf-sub-btn')!)
    expect(dispatch).toHaveBeenCalledWith({
      type: 'takeSubstitute', key: '2026-09-07|mid|helper|mik|0',
    })
  })

  it('die Karte erklärt, worum es geht — sie erscheint unangekündigt', () => {
    const { container } = zeige({ substituteReqs: [gesuch()] })
    expect(container.querySelector('.auf-sub .panel-hint')?.textContent).toBe(t.einspringenHint)
  })
})

/**
 * **Ein Klick auf „Ersatz gesucht" landet beim Einspringen, nicht oben** (T109).
 *
 * Eine eigene Seite dafür hat der Betreiber verworfen — sie wäre fast immer
 * leer. Stattdessen springt „Meine Aufgaben" zum Bereich, wenn die Navigation
 * ihn vorgemerkt hat (`sprungZiel`). Der Haken: Beim Push-Klick kommen die Daten
 * still hinterher, das Gesuch steht also womöglich erst nach dem Nachladen da.
 */
describe('Der Sprung aus „Ersatz gesucht"', () => {
  let gescrollt: Element[] = []
  const vorher = Element.prototype.scrollIntoView
  beforeEach(() => {
    gescrollt = []
    // jsdom rechnet kein Layout und kennt scrollIntoView nicht.
    Element.prototype.scrollIntoView = function (this: Element) {
      gescrollt.push(this)
    }
  })
  afterEach(() => {
    Element.prototype.scrollIntoView = vorher
  })

  /** Bühne, die einen neuen Zustand annimmt — wie nach dem stillen Nachladen. */
  function buehne(state: AppState, dispatch: (action: AppAction) => void) {
    function Buehne({ s }: { s: AppState }) {
      const store = useStaticStore(s)
      return (
        <AppDispatchContext.Provider value={dispatch}>
          <AppStoreContext.Provider value={store}>
            <AppStateContext.Provider value={s}>
              <AufgabenScreen />
            </AppStateContext.Provider>
          </AppStoreContext.Provider>
        </AppDispatchContext.Provider>
      )
    }
    const r = render(<Buehne s={state} />)
    return { ...r, neu: (s: AppState) => r.rerender(<Buehne s={s} />) }
  }

  const basis = (over: Partial<AppState>): AppState => ({
    ...initialState(),
    screen: 'aufgaben', dataStatus: 'ready',
    congregationId: 'c1', userId: 'u1', personId: 'p-a', planner: false,
    persons: [ICH], services: [], groups: [], absences: [],
    weeks: [], fsWeeks: [], myTasks: [], substituteReqs: [], notifs: [],
    ...over,
  })

  it('steht das Gesuch schon da, springt die Seite hin und meldet sich zurück', () => {
    const dispatch = vi.fn()
    const { container } = buehne(basis({ sprungZiel: 'einspringen', substituteReqs: [gesuch()] }), dispatch)
    const bereich = container.querySelector('.auf-sub')!
    expect(gescrollt).toEqual([bereich])
    expect(dispatch).toHaveBeenCalledWith({ type: 'sprungZielErreicht' })
  })

  it('die Überschrift bekommt den Fokus — ein Screenreader liest dort weiter, nicht oben', () => {
    const { container } = buehne(basis({ sprungZiel: 'einspringen', substituteReqs: [gesuch()] }), vi.fn())
    const ueberschrift = container.querySelector<HTMLElement>('.auf-sub .panel-label')!
    expect(document.activeElement).toBe(ueberschrift)
    // Fokussierbar für den Sprung, aber nicht in der Tab-Reihenfolge.
    expect(ueberschrift.tabIndex).toBe(-1)
  })

  it('kommt das Gesuch erst mit dem Nachladen, wird gesprungen, sobald es steht', () => {
    const dispatch = vi.fn()
    const { container, neu } = buehne(basis({ sprungZiel: 'einspringen', substituteReqs: [] }), dispatch)
    // Noch nichts da: nicht springen, das Ziel aber auch nicht aufgeben.
    expect(gescrollt).toEqual([])
    expect(dispatch).not.toHaveBeenCalledWith({ type: 'sprungZielErreicht' })

    neu(basis({ sprungZiel: 'einspringen', substituteReqs: [gesuch()] }))
    expect(gescrollt).toEqual([container.querySelector('.auf-sub')])
    expect(dispatch).toHaveBeenCalledWith({ type: 'sprungZielErreicht' })
  })

  it('ohne vorgemerkten Sprung verschiebt ein Gesuch die Seite nicht', () => {
    // Wer „Meine Aufgaben" selbst öffnet, liest von oben. Ein Gesuch, das beim
    // Nachladen hinzukommt, darf ihm die Seite nicht unter den Augen wegziehen.
    const dispatch = vi.fn()
    const { neu } = buehne(basis({ sprungZiel: null, substituteReqs: [] }), dispatch)
    neu(basis({ sprungZiel: null, substituteReqs: [gesuch()] }))
    expect(gescrollt).toEqual([])
    expect(document.activeElement).toBe(document.body)
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('nach dem Sprung wird nicht noch einmal gesprungen', () => {
    const dispatch = vi.fn()
    const { neu } = buehne(basis({ sprungZiel: 'einspringen', substituteReqs: [gesuch()] }), dispatch)
    // Der Reducer hat das Ziel abgeräumt; ein zweites Gesuch kommt hinzu.
    neu(basis({ sprungZiel: null, substituteReqs: [gesuch(), gesuch({ key: '2026-09-07|we|helper|mik|0' })] }))
    expect(gescrollt).toHaveLength(1)
  })
})

describe('„Deine Einträge": die betroffene Person entscheidet, nicht der Ersteller', () => {
  const abw = (id: string, personId: string | null, userId: string | null) => ({
    id, personId, userId, from: '2026-10-01', to: '2026-10-14', reason: '',
  })

  it('zeigt die eigenen — auch die, die der Planer für mich eingetragen hat', () => {
    const { container } = zeige({
      absences: [abw('a1', 'p-a', 'u-planer')],
    })
    expect(container.querySelectorAll('.abs-row').length).toBe(1)
  })

  it('zeigt NICHT, was der Planer für andere eingetragen hat', () => {
    // Nach dem Ersteller gefragt, stünden ihm hier alle Abwesenheiten der
    // Versammlung als seine eigenen.
    const { container } = zeige({
      userId: 'u-planer', personId: 'p-a',
      absences: [abw('a1', 'p-b', 'u-planer'), abw('a2', 'p-c', 'u-planer')],
    })
    expect(container.querySelectorAll('.abs-row')).toHaveLength(0)
  })

  it('ein Konto ohne eigene Person findet seine Einträge über den Ersteller wieder', () => {
    const { container } = zeige({
      personId: null, userId: 'u1',
      absences: [abw('a1', null, 'u1'), abw('a2', null, 'u9')],
    })
    expect(container.querySelectorAll('.abs-row')).toHaveLength(1)
  })

  it('ohne Konto (Demo) bleibt alles stehen — es gibt nichts einzugrenzen', () => {
    const { container } = zeige({
      userId: null, dataStatus: 'demo',
      absences: [abw('a1', 'p-b', null), abw('a2', 'p-c', null)],
    })
    expect(container.querySelectorAll('.abs-row')).toHaveLength(2)
  })
})
