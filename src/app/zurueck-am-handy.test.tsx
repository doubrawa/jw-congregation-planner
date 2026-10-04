/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import type { AppState } from './context'
import type { WeitererPlan } from '../data/types'
import {
  WaechterAttrappe,
  attrappenEinsetzen,
  attrappenEntfernen,
  mitGeste,
  zurueckTaste,
} from '../../tests/zurueck-attrappen'

/**
 * **Zurück am Handy bleibt in der App** (4.10.2026, Variante B).
 *
 * Die App führt keinen Verlauf je Bildschirm; bis dahin legten nur Blätter und
 * das Handy-Menü einen Eintrag an. Auf jedem gewöhnlichen Bildschirm verließ
 * Zurück deshalb die App. Jetzt:
 *
 * - Ist eine Unteransicht offen (Personen-Detail, geöffneter Plan), schließt
 *   Zurück zuerst sie.
 * - Sonst führt es zu Start — ein Druck, gleich wie viele Bildschirme davor
 *   lagen: Reiter, Wochen und Bildschirmwechsel sind keine Schritte.
 * - Auf Start verlässt es die App.
 *
 * Gemessen mit dem echten Speicher, der ganzen Hülle und dem echten Verlauf von
 * jsdom. Unter allem liegt ein eigener Grundeintrag: In jsdom gehört jeder
 * ältere Eintrag zum selben Dokument, „die App verlassen" zeigt sich dort nur
 * daran, dass der Verlauf wieder auf ihm steht.
 */

vi.mock('./hydrate', () => ({ loadAndHydrate: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../lib/supabase', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  supabase: null,
  isSupabaseConfigured: false,
}))

const { AppProvider } = await import('./store')
const { AppShell } = await import('./AppShell')
const { demoZustand } = await import('../../tests/testdaten/demo-start')
const { dict } = await import('../i18n/ui')

const t = dict('de')

// jsdom kennt `matchMedia` nicht; die Wisch-Gesten fragen danach.
window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia

/** Ein Plan, der läuft — damit die Liste der Weiteren Pläne etwas zum Öffnen hat. */
const PLAN: WeitererPlan = { id: 'pl-x', name: 'Winterdienst', von: '2026-01-05', bis: '2099-12-27', entwurf: false }

let basis = ''

/**
 * Die ganze App mit echtem Speicher, angemeldet als Planer, auf Start — mit
 * `link` (`#go=…`) so geöffnet wie von einem Push-Tipp.
 */
function zeige(over: Partial<AppState> = {}, link?: string) {
  basis = `basis-${Math.random()}`
  history.pushState({ basis }, '', link)
  const anfang: AppState = {
    ...demoZustand(),
    dataStatus: 'ready',
    congregationId: 'c1',
    userId: 'u1',
    personId: 'p1',
    planner: true,
    screen: 'start',
    confirmations: {},
    notifs: [],
    ...over,
  }
  return render(
    <AppProvider start={() => anfang}>
      <AppShell />
    </AppProvider>,
  )
}

/** Ein paar Durchläufe weiter: Effekte, eigenes Aufräumen und dessen `popstate` sind dann durch. */
async function ausklingen(): Promise<void> {
  for (let i = 0; i < 8; i++) await new Promise<void>((fertig) => setTimeout(fertig, 0))
}

/** Ein echter Zurück-Druck — warten, bis sein `popstate` da und alles verarbeitet ist. */
async function zurueck(): Promise<void> {
  await new Promise<void>((fertig) => {
    window.addEventListener('popstate', () => fertig(), { once: true })
    history.back()
  })
  await ausklingen()
}

const zustand = () => (history.state ?? {}) as Record<string, unknown>
/** Steht der Verlauf wieder auf dem Grundeintrag — der nächste Druck verließe die App? */
const amGrund = () => zustand().basis === basis && zustand().cpOverlay === undefined

/** Der aktive Punkt im Menü der Seitenleiste. */
const aktiv = (c: HTMLElement) => c.querySelector('.sidebar .sidebar-nav-item.is-active')?.textContent ?? null

function klickMenue(c: HTMLElement, text: string, wo = '.sidebar'): void {
  const knopf = [...c.querySelectorAll<HTMLElement>(`${wo} .sidebar-nav-item`)].find((b) => b.textContent === text)
  if (!knopf) throw new Error(`Kein Menüpunkt „${text}" in ${wo}`)
  fireEvent.click(knopf)
}

afterEach(async () => {
  cleanup()
  await ausklingen() // eigenes Aufräumen der Ebenen nicht in den nächsten Test tragen
})

