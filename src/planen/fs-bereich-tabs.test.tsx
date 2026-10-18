/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import type { AppState } from '../app/context'

/**
 * **Die Bereiche des Predigtdienstes fallen auf** (Betreiber, 18.10.2026).
 *
 * „Wie mache ich denn Einträge in den Trolley-Kalender — ich habe nichts
 * gefunden": Der Kalender lag hinter dem Reiter „Trolleys", und der stand als
 * schmales Wort neben „Treffpunkte" und „Gruppenbesuche", unter dem gewählten
 * nur ein Punkt. Seitdem eine große Wahl über die ganze Breite: je Bereich ein
 * Zeichen und sein Name, der gewählte kräftig hinterlegt.
 *
 * Verteidigt wird hier der Weg, nicht das Bild (das rechnet jsdom nicht; die
 * Regeln dafür bewacht `tests/bereich-leiste.test.ts`): Jeder Bereich trägt
 * Zeichen und Namen, genau der gewählte ist gedrückt — an `aria-pressed` hängt
 * seine Fläche —, und ein Tipp führt mit dem echten Speicher von den
 * Treffpunkten der Woche in den Trolley-Kalender, beim Planen in den
 * Grundplan. Ohne den echten Speicher bewiese ein Klick nur, *dass* eine
 * Aktion abgeht, nicht, was danach dasteht.
 */
vi.mock('../app/hydrate', () => ({ loadAndHydrate: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../lib/supabase', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  supabase: null,
  isSupabaseConfigured: false,
}))

const { AppProvider } = await import('../app/store')
const { demoZustand } = await import('../../tests/testdaten/demo-start')
const { dict } = await import('../i18n/ui')
const { PlanenScreen } = await import('./PlanenScreen')
const { ProgrammScreen } = await import('../programm/ProgrammScreen')

const t = dict('de')

const TROLLEY = { id: 'tr1', name: 'Trolley 1', ort: 'Depot', hinweis: '' }
/** Zwei Wochen nach dem gestellten Montag besucht der Dienstaufseher Gruppe 2. */
const BESUCH = { id: 'b1', woche: '2026-09-21', grp: 'g2', pid: 'p2' }

/** Simon (p9) darf mit dem Trolley gehen; die Versammlung hat einen Trolley und einen kommenden Besuch. */
function start(over: Partial<AppState>): AppState {
  const demo = demoZustand()
  return {
    ...demo,
    dataStatus: 'ready',
    congregationId: 'c1',
    userId: 'u1',
    personId: 'p9',
    persons: demo.persons.map((p) => (p.id === 'p9' ? { ...p, priv: { ...p.priv, zeugnis: true } } : p)),
    trolleys: [TROLLEY],
    trolleyTermine: [],
    gruppenbesuche: [BESUCH],
    confirmations: {},
    notifs: [],
    tab: 'fs',
    fsBereich: 'treffpunkte',
    ...over,
  }
}

function zeige(Screen: () => React.JSX.Element, over: Partial<AppState> = {}) {
  const anfang = start(over)
  return render(
    <AppProvider start={() => anfang}>
      <Screen />
    </AppProvider>,
  )
}

/**
 * Die Leiste, die man sieht — neben der Woche liegen ihre Nachbarn als
 * Vorschau im DOM (`inert`), mit derselben Leiste darin.
 */
function leiste(c: HTMLElement): HTMLElement {
  const sichtbar = [...c.querySelectorAll<HTMLElement>('nav.bereich-tabs')].filter((n) => !n.closest('[inert]'))
  expect(sichtbar, 'genau eine sichtbare Leiste').toHaveLength(1)
  return sichtbar[0]!
}
const knoepfe = (c: HTMLElement) => [...leiste(c).querySelectorAll<HTMLButtonElement>('.bereich-tab')]
const knopf = (c: HTMLElement, name: string) => {
  const k = knoepfe(c).find((b) => b.textContent === name)
  if (!k) throw new Error(`Kein Bereich „${name}"`)
  return k
}
const gedrueckt = (c: HTMLElement) => knoepfe(c).filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.textContent)

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 8, 7, 9, 0)) // Montag, 7. September 2026
  // Handy-Breite; jsdom kennt matchMedia nicht.
  window.matchMedia = vi
    .fn()
    .mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }) as unknown as typeof window.matchMedia
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  delete (window as { matchMedia?: unknown }).matchMedia
})

