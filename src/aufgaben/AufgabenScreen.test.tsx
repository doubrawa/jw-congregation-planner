/** @vitest-environment happy-dom */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import {
  AppDispatchContext,
  AppStateContext,
  AppStoreContext,
  type AppState,
  useStaticStore,
} from '../app/context'
import { demoZustand } from '../../tests/testdaten/demo-start'
import { emptyQualifications } from '../data/helpers'
import { dict } from '../i18n/ui'
import { zahlBinden } from '../i18n/zahl-binden'
import type { MyTask, Person, S89Payload, SubstituteReq, TrolleyTermin } from '../data/types'
import { AufgabenScreen } from './AufgabenScreen'

/**
 * **„Meine Aufgaben" — der Bildschirm, den ein Verkündiger benutzt.**
 *
 * Die **Aufgaben** (T121): die nächste groß, die übrigen je eine Zeile mit
 * einem Haken zum Bestätigen — und „Alle bestätigen" für alles Offene; darunter
 * die eigenen Trolley-Termine.
 *
 * Was man übernehmen kann (Einspringen, freie Plätze), steht seit T134 auf
 * „Freie Plätze" (`FreiePlaetzeScreen.test.tsx`). Die eigenen Abwesenheiten
 * stehen seit T121 im Profil (`components/abwesenheiten.test.ts`).
 */

const t = dict('de')

const ICH: Person = {
  id: 'p-a', fn: 'Anton', ln: 'Alt', role: 'verkuendiger', female: false,
  mail: '', priv: emptyQualifications(),
}

const S89: S89Payload = {
  name: 'Anton Alt', partner: '', date: 'Di, 8. September · 19:00',
  type: 'Bibellesung', point: 'lmd Lektion 1',
}

const task = (over: Partial<MyTask> = {}): MyTask => ({
  id: 'T1', title: 'Bibellesung', rolle: '', date: 'Di, 8. September · ca. 19:35',
  at: null, status: 'offen', s89: null, ...over,
})

const gesuch = (over: Partial<SubstituteReq> = {}): SubstituteReq => ({
  key: '2026-09-07|mid|helper|mik|0', svc: 'mik', title: 'Mikrofone',
  date: 'Di, 8. September · 19:00', declinedBy: 'Bernd Brand', schonHeute: [], ...over,
})

function zeige(over: Partial<AppState> = {}) {
  const dispatch = vi.fn()
  const state: AppState = {
    ...demoZustand(),
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

const zeilen = (c: HTMLElement) => [...c.querySelectorAll('.aufgaben-liste .aufgaben-zeile')]
const knopf = (root: Element | null, text: string) =>
  [...(root?.querySelectorAll('button') ?? [])].find((b) => b.textContent === text)

/** Der Kalendertag in `n` Tagen als UTC-Mitternacht — die Form von `MyTask.at`. */
const inTagen = (n: number): number => {
  const h = new Date()
  return Date.UTC(h.getFullYear(), h.getMonth(), h.getDate() + n)
}

afterEach(cleanup)

describe('Was man übernehmen kann, steht nicht mehr hier (T134)', () => {
  it('weder Einspringen noch freie Plätze — sie haben einen eigenen Menüpunkt', () => {
    const frei: AppState['offenePlaetze'][number] = {
      key: '2026-09-07|mid|helper|mik|1', title: '', rolle: 'Mikrofone', date: 'Dienstag, 8. September · 19:00', at: null, schonHeute: [],
    }
    const { container } = zeige({ substituteReqs: [gesuch()], offenePlaetze: [frei] })
    expect(container.querySelector('[data-bereich="einspringen"]')).toBeNull()
    expect(container.querySelector('[data-bereich="freie-plaetze"]')).toBeNull()
  })
})

describe('Kopf', () => {
  it('nennt den Bildschirm und wie viel noch auf Zusage wartet', () => {
    const { container } = zeige({ myTasks: [task(), task({ id: 'T2' }), task({ id: 'T3', status: 'bestätigt' })] })
    expect(container.querySelector('h1')?.textContent).toBe(t.navAufgabenLong)
    expect(container.querySelector('.aufgaben-zusage')?.textContent).toContain(zahlBinden(`${t.dashZuBest}: 2`))
  })

  it('„Alle bestätigen" sagt alles Offene auf einmal zu', () => {
    const { container, dispatch } = zeige({ myTasks: [task(), task({ id: 'T2' })] })
    fireEvent.click(knopf(container.querySelector('.aufgaben-zusage'), t.alleBestaetigen)!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'confirmAll' })
  })

  it('bei nur einer offenen Aufgabe kein „Alle" — und ohne offene nichts davon', () => {
    expect(knopf(zeige({ myTasks: [task()] }).container, t.alleBestaetigen)).toBeUndefined()
    cleanup()
    expect(zeige({ myTasks: [task({ status: 'bestätigt' })] }).container.querySelector('.aufgaben-zusage')).toBeNull()
  })
})

describe('Die Aufgaben: die nächste groß, die übrigen je eine Zeile', () => {
  it('ohne Aufgaben steht der ruhige Satz', () => {
    const { container } = zeige()
    expect(container.querySelector('.aufgaben-leer')?.textContent).toBe(t.dashKeineAufgabe)
    expect(zeilen(container)).toHaveLength(0)
  })

  it('die erste steht in der großen Karte, die übrigen darunter — mit Bezeichnung und Termin', () => {
    const { container } = zeige({ myTasks: [task(), task({ id: 'T2', title: 'Vorsitz', at: inTagen(1) })] })
    expect(container.querySelector('.aufgabe-karte .aufgabe-titel')?.textContent).toBe('Bibellesung')
    expect(zeilen(container)).toHaveLength(1)
    expect(zeilen(container)[0]!.querySelector('.aufgaben-zeile-titel')?.textContent).toBe('Vorsitz')
    // Der Abstand in Worten vorn, dann der Termin — aus dem echten Kalendertag,
    // Tag und Monat gebunden (T128).
    expect(zeilen(container)[0]!.querySelector('.klein-text')?.textContent).toMatch(/^Morgen · /)
    expect(zeilen(container)[0]!.querySelector('.klein-text')?.textContent).toContain(zahlBinden('8. September'))
  })

  it('ein Tipp auf die Zeile öffnet das Blatt zu genau dieser Aufgabe', () => {
    const { container, dispatch } = zeige({ myTasks: [task({ id: 'T1' }), task({ id: 'T2' })] })
    fireEvent.click(zeilen(container)[0]!.querySelector('.aufgaben-zeile-text')!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'openMyTask', id: 'T2' })
  })

  it('offen: der Haken bestätigt — und sagt dem Vorleseprogramm, welche Aufgabe', () => {
    const { container, dispatch } = zeige({ myTasks: [task({ id: 'T1' }), task({ id: 'T2', title: 'Vorsitz' })] })
    const haken = zeilen(container)[0]!.querySelector('.knopf-haken')!
    expect(haken.getAttribute('aria-label')).toBe(`Vorsitz: ${t.bestaetigen}`)
    fireEvent.click(haken)
    expect(dispatch).toHaveBeenCalledWith({ type: 'confirmTask', id: 'T2' })
  })

  it('bestätigt und verhindert: kein Haken, der Punkt sagt den Stand', () => {
    const { container } = zeige({
      myTasks: [task(), task({ id: 'T2', status: 'bestätigt' }), task({ id: 'T3', status: 'verhindert' })],
    })
    const [best, verh] = zeilen(container)
    expect(best!.querySelector('.knopf-haken')).toBeNull()
    expect(best!.querySelector('.punkt.is-voll')).not.toBeNull()
    expect(verh!.querySelector('.knopf-haken')).toBeNull()
    expect(verh!.querySelector('.punkt.is-problem')).not.toBeNull()
  })

  it('das S-89 steht an der großen Karte, wo es eines gibt', () => {
    const { container, dispatch } = zeige({ myTasks: [task({ id: 'T1', s89: S89 })] })
    fireEvent.click(knopf(container.querySelector('.aufgabe-karte'), 'S-89')!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'openS89', payload: S89 })
  })
})