describe('Zurück am Handy', () => {
  it('auf Start hält die App nichts fest — Zurück verlässt sie', async () => {
    zeige()
    await ausklingen()
    expect(aktiv(document.body)).toBe(t.navStart)
    expect(amGrund(), 'auf Start liegt ein Eintrag zu viel').toBe(true)
  })

  it('von einem Bildschirm führt Zurück zu Start — und von dort hinaus', async () => {
    const { container } = zeige()
    klickMenue(container, t.navPersonen)
    await ausklingen()
    expect(aktiv(container)).toBe(t.navPersonen)
    expect(zustand().cpOverlay, 'kein Eintrag für den Bildschirm').toBe(true)

    await zurueck()
    expect(aktiv(container)).toBe(t.navStart)
    expect(amGrund(), 'nach Start liegt noch ein Eintrag').toBe(true)
  })

  it('Bildschirmwechsel sammeln keine Schritte — ein Druck führt zu Start', async () => {
    const { container } = zeige()
    klickMenue(container, t.navPersonen)
    klickMenue(container, t.navZusammenkuenfte)
    klickMenue(container, t.navEinstellungen)
    await ausklingen()

    await zurueck()
    expect(aktiv(container)).toBe(t.navStart)
    expect(amGrund()).toBe(true)
  })

  it('das Personen-Detail schließt zuerst, dann geht es zu Start', async () => {
    const { container } = zeige()
    klickMenue(container, t.navPersonen)
    fireEvent.click(container.querySelector('.pers-row')!)
    await ausklingen()
    expect(container.querySelector('.pers-detail-head')).not.toBeNull()

    await zurueck()
    expect(container.querySelector('.pers-detail-head'), 'das Detail blieb offen').toBeNull()
    expect(aktiv(container)).toBe(t.navPersonen)

    await zurueck()
    expect(aktiv(container)).toBe(t.navStart)
    expect(amGrund()).toBe(true)
  })

  it('ein geöffneter Plan schließt zuerst, dann die Liste', async () => {
    const { container } = zeige({ planModus: true, plaene: [PLAN], planEintraege: [] })
    klickMenue(container, t.navWeiterePlaene)
    fireEvent.click(container.querySelector('.wp-karte')!)
    await ausklingen()
    expect(container.querySelector('.wp-zurueck')).not.toBeNull()

    await zurueck()
    expect(container.querySelector('.wp-zurueck'), 'der Plan blieb offen').toBeNull()
    expect(container.querySelector('.wp-karte')).not.toBeNull()

    await zurueck()
    expect(aktiv(container)).toBe(t.navStart)
    expect(amGrund()).toBe(true)
  })

  it('ein neuer Plan steht gleich offen da — Zurück führt zur Liste, dann zu Start', async () => {
    const { container } = zeige({ planModus: true, plaene: [], planEintraege: [] })
    klickMenue(container, t.navWeiterePlaene)
    fireEvent.click([...container.querySelectorAll('button')].find((b) => b.textContent === t.wpNeu)!)
    await ausklingen()
    expect(container.querySelector('.wp-zurueck'), 'der neue Plan ist nicht offen').not.toBeNull()

    await zurueck()
    expect(container.querySelector('.wp-zurueck'), 'der Plan blieb offen').toBeNull()
    expect(container.querySelector('.wp-karte'), 'der neue Plan fehlt in der Liste').not.toBeNull()

    await zurueck()
    expect(aktiv(container)).toBe(t.navStart)
    expect(amGrund()).toBe(true)
  })

  it('aus dem Handy-Menü gewählt: ein Druck führt zu Start', async () => {
    // Das Menü schließt (sein Eintrag geht) und der Bildschirm wechselt (sein
    // Eintrag kommt) im selben Augenblick.
    const { container } = zeige()
    fireEvent.click(container.querySelector('.menu-btn')!)
    await ausklingen()
    klickMenue(container, t.navPersonen, '.drawer')
    await ausklingen()
    expect(container.querySelector('.drawer')).toBeNull()
    expect(aktiv(container)).toBe(t.navPersonen)

    await zurueck()
    expect(aktiv(container)).toBe(t.navStart)
    expect(amGrund(), 'ein Eintrag zu viel oder zu wenig').toBe(true)
  })

  it('erst schließt das Handy-Menü, dann geht es zu Start', async () => {
    const { container } = zeige()
    klickMenue(container, t.navPersonen)
    fireEvent.click(container.querySelector('.menu-btn')!)
    await ausklingen()

    await zurueck()
    expect(container.querySelector('.drawer'), 'das Menü blieb offen').toBeNull()
    expect(aktiv(container)).toBe(t.navPersonen)

    await zurueck()
    expect(aktiv(container)).toBe(t.navStart)
    expect(amGrund()).toBe(true)
  })

  it('ein Blatt über einem Bildschirm schließt zuerst', async () => {
    const { container } = zeige()
    klickMenue(container, t.navPersonen)
    fireEvent.click(container.querySelector('.notif-chip')!)
    await ausklingen()
    expect(container.querySelector('.notif-panel')).not.toBeNull()

    await zurueck()
    expect(container.querySelector('.notif-panel'), 'die Glocke blieb offen').toBeNull()
    expect(aktiv(container)).toBe(t.navPersonen)

    await zurueck()
    expect(aktiv(container)).toBe(t.navStart)
    expect(amGrund()).toBe(true)
  })

  /*
   * **Ein Tipp in der Glocke** (4.10.2026): Im selben Augenblick schließt die
   * Glocke (ihr Eintrag geht), der Bildschirm wechselt und — bei der eigenen
   * Aufgabe — öffnet ihr Blatt (zwei Einträge kommen).
   */
  const zeile = (over: Partial<AppState['notifs'][number]>) => ({
    id: 'n1', type: 'zuteilung' as const, title: 'Neue Zuteilung', text: 'x',
    at: new Date().toISOString(), read: false, ...over,
  })

  async function tippeInDerGlocke(c: HTMLElement): Promise<void> {
    fireEvent.click(c.querySelector('.notif-chip')!)
    await ausklingen()
    fireEvent.click(c.querySelector('.notif-row-link')!)
    await ausklingen()
    expect(c.querySelector('.notif-panel'), 'die Glocke blieb offen').toBeNull()
  }

  it('Tipp auf die eigene Aufgabe: ihr Blatt auf „Meine Aufgaben" — Zurück schließt es, dann geht es zu Start', async () => {
    // `a1` ist eine offene Aufgabe des Demo-Bestands (DEMO_MY_TASKS).
    const { container } = zeige({ planner: false, personId: 'p9', notifs: [zeile({ taskId: 'a1' })] })
    await tippeInDerGlocke(container)
    expect(aktiv(container)).toBe(t.navAufgabenLong)
    expect(container.querySelector('.confirm-modal'), 'das Blatt ist nicht offen').not.toBeNull()

    await zurueck()
    expect(container.querySelector('.confirm-modal'), 'das Blatt blieb offen').toBeNull()
    expect(aktiv(container)).toBe(t.navAufgabenLong)

    await zurueck()
    expect(aktiv(container)).toBe(t.navStart)
    expect(amGrund(), 'ein Eintrag zu viel oder zu wenig').toBe(true)
  })

  it('der Planer tippt auf eine Absage: die Woche im Planen — ein Druck führt zu Start', async () => {
    const woche = demoZustand().weeks[1]!.start
    const absage = zeile({ type: 'verhindert', title: 'Verhinderung gemeldet', taskId: `${woche}|mid|ratgeber` })
    const { container } = zeige({ notifs: [absage] })
    await tippeInDerGlocke(container)
    expect(aktiv(container)).toBe(t.navZusammenkuenfte)

    await zurueck()
    expect(aktiv(container)).toBe(t.navStart)
    expect(amGrund(), 'ein Eintrag zu viel oder zu wenig').toBe(true)
  })

  it('über das Menü zu Start: kein Eintrag bleibt liegen', async () => {
    const { container } = zeige()
    klickMenue(container, t.navPersonen)
    await ausklingen()
    klickMenue(container, t.navStart)
    await ausklingen()
    expect(amGrund(), 'auf Start blieb ein Eintrag liegen').toBe(true)
  })
})

