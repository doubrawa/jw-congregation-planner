/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import type { AppState } from '../app/context'

/**
 * **T120 an der Oberfläche — mit dem echten Reducer.**
 *
 * Die übrigen Oberflächentests (`*-ansichten.test.tsx`) stellen den Dispatch
 * nach: Sie prüfen, *dass* ein Knopf die richtige Aktion schickt, aber nie, was
 * danach dasteht. „Ein neuer Plan … und gleich offen" hieß ein Test, der den
 * offenen Plan gar nicht sehen konnte — der Plan kam nie im Zustand an.
 *
 * Hier läuft der echte Speicher (`AppProvider`) mit Reducer und `persist`;
 * nur die Datenbank fehlt (`supabase: null`, `persist` steigt dann aus), und
 * nachgeladen wird nicht. So ist jeder Handgriff bis auf den Bildschirm zu
 * verfolgen.
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

/** Manfred (p1) und Simon (p9) dürfen mit dem Trolley gehen (`zeugnis`). */
function start(over: Partial<AppState>): AppState {
  const demo = demoZustand()
  return {
    ...demo,
    dataStatus: 'ready',
    congregationId: 'c1',
    userId: 'u1',
    persons: demo.persons.map((p) => (p.id === 'p1' || p.id === 'p9' ? { ...p, priv: { ...p.priv, zeugnis: true } } : p)),
    confirmations: {},
    notifs: [],
    ...over,
  }
}

function zeige(Screen: () => React.JSX.Element, over: Partial<AppState>) {
  const anfang = start(over)
  return render(
    <AppProvider start={() => anfang}>
      <Screen />
    </AppProvider>,
  )
}

const knopf = (c: Element, text: string) => [...c.querySelectorAll('button')].find((b) => b.textContent === text)
const klick = (c: Element, text: string) => {
  const b = knopf(c, text)
  if (!b) throw new Error(`Kein Knopf „${text}"`)
  fireEvent.click(b)
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 8, 7, 9, 0)) // Montag, 7. September 2026
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('Weitere Pläne', () => {
  it('neuer Plan: ohne Wahl gleich offen, Namen tippen, veröffentlichen → unter „Aktuell"', () => {
    const { container } = zeige(PlanenScreen, { screen: 'planen', tab: 'wp', planner: true, plaene: [], planEintraege: [] })
    klick(container, t.wpNeu)

    // Gleich offen — der Plan selbst, nicht die Liste und keine Wahl dazwischen.
    expect(container.querySelector('.unteransicht-kopf .seitentitel')?.textContent).toBe(t.wpPlanBearbeiten)
    expect(container.querySelector('.wp-plan-zeile')).toBeNull()
    expect(container.querySelector('.spur [aria-current="step"]')?.textContent).toBe(t.wpEntwurf)
    // Ein Vierteljahr ab dieser Woche: dreizehn Wochen, noch ohne Gruppe —
    // die Vorschau zeigt die nächsten, „Alle anzeigen" alle.
    expect(container.querySelector('.wp-vorschau .karte-titel')?.textContent).toBe(`${t.wpVorschau} · 13 Wochen`)
    klick(container, t.alleAnzeigen)
    const wochen = [...container.querySelectorAll<HTMLSelectElement>('.wp-gruppe-wahl')]
    expect(wochen).toHaveLength(13)
    expect(wochen.every((w) => w.value === '')).toBe(true)

    const name = container.querySelector('input[type="text"]') as HTMLInputElement
    fireEvent.change(name, { target: { value: 'Grundreinigung' } })
    expect(name.value).toBe('Grundreinigung')
    klick(container, t.wpVeroeffentlichen)
    expect(knopf(container, t.wpZurueckziehen)).toBeDefined()
    expect(container.querySelector('.spur [aria-current="step"]')?.textContent).toBe(t.spurVeroeffentlicht)

    fireEvent.click(container.querySelector(`.unteransicht-kopf [aria-label="${t.a11yZurueck}"]`)!)
    const aktuell = container.querySelector('.wp-abschnitt[data-stand="aktuell"]')
    expect(aktuell?.textContent).toContain('Grundreinigung')
    expect(container.querySelector('.wp-abschnitt[data-stand="entwurf"]')).toBeNull()
  })

  it('anlegen und mit einer Gruppe beginnen → jede der dreizehn Wochen hat ihre Gruppe', () => {
    const { container } = zeige(PlanenScreen, { screen: 'planen', tab: 'wp', planner: true, plaene: [], planEintraege: [] })
    klick(container, t.wpNeu)
    const beginnen = container.querySelector(`[role="group"][aria-label="${t.wpAbGruppe}"]`)!
    fireEvent.click(beginnen.querySelector('button')!)
    klick(container, t.alleAnzeigen)
    const wochen = [...container.querySelectorAll<HTMLSelectElement>('.wp-gruppe-wahl')]
    expect(wochen).toHaveLength(13)
    expect(wochen.every((w) => w.value !== '')).toBe(true)
    // Gedrückt steht jetzt, womit die Reihe beginnt.
    expect(beginnen.querySelector('[aria-pressed="true"]')).toBe(beginnen.querySelector('button'))
  })
})

/*
 * **Trolleys (T121, Phase 7)** an der Oberfläche: eintragen, im Plan sehen,
 * austragen. Ohne Datenbank rechnet `lib/trolley.ts` die Antwort der Function
 * selbst — dieselben Regeln (`wasBleibt`), damit der Ablauf derselbe ist.
 */
