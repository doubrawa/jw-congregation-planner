/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import type { ReactNode } from 'react'
import {
  AppDispatchContext,
  AppStateContext,
  AppStoreContext,
  type AppState,
  useStaticStore,
} from '../app/context'
import { demoZustand } from '../../tests/testdaten/demo-start'
import { emptyQualifications, privSetzen, serviceQualKey } from '../data/helpers'
import { dict } from '../i18n/ui'
import type { Group, Person, Service, Week } from '../data/types'
import { PlanenScreen } from './PlanenScreen'
import { PlanungScreen } from './PlanungScreen'
import { zahlBinden } from '../i18n/zahl-binden'

/**
 * **Die Wochen beim Planen, wie man sie sieht** (T121, Phase 10): am Handy die
 * Seite „Planung" (`GWochen`), wo Platz ist die Spalte links neben dem Plan
 * (`GDesktopPlanen`). Die Rechnung dahinter prüft `wochen-uebersicht.test.ts`.
 */

const t = dict('de')

/** Montag, 7. September 2026, morgens — dieselbe Uhr wie die Entwicklerseite. */
const MONTAG = new Date(2026, 8, 7, 9, 0)

/** Jeder kann Mikrofone — sonst stünden die offenen Plätze als „nicht besetzbar" da. */
const person = (id: string): Person => {
  const priv = emptyQualifications()
  privSetzen(priv, serviceQualKey('mik'), true)
  return { id, fn: id, ln: 'Test', role: 'aeltester', female: false, tel: '', mail: '', priv }
}
const GRUPPEN: Group[] = [{ id: 'g1', name: 'Gruppe 1', overseerId: 'p-ov', assistantId: null }]
const DIENSTE: Service[] = [{ key: 'mik', name: 'Mikrofone', count: 2, groups: false }]

function woche(start: string, range: string, over: Partial<Week> = {}): Week {
  return {
    range, book: 'JEREMIA 32', start,
    mid: { date: '', end: '', sections: [], helpers: { mik: [{ name: '' }, { name: '' }] } },
    we: { date: '', end: '', sections: [], helpers: { mik: [] } },
    ...over,
  }
}

const VORIGE = woche('2026-08-31', '31. August – 6. September')
const DIESE = woche('2026-09-07', '7.–13. September')
const NAECHSTE = woche('2026-09-14', '14.–20. September')
const KONGRESS = woche('2026-09-21', '21.–27. September', {
  anlass: { art: 'kongress', von: '2026-09-26', bis: '2026-09-27' },
  dev: { mid: { cancelled: true }, we: { cancelled: true } },
})

/** Trifft die Abfrage zu? Nur die Breite der Wochenspalte entscheidet hier. */
function breite(wochenSpalte: boolean) {
  window.matchMedia = vi.fn((abfrage: string) => ({
    matches: wochenSpalte && (abfrage === '(min-width: 1400px)' || abfrage === '(min-width: 1180px)' || abfrage === '(min-width: 768px)'),
  })) as unknown as typeof window.matchMedia
}

function zeige(inhalt: ReactNode, over: Partial<AppState> = {}) {
  const dispatch = vi.fn()
  const state: AppState = {
    ...demoZustand(),
    screen: 'planung', tab: 'mid', dataStatus: 'ready',
    congregationId: 'c1', userId: 'u1', personId: 'p-pl', planner: true,
    persons: [person('p-pl'), person('p-ov')], groups: GRUPPEN, services: DIENSTE, absences: [],
    weeks: [VORIGE, DIESE, NAECHSTE, KONGRESS], fsWeeks: [[], [], [], []], fsRules: [], week: 1,
    confirmations: {}, sentLog: {}, persoenlich: {},
    congregation: { name: 'Nordheim', hall: 'Saal', times: { mid: { wd: 2, time: '19:00' }, we: { wd: 0, time: '10:00' } } },
    ...over,
  }
  function Buehne() {
    const store = useStaticStore(state)
    return (
      <AppDispatchContext.Provider value={dispatch}>
        <AppStoreContext.Provider value={store}>
          <AppStateContext.Provider value={state}>{inhalt}</AppStateContext.Provider>
        </AppStoreContext.Provider>
      </AppDispatchContext.Provider>
    )
  }
  return { dispatch, ...render(<Buehne />) }
}

const karten = (root: Element) => [...root.querySelectorAll('.wochen-karte')]
const spanne = (karte: Element) => karte.querySelector('.wochen-karte-knopf')?.textContent
/** Die Spanne der Karte „Holen" — `Intl` setzt schmale Leerzeichen um den Strich. */
const holSpanne = (root: Element) => root.querySelector('.holen-karte-spanne')?.textContent?.replace(/\s/g, ' ')

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(MONTAG)
  breite(false)
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  delete (window as { matchMedia?: unknown }).matchMedia
})

