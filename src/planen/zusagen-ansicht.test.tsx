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
import { PlanenScreen } from './PlanenScreen'

/**
 * **Die Zusagen der Woche an der Oberfläche** (T121, Phase 5g,
 * `GRueckmeldungen`): was zu klären ist, wer wartet, wer zugesagt hat — und die
 * Wege hin und zurück. Welcher Platz in welcher Lage steht, prüft
 * `data/zusagen.test.ts`; hier zählt, was der Planer sieht und tun kann.
 * Gerechnet wird mit der Demo-Woche vom 7. September.
 */

const t = dict('de')

function zeige(over: Partial<AppState> = {}) {
  const dispatch = vi.fn()
  const state: AppState = {
    ...demoZustand(),
    screen: 'planen',
    tab: 'zusagen',
    dataStatus: 'ready',
    congregationId: 'c1',
    userId: 'u1',
    planner: true,
    ...over,
  }
  function Buehne() {
    const store = useStaticStore(state)
    return (
      <AppDispatchContext.Provider value={dispatch}>
        <AppStoreContext.Provider value={store}>
          <AppStateContext.Provider value={state}>
            <PlanenScreen />
          </AppStateContext.Provider>
        </AppStoreContext.Provider>
      </AppDispatchContext.Provider>
    )
  }
  return { dispatch, ...render(<Buehne />) }
}

/** Die Ansicht der gezeigten Woche — der Streifen zeichnet auch die Nachbarn. */
const ansicht = (c: HTMLElement) =>
  [...c.querySelectorAll<HTMLElement>('.screen.zusagen')].find((s) => s.textContent?.includes('7.–13. September'))!
const karte = (c: HTMLElement, titel: string) =>
  [...ansicht(c).querySelectorAll<HTMLElement>('.zusagen-karte')].find((k) =>
    k.querySelector('.karte-titel')?.textContent?.startsWith(titel),
  )

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 8, 7, 9, 0)) // Montag, 7. September 2026
  window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  delete (window as { matchMedia?: unknown }).matchMedia
})

describe('Die Zusagen der Woche', () => {
  it('drei Karten in der Reihenfolge der Arbeit: zu klären, warten, zugesagt — je mit ihrer Zahl', () => {
    const { container } = zeige()
    const titel = [...ansicht(container).querySelectorAll('.zusagen-karte .karte-titel')].map((h) => h.textContent)
    expect(titel.map((h) => h?.replace(/ · \d+$/, ''))).toEqual([t.zuKlaeren, t.zusagenWarten, t.zusagenZugesagt])
    expect(titel.every((h) => / · \d+$/.test(h ?? ''))).toBe(true)
  })

  it('ein Problem nennt seinen Grund — und „Zuteilen" öffnet den Platz', () => {
    const { container, dispatch } = zeige()
    const zeile = [...karte(container, t.zuKlaeren)!.querySelectorAll('.zusage-zeile')].find((z) =>
      z.textContent?.includes('Bernd Klein'),
    )!
    // Ein Hilfsdienst: Nach der Absage sucht die App selbst Ersatz.
    expect(zeile.querySelector('.zusage-grund')?.textContent).toContain(t.spurErsatzGesucht)
    fireEvent.click(zeile.querySelector('.knopf-pille')!)
    expect(dispatch).toHaveBeenCalledWith({
      type: 'openSlot',
      sel: expect.objectContaining({ kind: 'helper', svc: 'mik' }),
    })
  })

  it('wer wartet, steht mit seinem Tag und seit wann die Nachricht draußen ist', () => {
    const { container } = zeige()
    const zeilen = [...karte(container, t.zusagenWarten)!.querySelectorAll('.zusage-zeile')].map((z) => z.textContent)
    expect(zeilen.length).toBeGreaterThan(0)
    expect(zeilen.every((z) => z?.includes('Dienstag ·') || z?.includes('Sonntag ·'))).toBe(true)
    expect(zeilen.every((z) => z?.includes(t.zusagenNichtGesendet) || z?.includes('gesendet vor'))).toBe(true)
  })

  it('wer zugesagt hat, steht mit Namen in einem Satz — jeder einmal', () => {
    const { container } = zeige()
    const satz = karte(container, t.zusagenZugesagt)!.querySelector('.zusagen-namen')?.textContent ?? ''
    expect(satz).toMatch(/ und /)
    const namen = satz.split(/, | und /)
    expect(new Set(namen).size).toBe(namen.length)
  })

  it('zurück in den Plan führen Zurück und der Schritt „Zuteilen" der Spur', () => {
    const { container, dispatch } = zeige()
    fireEvent.click(ansicht(container).querySelector(`.unteransicht-kopf [aria-label="${t.a11yZurueck}"]`)!)
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'setTab', tab: 'mid' })
    dispatch.mockClear()
    const zuteilen = [...ansicht(container).querySelectorAll('.spur-ziel')].find((b) => b.textContent?.startsWith(t.spurZuteilen))!
    fireEvent.click(zuteilen)
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'setTab', tab: 'mid' })
  })

  it('ist die Woche vorbei, steht nur der Hinweis da — nichts wartet mehr', () => {
    vi.setSystemTime(new Date(2026, 8, 14, 9, 0)) // eine Woche später
    const wi = demoZustand().weeks.findIndex((w) => w.start === '2026-09-07')
    const { container } = zeige({ week: wi })
    expect(ansicht(container).querySelector('.zusagen-karte')).toBeNull()
    expect(ansicht(container).textContent).toContain(t.zusagenLeer)
  })

  it('auch der Planer, der nicht Admin ist, sieht sie', () => {
    const { container } = zeige({ planner: false, zuteiler: true })
    expect(container.querySelector('.screen.zusagen')).not.toBeNull()
  })

  it('wer nicht zuteilt, bekommt sie nicht — der Gruppenaufseher plant die Treffpunkte', () => {
    const { container } = zeige({ planner: false, zuteiler: false, personId: 'p1' })
    expect(container.querySelector('.screen.zusagen')).toBeNull()
  })
})

describe('Vom Plan zu den Zusagen', () => {
  it('der Schritt „Zusagen" der Spur ist ein Weg', () => {
    const { container, dispatch } = zeige({ tab: 'mid' })
    const zusagen = [...container.querySelectorAll('.spur-ziel')].find((b) => b.textContent?.startsWith(t.spurZusagen))!
    fireEvent.click(zusagen)
    expect(dispatch).toHaveBeenCalledWith({ type: 'setTab', tab: 'zusagen' })
  })
})
