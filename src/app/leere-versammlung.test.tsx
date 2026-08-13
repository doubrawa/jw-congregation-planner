/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import type { ReactNode } from 'react'
import {
  AppDispatchContext,
  AppStateContext,
  AppStoreContext,
  type AppState,
  useStaticStore,
} from './context'
import { initialState } from './init'
import { dict } from '../i18n/ui'
import { ProgrammScreen } from '../programm/ProgrammScreen'
import { PlanenScreen } from '../planen/PlanenScreen'
import { DashboardScreen } from '../dashboard/DashboardScreen'
import { AufgabenScreen } from '../aufgaben/AufgabenScreen'

/**
 * **Eine frisch eingerichtete Versammlung hat keine einzige Woche.**
 *
 * Sie wird nicht mehr mit Demo-Wochen befüllt: Der Administrator legt sie an,
 * und die erste Woche holt der Planer über „Nächste Woche importieren". Bis
 * dahin ist `weeks` leer — und genau dann öffnet der Planer erfahrungsgemäß
 * als Erstes das Programm.
 *
 * Jeder Bildschirm, der eine Woche anzeigt, greift dafür auf
 * `state.weeks[state.week]` zu. Ohne Prüfung ist das `undefined`, und der
 * nächste Zugriff darauf reißt die ganze Ansicht mit — sichtbar als weiße
 * Seite, nicht als Fehlermeldung. Dieser Test hält fest, dass es nicht
 * passiert, und dass stattdessen der Hinweis auf den Import dasteht.
 */

function Buehne({ state, children }: { state: AppState; children: ReactNode }) {
  const store = useStaticStore(state)
  return (
    <AppDispatchContext.Provider value={() => {}}>
      <AppStoreContext.Provider value={store}>
        <AppStateContext.Provider value={state}>{children}</AppStateContext.Provider>
      </AppStoreContext.Provider>
    </AppDispatchContext.Provider>
  )
}

/** Zustand wie nach dem Anmelden in einer frisch angelegten Versammlung. */
function leereVersammlung(over: Partial<AppState> = {}): AppState {
  return {
    ...initialState(),
    dataStatus: 'ready',
    congregationId: 'c1',
    userId: 'u1',
    personId: 'p-planer',
    planner: true,
    weeks: [],
    fsWeeks: [],
    persons: [
      { id: 'p-planer', fn: 'Vor', ln: 'Name', role: 'aeltester', tel: '', mail: '', priv: {}, grp: null } as AppState['persons'][number],
    ],
    myTasks: [],
    pendingIds: [],
    notifs: [],
    absences: [],
    groups: [],
    ...over,
  }
}

afterEach(cleanup)

const t = dict('de')

describe('Leere Versammlung: kein Absturz ohne importierte Woche', () => {
  it('Programm zeigt den Hinweis auf den Import', () => {
    const { getByText } = render(
      <Buehne state={leereVersammlung()}>
        <ProgrammScreen />
      </Buehne>,
    )
    expect(getByText(t.keineWochenTitel)).toBeTruthy()
    expect(getByText(t.keineWochenHinweis)).toBeTruthy()
  })

  it('Planen ebenso', () => {
    const { getByText } = render(
      <Buehne state={leereVersammlung({ screen: 'planen' })}>
        <PlanenScreen />
      </Buehne>,
    )
    expect(getByText(t.keineWochenTitel)).toBeTruthy()
  })

  it('Planen auch auf dem Reiter „Bearbeiten" (T64)', () => {
    // Der Reiter zeigt die Einstellungen **einer Woche** — ohne Woche gibt es
    // nichts einzustellen, und der Hinweis muss trotzdem stehen.
    expect(() =>
      render(
        <Buehne state={leereVersammlung({ screen: 'planen', tab: 'edit' })}>
          <PlanenScreen />
        </Buehne>,
      ),
    ).not.toThrow()
  })

  it('Planen auch auf dem Reiter „Predigtdienst"', () => {
    expect(() =>
      render(
        <Buehne state={leereVersammlung({ screen: 'planen', tab: 'fs' })}>
          <PlanenScreen />
        </Buehne>,
      ),
    ).not.toThrow()
  })

  it('Start und Aufgaben halten es ebenfalls aus', () => {
    // Beide rechnen über die Wochen (laufende Woche, eigene Aufgaben) und
    // hatten damit denselben Zugriff.
    expect(() =>
      render(
        <Buehne state={leereVersammlung()}>
          <DashboardScreen />
        </Buehne>,
      ),
    ).not.toThrow()
    cleanup()
    expect(() =>
      render(
        <Buehne state={leereVersammlung({ screen: 'aufgaben' })}>
          <AufgabenScreen />
        </Buehne>,
      ),
    ).not.toThrow()
  })

  it('und die Wochennavigation steht auf beiden Seiten still', () => {
    // `state.week` ist 0, `weeks.length - 1` ist -1: Ohne Prüfung wäre
    // „nächste Woche" bedienbar und liefe ins Leere.
    const { container } = render(
      <Buehne state={leereVersammlung()}>
        <ProgrammScreen />
      </Buehne>,
    )
    const knoepfe = [...container.querySelectorAll('button')].filter((b) =>
      /Woche/.test(b.getAttribute('aria-label') ?? ''),
    )
    expect(knoepfe.every((b) => b.disabled)).toBe(true)
  })
})