describe('Die Seite „Planung" (`GWochen`)', () => {
  it('jede Woche ab der laufenden — die vergangene nicht', () => {
    const { container } = zeige(<PlanungScreen />)
    expect(karten(container).map(spanne)).toEqual(['7.–13. September', '14.–20. September', '21.–27. September'])
  })

  it('darunter, wann sie ist oder was sie besonders macht', () => {
    const { container } = zeige(<PlanungScreen />)
    expect(karten(container).map((k) => k.querySelector('.wochen-karte-unter')?.textContent)).toEqual([
      t.aktuelleWoche, t.naechsteWoche, t.kongress,
    ])
  })

  it('rechts, was zu tun ist — und eine Woche ohne Zusammenkünfte hat keine Spur', () => {
    const { container } = zeige(<PlanungScreen />)
    const [diese, , kongress] = karten(container)
    // Je zwei Mikrofone am Dienstag und am Sonntag — der Dienst zählt seine Plätze.
    expect(diese!.querySelector('.wochen-karte-lage')?.textContent).toBe(zahlBinden('Offen: 4'))
    expect(diese!.querySelector('.wochen-karte-lage')?.getAttribute('data-art')).toBe('offen')
    expect(diese!.querySelector('.spur--knapp')).not.toBeNull()
    // Auf der Seite hat die Spur Platz für ihre Namen — Punkte nur in der Spalte.
    expect(diese!.querySelector('.spur--punkte')).toBeNull()
    expect(kongress!.querySelector('.spur')).toBeNull()
  })

  it('ein Tipp öffnet den Plan der Woche dort, wo das Erste zu tun ist', () => {
    const { container, dispatch } = zeige(<PlanungScreen />)
    fireEvent.click(karten(container)[1]!.querySelector('.wochen-karte-knopf')!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'navigate', screen: 'planen', woche: { wi: 2, tab: 'mid' } })
  })

  it('unten die nächste Woche ohne Programm, mit „Holen"', () => {
    const { container } = zeige(<PlanungScreen />)
    const holen = container.querySelector('.holen-karte')!
    expect(holSpanne(container)).toBe('28. September – 4. Oktober')
    expect(holen.textContent).toContain(t.programmNichtGeholt)
    expect(holen.querySelector('button')?.textContent).toBe(t.holen)
  })

  it('„Auch zu planen": der Predigtdienst und die Weiteren Pläne', () => {
    const { container, dispatch } = zeige(<PlanungScreen />)
    const zeilen = [...container.querySelectorAll('.einst-zeile')]
    expect(zeilen.map((z) => z.querySelector('.einst-zeile-name')?.textContent)).toEqual([t.tabFs, t.navWeiterePlaene])
    fireEvent.click(zeilen[0]!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'navigate', screen: 'planen', thema: 'predigtdienst' })
    fireEvent.click(zeilen[1]!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'navigate', screen: 'planen', thema: 'weitere' })
  })

  it('ohne geladene Woche steht nur „Holen" da — ab der laufenden', () => {
    const { container } = zeige(<PlanungScreen />, { weeks: [], fsWeeks: [] })
    expect(karten(container)).toHaveLength(0)
    expect(holSpanne(container)).toBe('7.–13. September')
  })
})

describe('Die Spalte neben dem Plan (`GDesktopPlanen`)', () => {
  it('steht beim Planer links neben dem Plan, wo Platz für drei Spalten ist', () => {
    breite(true)
    const { container } = zeige(<PlanenScreen />, { screen: 'planen' })
    expect(container.querySelector('.planen-wochen > .wochen-spalte')).not.toBeNull()
    expect(container.querySelector('.planen-wochen-plan .planen-raster')).not.toBeNull()
  })

  it('fehlt darunter — dann führt „Planung" auf die Seite', () => {
    const { container } = zeige(<PlanenScreen />, { screen: 'planen' })
    expect(container.querySelector('.wochen-spalte')).toBeNull()
  })

  it('der Gruppenaufseher bekommt sie nicht — er plant allein die Treffpunkte seiner Gruppe', () => {
    breite(true)
    const { container } = zeige(<PlanenScreen />, { screen: 'planen', tab: 'fs', planner: false, personId: 'p-ov' })
    expect(container.querySelector('.wochen-spalte')).toBeNull()
  })

  it('die gezeigte Woche ist umrandet; ein Tipp wechselt nur die Woche — der Reiter bleibt', () => {
    breite(true)
    const { container, dispatch } = zeige(<PlanenScreen />, { screen: 'planen', tab: 'we', week: 2 })
    const spalte = container.querySelector('.wochen-spalte')!
    const gewaehlt = [...spalte.querySelectorAll('.wochen-karte.is-gewaehlt')]
    expect(gewaehlt.map(spanne)).toEqual(['14.–20. September'])
    expect(gewaehlt[0]!.querySelector('[aria-current="true"]')).not.toBeNull()
    fireEvent.click(karten(spalte)[0]!.querySelector('.wochen-karte-knopf')!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'navigate', screen: 'planen', woche: { wi: 1, tab: 'we' } })
  })

  it('ihre Spur zeigt nur Punkte, darunter den laufenden Schritt — die Namen brachen dort mitten im Wort (16.10.2026)', () => {
    breite(true)
    const { container } = zeige(<PlanenScreen />, { screen: 'planen' })
    const spur = container.querySelector('.wochen-spalte .wochen-karte .spur')!
    expect(spur.className).toBe('spur spur--knapp spur--punkte')
    // Nichts besetzt: Die Woche steht beim Zuteilen.
    expect(spur.querySelector('.spur-unterschrift-name')?.textContent).toBe(t.spurZuteilen)
    expect(spur.querySelector('.spur-unterschrift-wert')?.textContent).toBe(
      spur.querySelector('[aria-current="step"] .spur-wert')?.textContent,
    )
  })

  it('bei den Weiteren Plänen steht sie nicht — die haben keine Woche', () => {
    breite(true)
    const { container } = zeige(<PlanenScreen />, { screen: 'planen', tab: 'wp' })
    expect(container.querySelector('.wochen-spalte')).toBeNull()
  })
})