/**
 * **Trolley** (T121, Phase 7, Entwurf `GAufgaben`): die eigenen Trolley-Termine
 * für sich — wer sich eingetragen hat, hat sich verabredet; einen Haken zum
 * Bestätigen gibt es nicht. Ein Tipp führt zu den Trolleys.
 */
describe('Trolley', () => {
  const tag = (n: number) => new Date(inTagen(n)).toISOString().slice(0, 10)
  const JONAS: Person = { ...ICH, id: 'p-j', fn: 'Jonas', ln: 'Berger' }
  const termin = (over: Partial<TrolleyTermin> = {}): TrolleyTermin => ({
    id: 'r1', trolleyId: 'tr3', datum: tag(5), von: '09:00', bis: '11:00', pid: 'p-j', partner: 'p-a', gemeinsam: true, ...over,
  })
  const mit = (termine: TrolleyTermin[]) =>
    zeige({ persons: [ICH, JONAS], trolleys: [{ id: 'tr3', name: 'Trolley 3', ort: '', hinweis: '' }], trolleyTermine: termine })
  const bereich = (c: HTMLElement) => c.querySelector('[data-bereich="trolley"]')

  it('ohne eigene kommende Termine steht der Bereich nicht da — fremde und vergangene zählen nicht', () => {
    const { container } = mit([termin({ partner: null }), termin({ id: 'alt', datum: tag(-2), pid: 'p-a', partner: null })])
    expect(bereich(container)).toBeNull()
  })

  it('je Termin: Trolley und mit wem, darunter Tag und Zeit — verabredet, ohne Zusage, ohne Haken', () => {
    const { container } = mit([termin(), termin({ id: 'r2', datum: tag(7), pid: 'p-a', partner: null, gemeinsam: false })])
    const b = bereich(container)!
    expect(b.querySelector('h2')?.textContent).toBe(t.privZeugnis)
    expect([...b.querySelectorAll('.aufgaben-zeile-titel')].map((e) => e.textContent)).toEqual([
      'Trolley 3 · mit Jonas Berger',
      `Trolley 3 · ${t.trolleyPartnerGesucht}`,
    ])
    expect(b.querySelector('.aufgaben-zeile .klein-text')?.textContent).toMatch(/ · 09:00–11:00 · verabredet, ohne Zusage$/)
    expect(b.querySelector('.knopf-haken')).toBeNull()
  })

  it('ein Tipp führt zu den Trolleys', () => {
    const { container, dispatch } = mit([termin()])
    fireEvent.click(bereich(container)!.querySelector('.aufgaben-zeile-text')!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'setFsBereich', bereich: 'trolleys' })
    expect(dispatch).toHaveBeenCalledWith({ type: 'navigate', screen: 'programm', thema: 'predigtdienst' })
  })
})
