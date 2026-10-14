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
 * stehen, prüft `components/abwesenheiten.test.ts`.
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
  const k = container.querySelector<HTMLElement>('.abw-karte')
  if (!k) throw new Error('Abwesenheiten-Karte nicht gefunden')
  return k
}

/** Die Zeiträume in der Karte, je mit Grund. */
const inDerKarte = (container: HTMLElement): string[] =>
  [...karte(container).querySelectorAll('.abw-zeile .klein-text')].map((e) => e.textContent ?? '')

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

describe('Bei einer Person — ihre Abwesenheiten', () => {
  // Die Uhr vor den Zeiträumen: Die Karte zeigt nur, was ansteht.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 7, 31, 9))
  })
  afterEach(() => vi.useRealTimers())

  const zeigen = (over: Partial<AppState> = {}, dispatch?: () => void) =>
    render(
      <Buehne state={basis({ planner: true, ...over })} dispatch={dispatch}>
        <PersonDetail person={ANDERE} />
      </Buehne>,
    )

  it('stehen in ihrer Karte — und nur ihre, nicht die des Angemeldeten', () => {
    /*
     * Wie im Entwurf `GPerson` (T121, Phase 6b): eine Karte „Abwesenheiten" mit
     * dem, was ansteht. Bis dahin standen sie nur in der Zeitleiste.
     */
    const { container } = zeigen({
      absences: [abw('a1', 'p-andere', null, '2026-09-01'), abw('a2', 'p-ich', 'u-ich', '2026-09-02')],
    })
    expect(inDerKarte(container)).toEqual(['Grund a1'])
  })

  it('in der Zeitleiste stehen sie im Zusammenhang — dort ohne ✕', () => {
    const { container } = zeigen({ absences: [abw('a1', 'p-andere', null, '2026-09-01')] })
    expect(zeitleiste(container)).toEqual(['Abwesend · Grund a1'])
    expect(container.querySelector('.zeit-karte .entfernen')).toBeNull()
  })

  it('ohne eine sagt die Karte das', () => {
    const { container } = zeigen({ absences: [] })
    expect(karte(container).textContent).toContain('Keine eingetragen.')
  })

  it('entfernt wird in der Karte — erst nach der Rückfrage', () => {
    const dispatch = vi.fn()
    const { container } = zeigen({ absences: [abw('a1', 'p-andere', null, '2026-09-01')] }, dispatch)
    const knopf = () => karte(container).querySelector('.abw-entfernen')!
    // Mit Rückfrage (4.10.2026): Der erste Tipp fragt nur.
    fireEvent.click(knopf())
    expect(dispatch).not.toHaveBeenCalledWith({ type: 'removeAbsence', id: 'a1' })
    fireEvent.click(knopf())
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
    expect(container.querySelector('.abw-entfernen')).toBeNull()
    expect(inDerKarte(container)).toEqual(['Grund a1']) // lesen darf er
    expect(zeitleiste(container)).toEqual(['Abwesend · Grund a1'])
  })
})