describe('Die Bereiche des Predigtdienstes als große Wahl', () => {
  it('jeder Bereich zeigt ein eigenes Zeichen und seinen Namen', () => {
    const { container } = zeige(ProgrammScreen, { screen: 'programm' })
    expect(knoepfe(container).map((b) => b.textContent)).toEqual([t.fsTreffpunkteTab, t.fsGruppenbesucheTab, t.fsTrolleysTab])
    const zeichen = knoepfe(container).map((b) => {
      const svg = b.querySelectorAll('svg.zeichen')
      expect(svg, b.textContent ?? '').toHaveLength(1)
      return svg[0]!.innerHTML
    })
    // Drei Bereiche, drei Zeichen — nicht dreimal dasselbe.
    expect(new Set(zeichen).size).toBe(3)
  })

  it('vorgelesen wird die Leiste als „Predigtdienst", jeder Knopf mit dem Namen seines Bereichs', () => {
    const { container } = zeige(ProgrammScreen, { screen: 'programm' })
    expect(leiste(container).getAttribute('aria-label')).toBe(t.tabFs)
    // Das Zeichen schweigt; den Namen trägt der Knopf.
    for (const b of knoepfe(container)) expect(b.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
    expect(knoepfe(container).map((b) => b.textContent)).toEqual([t.fsTreffpunkteTab, t.fsGruppenbesucheTab, t.fsTrolleysTab])
  })

  it('genau der gewählte Bereich ist gedrückt — ein Bereich von anderswo zählt als „Treffpunkte"', () => {
    expect(gedrueckt(zeige(ProgrammScreen, { screen: 'programm', fsBereich: 'gruppenbesuche' }).container)).toEqual([
      t.fsGruppenbesucheTab,
    ])
    cleanup()
    // Den Grundplan gibt es beim Ansehen nicht.
    expect(gedrueckt(zeige(ProgrammScreen, { screen: 'programm', fsBereich: 'grundplan' }).container)).toEqual([
      t.fsTreffpunkteTab,
    ])
  })

  it('ein Tipp auf „Trolleys" führt von den Treffpunkten der Woche in den Trolley-Kalender', () => {
    const { container } = zeige(ProgrammScreen, { screen: 'programm' })
    expect(container.querySelector('.week-strip')).not.toBeNull()
    expect(container.querySelector('.trolley-ansicht')).toBeNull()

    fireEvent.click(knopf(container, t.fsTrolleysTab))

    expect(container.querySelector('.trolley-ansicht')).not.toBeNull()
    expect([...container.querySelectorAll('button')].some((b) => b.textContent?.includes(t.trolleyEintragen))).toBe(true)
    expect(container.querySelector('.week-strip')).toBeNull()
    expect(gedrueckt(container)).toEqual([t.fsTrolleysTab])

    // Und zurück: Die Treffpunkte stehen wieder mit ihrer Woche da.
    fireEvent.click(knopf(container, t.fsTreffpunkteTab))
    expect(container.querySelector('.trolley-ansicht')).toBeNull()
    expect(gedrueckt(container)).toEqual([t.fsTreffpunkteTab])
  })

  it('beim Planen: Treffpunkte, Gruppenbesuche und Grundplan — ein Tipp öffnet den Grundplan, Trolleys gibt es dort nicht', () => {
    const { container } = zeige(PlanenScreen, { screen: 'planen', planner: true })
    expect(knoepfe(container).map((b) => b.textContent)).toEqual([t.fsTreffpunkteTab, t.fsGruppenbesucheTab, t.fsGrundplan])

    fireEvent.click(knopf(container, t.fsGrundplan))

    expect(container.querySelector('.regel-zeile')).not.toBeNull()
    expect(container.querySelector('.week-strip')).toBeNull()
    expect(gedrueckt(container)).toEqual([t.fsGrundplan])
  })
})

describe('„Gruppenbesuche" bricht am Handy an der Fuge', () => {
  const WEICH = String.fromCharCode(0xad)

  it('die weiche Trennstelle steht hinter „Gruppen" — und sonst nichts am Wort', () => {
    // Ohne sie trennte das Wörterbuch so spät wie möglich: „Gruppenbesu-che".
    expect(t.fsGruppenbesucheTab.indexOf(WEICH)).toBe('Gruppen'.length)
    expect(t.fsGruppenbesucheTab.split(WEICH).join('')).toBe('Gruppenbesuche')
  })
})
