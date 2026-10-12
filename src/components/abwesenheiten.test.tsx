/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import {
  AppDispatchContext,
  AppStateContext,
  AppStoreContext,
  type AppState,
  useStaticStore,
} from '../app/context'
import { demoZustand } from '../../tests/testdaten/demo-start'
import { emptyQualifications } from '../data/helpers'
import type { Absence, Person } from '../data/types'
import { PersonDetail } from '../personen/PersonDetail'

/**
 * Wer welche Abwesenheit sieht — und auf wen eine neue ausgestellt wird.
 *
 * Das Eintragen steht an **zwei** Stellen: im Profil für die eigenen, im
 * Personen-Detail für die einer anderen Person. Hier geht es um den zweiten
 * Aufrufer, denn genau dort lauert die Fehlerart des Projekts: Das Blatt ist
 * richtig, und der Aufrufer reicht die falsche Person hinein. Welche im Profil
 * stehen, prüft `profil/abwesenheiten.test.ts`.
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

beforeEach(() => {
  // Das Herunterwischen des Blatts fragt nach der Bildschirmbreite; jsdom kennt keine.
  window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia
})
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
    (p) => p.querySelector('.panel-label')?.textContent === 'Abwesenheiten',
  )
  if (!panel) throw new Error('Abwesenheiten-Karte nicht gefunden')
  return panel as HTMLElement
}

/** Die Beschriftungen der Abwesenheits-Punkte in der Zeitleiste. */
const zeitleiste = (container: HTMLElement): string[] =>
  [...container.querySelectorAll('.zeit-row')]
    .filter((r) => r.querySelector('.zeit-dot--abw'))
    .map((r) => r.querySelector('.zeit-art')?.textContent ?? '')

const basis = (over: Partial<AppState>): AppState => ({
  ...demoZustand(),
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

  it('zeigt ihre Abwesenheiten in der Zeitleiste — und nur ihre', () => {
    /*
     * Nicht mehr als Liste unter dem Formular: Die Zeiträume stehen in der
     * Zeitleiste, damit man sieht, was in sie hineinfällt. Unter dem Formular
     * steht nichts mehr — sonst stünde dasselbe zweimal da.
     */
    const { container } = zeigen({
      absences: [abw('a1', 'p-andere', null, '2026-09-01'), abw('a2', 'p-ich', 'u-ich', '2026-09-02')],
    })
    expect(zeitleiste(container)).toEqual(['Abwesend · Grund a1'])
    // Die Karte trägt nur noch das Eintragen, keine Liste.
    expect(karte(container).textContent).not.toContain('Grund a1')
  })

  it('entfernt eine Abwesenheit aus der Zeitleiste heraus', () => {
    // Die Liste unter dem Formular ist weg — ohne das ✕ an der Leiste liesse
    // sich ein Eintrag nur noch anlegen, nie wieder entfernen.
    const dispatch = vi.fn()
    const { container } = zeigen({ absences: [abw('a1', 'p-andere', null, '2026-09-01')] }, dispatch)
    const knopf = container.querySelector('.zeit-remove')
    if (!knopf) throw new Error('kein Entfernen-Knopf in der Zeitleiste')
    // Mit Rückfrage (4.10.2026): Der erste Tipp fragt nur.
    fireEvent.click(knopf)
    expect(dispatch).not.toHaveBeenCalledWith({ type: 'removeAbsence', id: 'a1' })
    fireEvent.click(container.querySelector('.zeit-remove')!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'removeAbsence', id: 'a1' })
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
    fireEvent.click(within(karte(container)).getByText('Abwesenheit eintragen'))
    // Das Blatt liegt per Portal am Ende des Dokuments.
    fireEvent.click(document.body.querySelector('.kal-tag:not(.is-fremd)')!)
    fireEvent.click(within(document.body.querySelector<HTMLElement>('.sheet')!).getByRole('button', { name: 'Abwesenheit eintragen' }))

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'addAbsence',
        absence: expect.objectContaining({ personId: 'p-andere', userId: 'u-ich' }),
      }),
    )
  })

  it('ohne Planer-Recht weder Eintragen noch Entfernen — sehen schon', () => {
    // Dieselbe Grenze zieht die Datenbank (`absences_write`). Ein Knopf, der
    // ins Leere schriebe, wäre schlimmer als keins: Der Eintrag stünde da und
    // wäre beim nächsten Laden weg.
    const { container } = zeigen({ planner: false, absences: [abw('a1', 'p-andere', null, '2026-09-01')] })
    expect(within(karte(container)).queryByText('Abwesenheit eintragen')).toBeNull()
    expect(container.querySelector('.zeit-remove')).toBeNull()
    expect(zeitleiste(container)).toEqual(['Abwesend · Grund a1']) // lesen darf er
  })
})
