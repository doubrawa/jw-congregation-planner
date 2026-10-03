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
import { emptyQualifications } from '../data/helpers'
import { dict } from '../i18n/ui'
import { fill } from '../i18n/useT'
import { ProgrammScreen } from '../programm/ProgrammScreen'
import type { Person, VortragAuswaerts, Week } from '../data/types'
import { PlanenScreen } from './PlanenScreen'

/**
 * **Redner auswärts an der Oberfläche** (T120, Phase 4): wer den Reiter sieht,
 * was der Planer einträgt und umbesetzt, welche Konflikte er sieht und was der
 * Redner selbst tun kann. Die Regeln dahinter prüfen `data/auswaerts.test.ts`
 * und `app/auswaerts-reducer.test.ts`.
 */

const t = dict('de')

const person = (id: string, fn: string, vortrag: boolean): Person => ({
  id,
  fn,
  ln: 'Test',
  role: 'aeltester',
  female: false,
  tel: '',
  mail: '',
  priv: { ...emptyQualifications(), vortrag },
})
const HELMUT = person('p-h', 'Helmut', true)
const JONAS = person('p-j', 'Jonas', true)
const OTTO = person('p-o', 'Otto', false)

const vortrag = (id: string, datum: string, pid: string | null): VortragAuswaerts => ({
  id,
  datum,
  zeit: '10:00',
  versammlung: 'Beispielheim',
  nummer: 12,
  pid,
})

/** Woche ab 7.9.2026; am Sonntag, 13.9., hat Helmut den Vorsitz. */
const leer = { date: '', end: '', helpers: {}, sections: [] }
const WOCHE: Week = {
  range: '7.–13. September',
  book: '',
  start: '2026-09-07',
  mid: { ...leer },
  we: {
    ...leer,
    sections: [
      {
        label: 'ERÖFFNUNG',
        farbe: 'neutral',
        items: [{ iid: 'i1', title: 'Lied 1 · Gebet', meta: '', names: [{ name: 'Helmut Test', rolle: 'Vorsitz', pid: HELMUT.id }] }],
      },
    ],
  },
}

function zeige(Screen: () => React.JSX.Element, over: Partial<AppState> = {}) {
  const dispatch = vi.fn()
  const state: AppState = {
    ...demoZustand(),
    tab: 'va',
    dataStatus: 'ready',
    congregationId: 'c1',
    userId: 'u1',
    personId: JONAS.id,
    planner: false,
    persons: [HELMUT, JONAS, OTTO],
    weeks: [WOCHE],
    week: 0,
    absences: [],
    auswaerts: [vortrag('v1', '2026-09-13', HELMUT.id), vortrag('v2', '2026-10-11', JONAS.id)],
    confirmations: {},
    sentLog: {},
    ...over,
  }
  function Buehne() {
    const store = useStaticStore(state)
    return (
      <AppDispatchContext.Provider value={dispatch}>
        <AppStoreContext.Provider value={store}>
          <AppStateContext.Provider value={state}>
            <Screen />
          </AppStateContext.Provider>
        </AppStoreContext.Provider>
      </AppDispatchContext.Provider>
    )
  }
  return { dispatch, ...render(<Buehne />) }
}

const knopf = (c: HTMLElement, text: string) =>
  [...c.querySelectorAll('button')].filter((b) => b.textContent === text)
const reiter = (c: HTMLElement) => [...c.querySelectorAll('.meeting-tab')].map((b) => b.textContent)

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 8, 7, 9, 0))
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('Wer den Reiter sieht', () => {
  it('beim Ansehen, sobald ein Vortrag kommt — sonst fehlt er, und die Zusammenkunft steht da', () => {
    expect(reiter(zeige(ProgrammScreen, { screen: 'programm' }).container)).toContain(t.vaTab)
    cleanup()
    const ohne = zeige(ProgrammScreen, { screen: 'programm', auswaerts: [vortrag('alt', '2026-08-30', JONAS.id)] })
    expect(reiter(ohne.container)).not.toContain(t.vaTab)
    expect(ohne.container.textContent).not.toContain(t.vaTitel)
  })

  it('beim Planen der Planer — mit der Zahl der möglichen Konflikte', () => {
    const { container } = zeige(PlanenScreen, { screen: 'planen', planner: true })
    const va = [...container.querySelectorAll('.meeting-tab')].find((b) => b.textContent?.startsWith(t.vaTab))
    expect(va?.querySelector('.meeting-tab-zahl')?.textContent).toBe('1')
    expect(va?.getAttribute('aria-label')).toBe(`${t.vaTab} · ${t.konflikteTitle}: 1`)
  })
})