/*
 * **Nach einem Push-Tipp** (4.10.2026): Der Bildschirm aus `#go=…` geht auf,
 * ohne dass jemand getippt hat. Einen so angelegten Eintrag überspränge
 * Chromium, und auf Android schlösse der erste Zurück-Druck die App — deshalb
 * hält dort ein Wächter die Taste fest (`useBackDismiss`, „Ohne Geste kein
 * Eintrag"; Attrappen in `tests/zurueck-attrappen.ts`).
 */
describe('Zurück nach einem Push-Tipp', () => {
  beforeEach(() => attrappenEinsetzen())
  afterEach(() => attrappenEntfernen())

  it('„Meine Aufgaben" ohne Eintrag — die Zurück-Taste führt zu Start, der nächste Druck verließe die App', async () => {
    const { container } = zeige({}, '#go=aufgaben')
    await ausklingen()
    expect(aktiv(container)).toBe(t.navAufgabenLong)
    expect(amGrund(), 'ohne Geste entstand ein Eintrag — Chromium überspränge ihn').toBe(true)

    expect(await zurueckTaste()).toBe('waechter')
    await ausklingen()
    expect(aktiv(container)).toBe(t.navStart)
    expect(WaechterAttrappe.aufgestellt).toHaveLength(0)
    expect(amGrund()).toBe(true)
  })

  it('danach Menü und „Personen": Der Bildschirm bekommt seinen Eintrag mit — ein Druck führt zu Start', async () => {
    const { container } = zeige({}, '#go=aufgaben')
    await ausklingen()
    await mitGeste(() => fireEvent.click(container.querySelector('.menu-btn')!))
    await mitGeste(() => klickMenue(container, t.navPersonen, '.drawer'))
    expect(container.querySelector('.drawer')).toBeNull()
    expect(aktiv(container)).toBe(t.navPersonen)
    expect(WaechterAttrappe.aufgestellt, 'der Wächter blieb — die Taste träfe ihn vor dem Verlauf').toHaveLength(0)

    expect(await zurueckTaste()).toBe('verlauf')
    await ausklingen()
    expect(aktiv(container)).toBe(t.navStart)
    expect(amGrund(), 'ein Eintrag zu viel oder zu wenig').toBe(true)
  })
})
