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
    congregation: { name: 'Nordheim', hall: 'Saal', meetings: 'Di 19:00 · So 10:00' },
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
    const { container } = zeige({ myTasks: [task({ at: Date.now() + 24 * 3600_000 })] })
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
