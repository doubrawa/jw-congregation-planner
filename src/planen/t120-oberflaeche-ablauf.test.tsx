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

/** Manfred (p1) und Simon (p9) haben den Aufgabenbereich „Öffentliches Zeugnisgeben". */
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

const MARKT = { id: 't1', wd: 3, von: '10:00', bis: '12:00', ort: 'Marktplatz', plaetze: 2 }

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
    expect(container.querySelector('.wp-zurueck')).not.toBeNull()
    expect(container.querySelector('.wp-karte')).toBeNull()
    expect(container.textContent).toContain(t.wpEntwurf)
    expect(container.querySelector('.panel-label')?.textContent).toBe(t.saal)
    // Ein Vierteljahr ab dieser Woche: dreizehn Wochen, noch ohne Gruppe.
    const wochen = [...container.querySelectorAll(`.wp-zeile select[aria-label="${t.gbGruppe}"]`)] as HTMLSelectElement[]
    expect(wochen).toHaveLength(13)
    expect(wochen.every((w) => w.value === '')).toBe(true)

    const name = container.querySelector('input[type="text"]') as HTMLInputElement
    fireEvent.change(name, { target: { value: 'Grundreinigung' } })
    expect(name.value).toBe('Grundreinigung')
    klick(container, t.wpVeroeffentlichen)
    expect(knopf(container, t.wpZurueckziehen)).toBeDefined()

    fireEvent.click(container.querySelector('.wp-zurueck')!)
    const karte = container.querySelector('.wp-karte[data-stand="aktuell"]')
    expect(karte?.textContent).toContain('Grundreinigung')
    expect(container.querySelector('.wp-karte[data-stand="entwurf"]')).toBeNull()
  })

  it('anlegen und reihum verteilen → jede der dreizehn Wochen hat ihre Gruppe', () => {
    const { container } = zeige(PlanenScreen, { screen: 'planen', tab: 'wp', planner: true, plaene: [], planEintraege: [] })
    klick(container, t.wpNeu)
    klick(container, t.gbVerteilen)
    const wochen = () => [...container.querySelectorAll(`.wp-zeile select[aria-label="${t.gbGruppe}"]`)] as HTMLSelectElement[]
    expect(wochen()).toHaveLength(13)
    expect(wochen().every((w) => w.value !== '')).toBe(true)
  })
})

