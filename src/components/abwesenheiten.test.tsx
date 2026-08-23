/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import {
  AppDispatchContext,
  AppStateContext,
  AppStoreContext,
  type AppState,
  useStaticStore,
} from '../app/context'
import { initialState } from '../app/init'
import { emptyQualifications } from '../data/helpers'
import type { Absence, Person } from '../data/types'
import { AufgabenScreen } from '../aufgaben/AufgabenScreen'
import { PersonDetail } from '../personen/PersonDetail'

/**
 * Wer welche Abwesenheit sieht — und auf wen eine neue ausgestellt wird.
 *
 * Die Karte steht seit August 2026 an **zwei** Stellen: im persönlichen Bereich
 * für die eigenen, im Personen-Detail für die einer anderen Person. Beide
 * Fragen dieser Datei gehen deshalb an **beide** Aufrufer, denn genau hier
 * lauert die Fehlerart des Projekts: Die Karte ist richtig, und der zweite
 * Aufrufer reicht die falsche Person hinein.
 *
 * Der zweite Teil ist die Gegenprobe zum Import: Eine Abwesenheit **ohne
 * Ersteller** (`userId` null) gehört trotzdem jemandem — der Person.
 */

function Buehne({
  state,
  dispatch = () => {},
  children,
}: {
  state: AppState
  dispatch?: () => void
  children: ReactNode
}) {
  const store = useStaticStore(state)
  return (
    <AppDispatchContext.Provider value={dispatch}>
      <AppStoreContext.Provider value={store}>
        <AppStateContext.Provider value={state}>{children}</AppStateContext.Provider>
      </AppStoreContext.Provider>
    </AppDispatchContext.Provider>
  )
}

afterEach(cleanup)

const person = (id: string, fn: string): Person => ({
  id, fn, ln: 'Muster', role: 'verkuendiger', tel: '', mail: '', priv: emptyQualifications(),
})

const ICH = person('p-ich', 'Ich')
const ANDERE = person('p-andere', 'Andere')

const abw = (id: string, personId: string | null, userId: string | null, from: string): Absence =>
  ({ id, personId, userId, from, to: from, reason: `Grund ${id}` })

/** Die Abwesenheiten-Karte im gerenderten Baum. */
function karte(container: HTMLElement): HTMLElement {
  const panel = [...container.querySelectorAll('.panel')].find(
    (p) => p.querySelector('.panel-label')?.textContent === 'ABWESENHEITEN',
  )
  if (!panel) throw new Error('Abwesenheiten-Karte nicht gefunden')
  return panel as HTMLElement
}

const gruende = (el: HTMLElement): string[] =>
  [...el.querySelectorAll('.abs-reason-text')].map((e) => e.textContent ?? '')

const basis = (over: Partial<AppState>): AppState => ({
  ...initialState(),
  userId: 'u-ich',
  personId: 'p-ich',
  persons: [ICH, ANDERE],
  ...over,
})

describe('Personen-Detail — die Abwesenheiten dieser Person', () => {
  const zeigen = (over: Partial<AppState> = {}, dispatch?: () => void) =>
    render(
      <Buehne state={basis({ planner: true, ...over })} dispatch={dispatch}>
        <PersonDetail person={ANDERE} />
      </Buehne>,
    )

  it('zeigt ihre Abwesenheiten — und nur ihre', () => {
    const { container } = zeigen({
      absences: [abw('a1', 'p-andere', null, '2026-09-01'), abw('a2', 'p-ich', 'u-ich', '2026-09-02')],
    })
    expect(gruende(karte(container))).toEqual(['Grund a1'])
  })

  it('trägt eine neue auf DIESE Person ein, nicht auf die eigene', () => {
    /*
     * Der Kern der Sache. Die Karte kennt zwei Personen — die angemeldete und
     * die angezeigte —, und nur eine davon ist gemeint. Griffe sie zur
     * eigenen, landete die Abwesenheit beim Planer: In seiner Liste sähe er sie
     * nicht (die filtert über die Person), beim Gemeinten stünde sie auch nicht.
     */
    const dispatch = vi.fn()
    const { container } = zeigen({ absences: [] }, dispatch)
    const panel = karte(container)
    waehleDatum(panel, 'VON')
    waehleDatum(panel, 'BIS')
    fireEvent.click(within(panel).getByText('ABWESENHEIT EINTRAGEN'))

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'addAbsence',
        absence: expect.objectContaining({ personId: 'p-andere', userId: 'u-ich' }),
      }),
    )
  })

  it('ohne Planer-Recht kein Formular für eine fremde Person', () => {
    // Dieselbe Grenze zieht die Datenbank (`absences_write`). Ein Formular, das
    // ins Leere schriebe, wäre schlimmer als keins: Der Eintrag stünde da und
    // wäre beim nächsten Laden weg.
    const { container } = zeigen({ planner: false, absences: [abw('a1', 'p-andere', null, '2026-09-01')] })
    const panel = karte(container)
    expect(within(panel).queryByText('ABWESENHEIT EINTRAGEN')).toBeNull()
    expect(gruende(panel)).toEqual(['Grund a1']) // lesen darf er
  })
})

describe('Meine Aufgaben — „Deine Einträge"', () => {
  const zeigen = (absences: Absence[], over: Partial<AppState> = {}) =>
    render(
      <Buehne state={basis({ absences, ...over })}>
        <AufgabenScreen />
      </Buehne>,
    )

  it('zeigt die auf die eigene Person ausgestellten — auch die importierten ohne Ersteller', () => {
    const { container } = zeigen([abw('a1', 'p-ich', null, '2026-09-01')])
    expect(gruende(karte(container))).toEqual(['Grund a1'])
  })

  it('zeigt NICHT, was der Planer für andere eingetragen hat', () => {
    /*
     * Die Zeile trägt sein Konto als Ersteller — nach dem Ersteller gefiltert
     * stünden dem Planer die Abwesenheiten der ganzen Versammlung in seiner
     * persönlichen Liste. Wen es betrifft, sagt die Person.
     */
    const { container } = zeigen([abw('a1', 'p-andere', 'u-ich', '2026-09-01')])
    expect(gruende(karte(container))).toEqual([])
  })

  it('ein Konto ohne eigene Person findet seine Einträge über den Ersteller wieder', () => {
    // Der Fall, für den `userId` überhaupt gedacht war.
    const { container } = zeigen([abw('a1', null, 'u-ich', '2026-09-01')], { personId: null })
    expect(gruende(karte(container))).toEqual(['Grund a1'])
  })
})

/** Im Datumsfeld `label` den letzten wählbaren Tag des offenen Monats anklicken. */
function waehleDatum(panel: HTMLElement, label: string): void {
  fireEvent.click(within(panel).getByRole('button', { name: label }))
  const tage = [...panel.querySelectorAll('.dp-day:not([disabled])')]
  const letzter = tage[tage.length - 1]
  if (!letzter) throw new Error(`Kein wählbarer Tag im Feld „${label}"`)
  fireEvent.click(letzter)
}