describe('Ansehen: der eigene Vortrag', () => {
  it('trägt das DU und lässt sich bestätigen — oder der Redner ist verhindert', () => {
    const { container, dispatch } = zeige(ProgrammScreen, { screen: 'programm' })
    expect(container.querySelectorAll('.chip-du')).toHaveLength(1)
    expect(knopf(container, t.bestaetigen)).toHaveLength(1)
    fireEvent.click(knopf(container, t.bestaetigen)[0]!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'confirmTask', id: 'va|2026-10-05|v2' })
    fireEvent.click(knopf(container, t.verhindert)[0]!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'declineTask', id: 'va|2026-10-05|v2' })
  })

  it('nennt Versammlung und Nummer', () => {
    const { container } = zeige(ProgrammScreen, { screen: 'programm' })
    expect(container.textContent).toContain(`Vers. Beispielheim · ${fill(t.vaNummer, { n: 12 })}`)
  })
})

describe('Planen', () => {
  it('nennt den Redner, der am selben Tag in der eigenen Zusammenkunft eingeteilt ist', () => {
    const { container } = zeige(PlanenScreen, { screen: 'planen', planner: true })
    const satz = `${fill(t.vaKonfliktZusammenkunft, { name: 'Helmut Test' })} · Vorsitz`
    expect(container.querySelector('.plan-conflicts')?.textContent).toContain(satz)
    expect(container.querySelector('.va-problem')?.textContent).toBe(satz)
  })

  it('zur Wahl stehen, wer Vorträge hält und an dem Tag nicht abwesend ist', () => {
    const absences = [{ id: 'a', personId: JONAS.id, userId: null, from: '2026-09-13', to: '2026-09-13', reason: '' }]
    const { container, dispatch } = zeige(PlanenScreen, { screen: 'planen', planner: true, absences })
    const wahl = container.querySelector(`.va-redner-zeile select`) as HTMLSelectElement
    expect([...wahl.options].map((o) => o.textContent)).toEqual([t.zuteilenChip, 'Helmut Test'])
    fireEvent.change(wahl, { target: { value: '' } })
    expect(dispatch).toHaveBeenCalledWith({ type: 'vaRedner', id: 'v1', pid: null })
  })

  it('ein Vortrag lässt sich streichen', () => {
    const { container, dispatch } = zeige(PlanenScreen, { screen: 'planen', planner: true })
    fireEvent.click(container.querySelector(`.va-kopf button[aria-label="${t.a11yRemove}"]`)!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'vaRemove', id: 'v1' })
  })

  it('ein neuer Vortrag braucht Tag und Versammlung — Nummer und Redner dürfen fehlen', () => {
    const { container, dispatch } = zeige(PlanenScreen, { screen: 'planen', planner: true })
    const hinzu = knopf(container, t.hinzufuegen)[0]!
    expect(hinzu).toHaveProperty('disabled', true)

    fireEvent.click(container.querySelector(`button[aria-label="${t.datumPh}"]`)!)
    const tag = [...container.querySelectorAll('.dp-grid .dp-day:not(.dp-day--muted)')].find((b) => b.textContent === '20')
    fireEvent.click(tag!)
    fireEvent.change(container.querySelector(`input[aria-label="${t.versammlungLbl}"]`)!, { target: { value: ' Beispielheim ' } })
    fireEvent.change(container.querySelector(`input[aria-label="${t.vaNummerLbl}"]`)!, { target: { value: 'Nr. 34' } })
    expect(hinzu).toHaveProperty('disabled', false)
    fireEvent.click(hinzu)
    expect(dispatch).toHaveBeenCalledWith({
      type: 'vaAdd',
      vortrag: { datum: '2026-09-20', zeit: '10:00', versammlung: 'Beispielheim', nummer: 34, pid: null },
    })
  })

  it('wer zugeteilt ist und noch nichts weiß, steht bei „Plan senden"', () => {
    const { container } = zeige(PlanenScreen, { screen: 'planen', planner: true })
    expect(container.textContent).toContain(fill(t.ozSendenOffen, { n: 2 }))
    expect(container.querySelector('.plan-senden-namen')?.textContent).toBe('Helmut Test · Jonas Test')
  })

  it('ohne Vorträge der Hinweis — und das Formular', () => {
    const { container } = zeige(PlanenScreen, { screen: 'planen', planner: true, auswaerts: [] })
    expect(container.textContent).toContain(t.vaLeer)
    expect(container.textContent).toContain(t.vaHinzufuegen)
  })
})