describe('Öffentliches Zeugnisgeben', () => {
  const zeile = (c: Element) =>
    [...c.querySelectorAll('.oz-schicht')].find((s) => s.textContent?.includes('Mittwoch, 9. September'))!

  it('Verkündiger: eintragen → „Eingetragen", absagen → der Platz ist wieder frei', () => {
    const { container } = zeige(ProgrammScreen, {
      screen: 'programm',
      tab: 'fs',
      fsBereich: 'zeugnis',
      planner: false,
      personId: 'p9',
      ozTermine: [MARKT],
      ozEintraege: [],
    })
    klick(zeile(container), t.ozEintragen)
    expect(zeile(container).textContent).toContain(t.ozDuEingetragen)
    expect(zeile(container).querySelector('.chip-du')).not.toBeNull()
    expect(knopf(zeile(container), t.ozEintragen)).toBeUndefined()

    klick(zeile(container), t.ozAbsagen)
    expect(zeile(container).textContent).not.toContain(t.ozDuEingetragen)
    expect(zeile(container).querySelector('.chip-du')).toBeNull()
    expect(knopf(zeile(container), t.ozEintragen)).toBeDefined()
  })

  it('Planer: Wochentag ändern → Rückfrage → „Verlegen" → die Schichten stehen am neuen Tag, die Einträge sind fort', () => {
    const { container } = zeige(PlanenScreen, {
      screen: 'planen',
      tab: 'fs',
      fsBereich: 'zeugnis',
      planner: true,
      ozTermine: [MARKT],
      ozEintraege: [{ id: 'e1', terminId: 't1', datum: '2026-09-09', pid: 'p9', selbst: true }],
    })
    expect(container.querySelectorAll('.oz-person')).toHaveLength(1)
    fireEvent.change(container.querySelector(`select[aria-label="${t.a11yWeekday}"]`)!, { target: { value: '4' } })
    // Noch steht alles wie vorher — erst der Knopf verlegt.
    expect(container.querySelectorAll('.oz-person')).toHaveLength(1)
    klick(container, t.ozTagWechseln)
    const tage = [...container.querySelectorAll('.oz-schicht .fs-place')].map((e) => e.textContent)
    expect(tage[0]).toBe('Donnerstag, 10. September · 10:00–12:00')
    expect(container.querySelectorAll('.oz-person')).toHaveLength(0)
  })

  it('Planer: Schicht streichen (zweimal getippt) → „Fällt aus", der Eintrag ist fort; „Wiederherstellen" → wieder zwei freie Plätze', () => {
    const { container } = zeige(PlanenScreen, {
      screen: 'planen',
      tab: 'fs',
      fsBereich: 'zeugnis',
      planner: true,
      ozTermine: [MARKT],
      ozEintraege: [{ id: 'e1', terminId: 't1', datum: '2026-09-09', pid: 'p9', selbst: true }],
    })
    const x = () => zeile(container).querySelector('.oz-streichen') as HTMLButtonElement
    fireEvent.click(x())
    // Erst die Rückfrage — noch steht alles.
    expect(zeile(container).querySelector('.oz-person')).not.toBeNull()
    fireEvent.click(x())
    expect(zeile(container).textContent).toContain(t.ozFaelltAus)
    expect(zeile(container).querySelector('.oz-person')).toBeNull()
    // Die übrigen Wochen stehen unverändert da.
    expect(container.querySelectorAll('.oz-schicht.is-gestrichen')).toHaveLength(1)

    klick(zeile(container), t.wiederherstellen)
    expect(zeile(container).textContent).not.toContain(t.ozFaelltAus)
    expect(zeile(container).querySelectorAll('select.oz-zuteilen')).toHaveLength(2)
  })

  it('Planer: automatisch besetzen füllt die freien Plätze, „Leeren" (zweimal getippt) räumt nur Zugeteiltes', () => {
    const { container } = zeige(PlanenScreen, {
      screen: 'planen',
      tab: 'fs',
      fsBereich: 'zeugnis',
      planner: true,
      ozTermine: [MARKT],
      // Selbst eingetragen — bleibt beim Leeren stehen.
      ozEintraege: [{ id: 'e1', terminId: 't1', datum: '2026-09-09', pid: 'p9', selbst: true }],
    })
    klick(container, t.autoZuteilen)
    const vorher = container.querySelectorAll('.oz-person').length
    expect(vorher).toBeGreaterThan(1)
    klick(container, t.leeren)
    klick(container, t.leerenSicher)
    // Übrig ist der selbst Eingetragene.
    const uebrig = [...container.querySelectorAll('.oz-person')].map((p) => p.textContent)
    expect(uebrig).toHaveLength(1)
    expect(uebrig[0]).toContain('Simon Krüger')
  })
})

describe('Gruppenbesuche', () => {
  it('Besucher wählen → „Reihum verteilen" → Besuche stehen da; „Leeren" (zweimal getippt) räumt sie ab', () => {
    const { container } = zeige(PlanenScreen, {
      screen: 'planen',
      tab: 'fs',
      fsBereich: 'gruppenbesuche',
      planner: true,
      gruppenbesuche: [],
    })
    // Ohne Besucher ist „Reihum verteilen" gesperrt.
    expect(knopf(container, t.gbVerteilen)?.disabled).toBe(true)
    fireEvent.change(container.querySelector('.gb-besucher select')!, { target: { value: 'p1' } })
    klick(container, t.gbVerteilen)
    const besuche = container.querySelectorAll('.gb-zeile')
    expect(besuche.length).toBeGreaterThan(0)
    // Jeder Besuch nennt den gewählten Besucher.
    for (const b of besuche) expect((b.querySelector('.gb-besucher-zeile select') as HTMLSelectElement).value).toBe('p1')

    klick(container, t.leeren)
    klick(container, t.leerenSicher)
    expect(container.querySelectorAll('.gb-zeile')).toHaveLength(0)
    expect(container.textContent).toContain(t.gbLeer)
  })
})