describe('Trolleys', () => {
  // Handy-Breite: Tagesplan und Blätter; jsdom kennt matchMedia nicht.
  beforeEach(() => {
    window.matchMedia = vi
      .fn()
      .mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }) as unknown as typeof window.matchMedia
  })
  afterEach(() => {
    delete (window as { matchMedia?: unknown }).matchMedia
  })

  const TROLLEY = { id: 'tr1', name: 'Trolley 1', ort: 'Depot', hinweis: '' }
  const ansicht: Partial<AppState> = { screen: 'programm', tab: 'fs', fsBereich: 'trolleys', trolleys: [TROLLEY], trolleyTermine: [] }

  it('Simon trägt sich ein, allein mit „Partner gesucht" → der Termin steht da; austragen (zweimal getippt) → er ist fort', async () => {
    const { container } = zeige(ProgrammScreen, { ...ansicht, personId: 'p9' })
    klick(container, t.trolleyEintragen)
    const blatt = document.querySelector('[role="dialog"]')!
    klick(blatt, t.trolleyPartnerGesucht)
    klick(blatt.querySelector('.sheet-fuss-ende')!, t.trolleyEintragen)

    // Unter „Deine Termine" und im Tagesplan, gestrichelt: Partner gesucht.
    await vi.waitFor(() => expect(container.querySelector('.trolley-karte .trolley-zeile')).not.toBeNull())
    expect(container.querySelector('.trolley-karte')?.textContent).toContain(t.trolleyPartnerGesucht)
    expect(container.querySelector('.trolley-termin.is-gesucht')).not.toBeNull()
    expect(document.querySelector('[role="dialog"]')).toBeNull()

    fireEvent.click(container.querySelector('.trolley-karte .trolley-zeile')!)
    const termin = document.querySelector('[role="dialog"]')!
    klick(termin, t.trolleyAustragen)
    klick(termin, t.entfernenSicher)
    await vi.waitFor(() => expect(container.querySelector('.trolley-termin')).toBeNull())
    expect(container.querySelector('.trolley-karte')).toBeNull()
  })

  it('wer kein Trolley-Recht hat, sieht den Plan — aber statt „Eintragen" den Hinweis', () => {
    const { container } = zeige(ProgrammScreen, { ...ansicht, personId: 'p11' })
    expect(knopf(container, t.trolleyEintragen)).toBeUndefined()
    expect(container.textContent).toContain(t.trolleyFehlerKeinRecht)
    expect(container.querySelector('.trolley-frei')).toBeNull()
  })
})

describe('Gruppenbesuche', () => {
  // Die Blätter fragen beim Wischen, ob wir am Schreibtisch sitzen — jsdom kennt matchMedia nicht.
  beforeEach(() => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia
  })
  afterEach(() => {
    delete (window as { matchMedia?: unknown }).matchMedia
  })

  const blatt = () => document.querySelector<HTMLElement>('[role="dialog"]')!
  const feld = (marke: string) =>
    [...blatt().querySelectorAll('.blatt-feld')]
      .find((f) => f.querySelector('.feld-marke')?.textContent === marke)!
      .querySelector('select')!
  const zeilen = (c: Element) => [...c.querySelectorAll<HTMLElement>('.gb-zeile')]
  const gruppen = (c: Element) => zeilen(c).map((z) => z.querySelector('.gb-gruppe-pille')?.textContent)

  it('Besuch hinzufügen → er steht da; der nächste ist vorbelegt; Entfernen (zweimal getippt) räumt ihn ab', () => {
    const { container } = zeige(PlanenScreen, { screen: 'planen', tab: 'fs', fsBereich: 'gruppenbesuche', planner: true, gruppenbesuche: [] })
    fireEvent.click(container.querySelector('.gb-neu')!)
    // Ohne Besuch noch kein Besucher — ohne ihn ist „Hinzufügen" gesperrt.
    expect(knopf(blatt(), t.hinzufuegenKnopf)?.disabled).toBe(true)
    fireEvent.change(feld(t.gbBesucher), { target: { value: 'p1' } })
    klick(blatt(), t.hinzufuegenKnopf)
    expect(zeilen(container)).toHaveLength(1)

    // Der zweite: eine andere Gruppe, einen Monat später, derselbe Besucher.
    fireEvent.click(container.querySelector('.gb-neu')!)
    expect(feld(t.gbBesucher).value).toBe('p1')
    klick(blatt(), t.hinzufuegenKnopf)
    expect(zeilen(container)).toHaveLength(2)
    const [erste, zweite] = gruppen(container)
    expect(zweite).not.toBe(erste)

    fireEvent.click(zeilen(container)[0]!)
    klick(blatt(), t.a11yRemove)
    klick(blatt(), t.loeschenSicher)
    expect(zeilen(container)).toHaveLength(1)
  })

  it('einen Besuch verlegen und zu einer anderen Gruppe geben — gleich im Blatt', () => {
    const demo = demoZustand()
    const [g1, g2] = demo.groups
    const { container } = zeige(PlanenScreen, {
      screen: 'planen',
      tab: 'fs',
      fsBereich: 'gruppenbesuche',
      planner: true,
      gruppenbesuche: [{ id: 'b1', woche: '2026-09-14', grp: g1!.id, pid: 'p1' }],
    })
    fireEvent.click(zeilen(container)[0]!)
    fireEvent.change(feld(t.gbWoche), { target: { value: '2026-09-21' } })
    expect(feld(t.gbWoche).value).toBe('2026-09-21')
    fireEvent.change(feld(t.gbGruppe), { target: { value: g2!.id } })
    expect(feld(t.gbGruppe).value).toBe(g2!.id)
    expect(gruppen(container)).toEqual([g2!.name])
  })
})
