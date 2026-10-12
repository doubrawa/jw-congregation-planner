/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import type { AppState } from '../app/context'

/**
 * **Der Vortragsplan an der Oberfläche** (T122) — mit dem echten Reducer.
 *
 * Wie in `t120-oberflaeche-ablauf.test.tsx` läuft der echte Speicher; nur die
 * Datenbank fehlt. Geprüft wird der Weg des Planers: Datei wählen, Vorschau
 * lesen, übernehmen — und was danach im Programm steht. Dazu, wer das Feld
 * überhaupt sieht.
 */
vi.mock('../app/hydrate', () => ({ loadAndHydrate: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../lib/supabase', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  supabase: null,
  isSupabaseConfigured: false,
}))

const { AppProvider } = await import('../app/store')
const { useApp } = await import('../app/context')
const { demoZustand } = await import('../../tests/testdaten/demo-start')
const { dict } = await import('../i18n/ui')
const { PlanenScreen } = await import('./PlanenScreen')

const t = dict('de')

/** Die Meldung unten am Bildschirm zeigt die App-Hülle — hier genügt ihr Text. */
function Toast() {
  const { state } = useApp()
  return <output className="probe-toast">{state.toast?.text ?? ''}</output>
}

/** Ein Planer (nicht Admin) im Reiter Wochenende der ersten Demo-Woche. */
function zeige(over: Partial<AppState> = {}) {
  const demo = demoZustand()
  const anfang: AppState = {
    ...demo,
    dataStatus: 'ready',
    congregationId: 'c1',
    userId: 'u1',
    planner: false,
    zuteiler: true,
    screen: 'planen',
    tab: 'we',
    week: 0,
    confirmations: {},
    notifs: [],
    ...over,
  }
  return render(
    <AppProvider start={() => anfang}>
      <PlanenScreen />
      <Toast />
    </AppProvider>,
  )
}

const toast = (c: ParentNode): string => c.querySelector('.probe-toast')?.textContent ?? ''

/** Eine Datei des Planungsprogramms für den Sonntag der ersten Demo-Woche (13.9.2026). */
const DATEI = `<?xml version="1.0" encoding="UTF-8"?>
<vortragsplan version="1" von="2026-09-07" bis="2026-09-13">
  <vortrag datum="2026-09-13">
    <redner>Max Mustermann</redner>
    <versammlung>Musterstadt</versammlung>
    <thema>Demo-Thema 1</thema>
    <lied>151</lied>
    <telefon>0000 000000</telefon>
  </vortrag>
</vortragsplan>`

function waehle(container: Element, inhalt: string): void {
  const eingabe = container.querySelector<HTMLInputElement>('input[type="file"]')
  if (!eingabe) throw new Error('Keine Dateiauswahl')
  const datei = new File([inhalt], 'vortragsplan.xml', { type: 'application/xml' })
  fireEvent.change(eingabe, { target: { files: [datei] } })
}

const knopf = (c: ParentNode, text: string) => [...c.querySelectorAll('button')].find((b) => b.textContent === text)

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 8, 7, 9, 0)) // Montag, 7. September 2026
  // jsdom kennt kein matchMedia; das Blatt fragt danach (Wischgeste nur mobil).
  window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('Vortragsplan übernehmen', () => {
  it('Datei wählen → Vorschau mit Redner und übergangenem Feld → Übernehmen → im Programm', async () => {
    const { container } = zeige()
    waehle(container, DATEI)
    const blatt = await waitFor(() => {
      const b = document.querySelector('[role="dialog"]')
      if (!b) throw new Error('noch keine Vorschau')
      return b
    })
    expect(blatt.getAttribute('aria-label')).toBe(t.vpVorschau)
    expect(blatt.textContent).toContain('Gastredner · Musterstadt: Max Mustermann')
    expect(blatt.textContent).toContain('Demo-Thema 1')
    // Was die App nicht kennt, nennt sie — und es geht nicht mit.
    expect(blatt.textContent).toContain(t.vpIgnoriert.replace('{felder}', 'telefon'))

    fireEvent.click(knopf(blatt, t.vpUebernehmen)!)
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(toast(container)).toBe(t.toastVortraegeUebernommen)
    expect(container.textContent).toContain('Gastredner · Musterstadt: Max Mustermann')
    // Thema und Anfangslied stehen in Feldern — und die zeigen den neuen Wert,
    // nicht den von vor dem Import (ungesteuerte Felder, Schlüssel mit Wert).
    expect(container.querySelector<HTMLInputElement>('.talk-title-input')?.value).toBe('Demo-Thema 1')
    expect(container.querySelector<HTMLInputElement>('.talk-song-input')?.value).toBe('151')
  })

  it('eine Datei in fremdem Format: Meldung, keine Vorschau', async () => {
    const { container } = zeige()
    waehle(container, 'datum;redner;versammlung\n2026-09-13;Max Mustermann;Musterstadt')
    await waitFor(() => expect(toast(container)).toBe(t.vpKeinXml))
    expect(document.querySelector('[role="dialog"]')).toBeNull()
  })

  it('das Feld steht nur am Wochenende, und nicht im Offline-Stand', () => {
    expect(zeige().container.textContent).toContain(t.vpTitel)
    cleanup()
    expect(zeige({ tab: 'mid' }).container.textContent).not.toContain(t.vpTitel)
    cleanup()
    expect(zeige({ staleAt: Date.now() }).container.textContent).not.toContain(t.vpTitel)
  })
})
