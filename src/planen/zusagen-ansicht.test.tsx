/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import {
  AppDispatchContext,
  AppStateContext,
  AppStoreContext,
  type AppState,
  useStaticStore,
} from '../app/context'
import { demoZustand } from '../../tests/testdaten/demo-start'
import { offeneMeldungen } from '../data/plan-versand'
import { sentKey } from '../data/planning'
import { dict } from '../i18n/ui'
import { fill } from '../i18n/useT'
import { PlanenScreen } from './PlanenScreen'

/**
 * **Die Zusagen der Woche an der Oberfläche** (T121, Phase 5g,
 * `GRueckmeldungen`): was zu klären ist, wer wartet, wer zugesagt hat — und die
 * Wege hin und zurück. Welcher Platz in welcher Lage steht, prüft
 * `data/zusagen.test.ts`; hier zählt, was der Planer sieht und tun kann.
 * Gerechnet wird mit der Demo-Woche vom 7. September.
 */

const t = dict('de')

// „Jetzt erinnern" geht an die Function — hier abgefangen.
const erinnerungSenden = vi.fn()
vi.mock('../lib/data', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/data')>()),
  erinnerungSenden: (weekStart: string, heute: string) => erinnerungSenden(weekStart, heute),
}))

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

/**
 * **Noch nicht angemeldet** (Phase 5g-2): Wer kein Konto hat, steht ohne
 * `user_id` im Versand-Tagebuch — erreicht hat ihn nichts. Gesendet ist hier die
 * ganze Woche; Elke Brandt hat kein Konto.
 */
describe('Noch nicht angemeldet', () => {
  /** `bescheid`: wann der Planer abgehakt hat, dass er es Elke gesagt hat — `null`: noch nicht. */
  function gesendet(bescheid: string | null = null): Partial<AppState> {
    const s = demoZustand()
    const woche = s.weeks.find((w) => w.start === '2026-09-07')!
    const meldungen = offeneMeldungen(woche, undefined, s.services, s.confirmations, {}, s.congregation.times, new Date(2026, 8, 7, 9))
    const sentLog = Object.fromEntries(meldungen.map((m) => [sentKey(m.key, m.name), '2026-09-06T18:00:00.000Z']))
    const persoenlich = Object.fromEntries(
      Object.keys(sentLog)
        .filter((k) => k.endsWith(' Elke Brandt'))
        .map((k) => [k, bescheid]),
    )
    return { sentLog, persoenlich }
  }
  const haken = (c: HTMLElement) =>
    karte(c, t.zusagenOhneKonto)!.querySelector<HTMLInputElement>(
      `input[aria-label="${fill(t.zusagenWeissBescheid, { name: 'Elke Brandt' })}"]`,
    )!

  it('wer kein Konto hat, steht dort mit dem Hinweis — und nicht unter „Warten auf Zusage"', () => {
    const { container } = zeige(gesendet())
    const ohne = karte(container, t.zusagenOhneKonto)!
    expect(ohne.textContent).toContain(t.zusagenOhneKontoHinweis)
    expect(ohne.textContent).toContain('Elke Brandt')
    expect(karte(container, t.zusagenWarten)?.textContent ?? '').not.toContain('Elke Brandt')
  })

  it('der Haken sagt der App, dass es ihm jemand gesagt hat', () => {
    const { container, dispatch } = zeige(gesendet())
    expect(haken(container).checked).toBe(false)
    fireEvent.click(haken(container))
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'persoenlichBescheid', name: 'Elke Brandt', ja: true }))
  })

  it('wem es schon jemand gesagt hat, der steht abgehakt da — ein Tipp nimmt den Haken weg', () => {
    const { container, dispatch } = zeige(gesendet('2026-09-06T19:30:00.000Z'))
    expect(haken(container).checked).toBe(true)
    fireEvent.click(haken(container))
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'persoenlichBescheid', name: 'Elke Brandt', ja: false }))
  })
})

/**
 * **Jetzt erinnern** (Phase 5g-3): Unter den Wartenden steht, wann die nächste
 * Erinnerung von selbst hinausgeht — und, sobald einer von ihnen die Nachricht
 * hat, „Jetzt erinnern". Die Uhr steht in UTC vor dem täglichen Lauf (08:00
 * UTC), damit „heute" in jeder Zeitzone dasselbe meint: Am Dienstag ist
 * Zusammenkunft, der Vortag ist der Tag der letzten Erinnerung.
 */
describe('Jetzt erinnern', () => {
  beforeEach(() => {
    vi.setSystemTime(new Date(Date.UTC(2026, 8, 7, 7, 0)))
    erinnerungSenden.mockReset()
  })
  const warten = (c: HTMLElement) => karte(c, t.zusagenWarten)!
  const knopf = (c: HTMLElement) =>
    [...warten(c).querySelectorAll('button')].find((b) => b.textContent === t.zusagenErinnern)
  /** Gesendet ist die ganze Woche — wer wartet, hat die Nachricht. */
  function gesendet(): Partial<AppState> {
    const s = demoZustand()
    const woche = s.weeks.find((w) => w.start === '2026-09-07')!
    const meldungen = offeneMeldungen(woche, undefined, s.services, s.confirmations, {}, s.congregation.times, new Date(2026, 8, 7, 9))
    return { sentLog: Object.fromEntries(meldungen.map((m) => [sentKey(m.key, m.name), '2026-09-06T18:00:00.000Z'])) }
  }

  it('unter den Wartenden steht, wann die nächste Erinnerung von selbst hinausgeht', () => {
    const { container } = zeige()
    expect(warten(container).textContent).toContain(fill(t.zusagenNaechsteErinnerung, { wann: 'heute' }))
  })

  it('ohne gesendete Nachricht gibt es nichts zu erinnern — zuerst kommt „Plan senden"', () => {
    const { container } = zeige()
    expect(knopf(container)).toBeUndefined()
  })

  it('„Jetzt erinnern" geht an die Woche, mit dem Kalendertag — und sagt, wie viele es waren', async () => {
    erinnerungSenden.mockResolvedValue({ personen: 2, schonHeute: 0 })
    const { container, dispatch } = zeige(gesendet())
    fireEvent.click(knopf(container)!)
    await waitFor(() => expect(dispatch).toHaveBeenCalledWith({ type: 'showToast', text: fill(t.toastErinnert, { n: 2 }) }))
    expect(erinnerungSenden).toHaveBeenCalledWith('2026-09-07', '2026-09-07')
  })

  it('wer heute schon eine Erinnerung hatte, bekommt keine zweite — das sagt der Hinweis', async () => {
    erinnerungSenden.mockResolvedValue({ personen: 0, schonHeute: 3 })
    const { container, dispatch } = zeige(gesendet())
    fireEvent.click(knopf(container)!)
    await waitFor(() => expect(dispatch).toHaveBeenCalledWith({ type: 'showToast', text: t.toastSchonErinnert }))
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
