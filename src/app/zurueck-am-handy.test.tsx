/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import type { AppState } from './context'
import type { WeitererPlan } from '../data/types'

/**
 * **Zurück am Handy bleibt in der App** (4.10.2026, Variante B).
 *
 * Die App führt keinen Verlauf je Bildschirm; bis dahin legten nur Blätter und
 * das Handy-Menü einen Eintrag an. Auf jedem gewöhnlichen Bildschirm verließ
 * Zurück deshalb die App. Jetzt:
 *
 * - Ist eine Unteransicht offen (Personen-Detail, geöffneter Plan,
 *   Vorlagenwahl), schließt Zurück zuerst sie.
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
const PLAN: WeitererPlan = { id: 'pl-x', vorlage: 'saal', name: 'Winterdienst', von: '2026-01-05', bis: '2099-12-27', entwurf: false }

let basis = ''

/** Die ganze App mit echtem Speicher, angemeldet als Planer, auf Start. */
function zeige(over: Partial<AppState> = {}) {
  basis = `basis-${Math.random()}`
  history.pushState({ basis }, '')
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

  it('nach der Wahl der Vorlage führt Zurück zur Liste, nicht zurück zur Wahl', async () => {
    const { container } = zeige({ planModus: true, plaene: [], planEintraege: [] })
    klickMenue(container, t.navWeiterePlaene)
    fireEvent.click([...container.querySelectorAll('button')].find((b) => b.textContent === t.wpNeu)!)
    await ausklingen()
    expect(container.querySelector('.wp-vorlagen')).not.toBeNull()
    fireEvent.click(container.querySelector('.wp-vorlage-karte[data-vorlage="familien"]')!)
    await ausklingen()
    expect(container.querySelector('.wp-zurueck'), 'der neue Plan ist nicht offen').not.toBeNull()

    await zurueck()
    expect(container.querySelector('.wp-vorlagen'), 'zurück in der Vorlagenwahl').toBeNull()
    expect(container.querySelector('.wp-zurueck')).toBeNull()

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

  it('über das Menü zu Start: kein Eintrag bleibt liegen', async () => {
    const { container } = zeige()
    klickMenue(container, t.navPersonen)
    await ausklingen()
    klickMenue(container, t.navStart)
    await ausklingen()
    expect(amGrund(), 'auf Start blieb ein Eintrag liegen').toBe(true)
  })
})
