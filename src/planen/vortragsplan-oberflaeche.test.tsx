/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { AppState } from '../app/context'

/**
 * **Der Vortragsplan an der Oberfläche** (T122) — mit dem echten Reducer.
 *
 * Wie in `t120-oberflaeche-ablauf.test.tsx` läuft der echte Speicher; nur die
 * Datenbank fehlt. Geprüft wird der Weg des Planers: Datei wählen, Vorschau
 * lesen, übernehmen — und was danach im Programm steht. Dazu, wo er den
 * Vortragsplan findet.
 *
 * **Wo er steht** (Betreiber, 18.10.2026): bei den Wochen, gleich unter
 * „Holen" — am Handy auf der Seite „Planung", am breiten Bildschirm in der
 * Spalte neben dem Plan. Bis dahin stand das Feld ganz unten im Reiter
 * Wochenende, unter Hilfsdiensten und Reinigung, und der Betreiber fragte:
 * „wo importiere ich die Termine der externen Vortragsredner? ich habe nichts
 * in der UI gefunden". Ein zweites Feld im Plan der Woche gibt es nicht mehr.
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
const { PlanungScreen } = await import('./PlanungScreen')

const t = dict('de')

/** Die Meldung unten am Bildschirm zeigt die App-Hülle — hier genügt ihr Text. */
function Toast() {
  const { state } = useApp()
  return <output className="probe-toast">{state.toast?.text ?? ''}</output>
}

/**
 * Wie breit der Bildschirm ist: Eine Abfrage `(min-width: …)` trifft zu, wenn
 * die Breite reicht — am Handy (375) keine, bei 1440 alle, auch die der
 * Wochenspalte neben dem Plan (`WOCHEN_SPALTE_BREITE`).
 */
function breite(px: number): void {
  window.matchMedia = vi.fn((abfrage: string) => {
    const ab = /min-width:\s*(\d+)px/.exec(abfrage)
    return { matches: ab !== null && px >= Number(ab[1]) }
  }) as unknown as typeof window.matchMedia
}

/** Ein Planer (nicht Admin) in der ersten Demo-Woche, im Plan des Wochenendes. */
function zeige(inhalt: ReactNode, over: Partial<AppState> = {}) {
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
      {inhalt}
      <Toast />
    </AppProvider>,
  )
}

/** Die Seite aller Wochen, wie sie am Handy über „Planung" aufgeht. */
const planung = (over: Partial<AppState> = {}) => zeige(<PlanungScreen />, { screen: 'planung', ...over })

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
  breite(375)
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('Vortragsplan übernehmen', () => {
  it('am breiten Bildschirm: Datei in der Wochenspalte wählen → Vorschau mit übergangenem Feld → Übernehmen → im Plan daneben', async () => {
    breite(1440)
    const { container } = zeige(<PlanenScreen />)
    waehle(container.querySelector('.wochen-spalte')!, DATEI)
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
    // Im Plan neben der Spalte steht der Redner an seinem Platz: der Name,
    // darunter Rolle und Herkunft (T121, `PlatzZeile`).
    const redner = [...container.querySelectorAll('.platz')].find(
      (p) => p.querySelector('.platz-name')?.textContent === 'Max Mustermann',
    )
    expect(redner?.querySelector('.platz-rolle')?.textContent).toBe('Gastredner · Musterstadt')
    // Thema und Anfangslied stehen in Feldern — und die zeigen den neuen Wert,
    // nicht den von vor dem Import (ungesteuerte Felder, Schlüssel mit Wert).
    expect(container.querySelector<HTMLInputElement>('.talk-title-input')?.value).toBe('Demo-Thema 1')
    expect(container.querySelector<HTMLInputElement>('.talk-song-input')?.value).toBe('151')
  })

  it('eine Datei in fremdem Format: Meldung, keine Vorschau', async () => {
    const { container } = planung()
    waehle(container, 'datum;redner;versammlung\n2026-09-13;Max Mustermann;Musterstadt')
    await waitFor(() => expect(toast(container)).toBe(t.vpKeinXml))
    expect(document.querySelector('[role="dialog"]')).toBeNull()
  })
})

describe('Wo der Planer den Vortragsplan findet', () => {
  it('am Handy auf der Seite „Planung", gleich unter „Holen": Titel, was kommt, der Knopf', () => {
    const { container } = planung()
    const karte = container.querySelector('.vp-karte')
    expect(karte?.previousElementSibling?.classList.contains('holen-karte')).toBe(true)
    // Eine Überschrift: Wer von Titel zu Titel springt, findet ihn zwischen den Wochen.
    expect(karte?.querySelector('h3')?.textContent).toBe(t.vpTitel)
    expect(karte?.textContent).toContain(t.vpKarteUnter)
    expect(karte?.querySelector('button')?.textContent).toBe(t.vpDateiWaehlen)
  })

  it('der Knopf öffnet die Dateiauswahl des Geräts', () => {
    const { container } = planung()
    const eingabe = container.querySelector<HTMLInputElement>('.vp-karte input[type="file"]')!
    const oeffnen = vi.spyOn(eingabe, 'click').mockImplementation(() => {})
    fireEvent.click(knopf(container, t.vpDateiWaehlen)!)
    expect(oeffnen).toHaveBeenCalledTimes(1)
  })

  it('am breiten Bildschirm in der Spalte der Wochen neben dem Plan — und nur dort', () => {
    breite(1440)
    const { container } = zeige(<PlanenScreen />)
    expect(container.querySelector('.wochen-spalte .vp-karte')).not.toBeNull()
    expect(container.querySelectorAll('.vp-karte')).toHaveLength(1)
  })

  it('nicht beim Gruppenaufseher: Er plant die Treffpunkte seiner Gruppe, die Wochen samt Vortragsplan nicht — auch am breiten Bildschirm', () => {
    breite(1440)
    // p1 ist Aufseher von Gruppe 1, ohne Planer- und Admin-Recht.
    const { container } = zeige(<PlanenScreen />, { personId: 'p1', zuteiler: false, tab: 'fs' })
    expect(container.querySelector('.wochen-spalte')).toBeNull()
    expect(container.querySelector('.vp-karte')).toBeNull()
    expect(container.textContent).not.toContain(t.vpTitel)
  })

  it('im Plan der Woche nicht mehr — auch nicht am Wochenende, wo der Vortrag steht', () => {
    for (const tab of ['we', 'mid'] as const) {
      const { container } = zeige(<PlanenScreen />, { tab })
      expect(container.querySelector('.vp-karte'), tab).toBeNull()
      expect(container.textContent, tab).not.toContain(t.vpTitel)
      cleanup()
    }
  })

  it('nicht im Offline-Stand — übernehmen ginge dann nicht; die Wochen und „Holen" bleiben', () => {
    const { container } = planung({ staleAt: Date.now() })
    expect(container.querySelector('.holen-karte')).not.toBeNull()
    expect(container.querySelector('.vp-karte')).toBeNull()
    expect(container.textContent).not.toContain(t.vpTitel)
  })
})
