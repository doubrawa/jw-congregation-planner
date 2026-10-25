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
import { PlanungScreen, PlanungWochenScreen } from './PlanungScreen'
import { fill } from '../i18n/useT'
import { zahlBinden } from '../i18n/zahl-binden'

/**
 * **Die Wochen beim Planen, wie man sie sieht** (T121, Phase 10): am Handy
 * eine eigene Seite (`GWochen`, seit T144 unter „Planung" → „Zusammenkünfte"),
 * wo Platz ist die Spalte links neben dem Plan (`GDesktopPlanen`). Dazu die
 * Wahl auf „Planung" selbst (T144). Die Rechnung dahinter prüft
 * `wochen-uebersicht.test.ts`.
 */

const t = dict('de')

/** Montag, 7. September 2026, morgens — dieselbe Uhr wie die Entwicklerseite. */
const MONTAG = new Date(2026, 8, 7, 9, 0)

/** Jeder kann Mikrofone — sonst stünden die offenen Plätze als „nicht besetzbar" da. */
const person = (id: string): Person => {
  const priv = emptyQualifications()
  privSetzen(priv, serviceQualKey('mik'), true)
  return { id, fn: id, ln: 'Test', role: 'aeltester', female: false, mail: '', priv }
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
    screen: 'wochen', tab: 'mid', dataStatus: 'ready',
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

describe('Die Wahl auf „Planung" (T144, `GPlanungWahl`)', () => {
  const titel = (root: Element) =>
    [...root.querySelectorAll('.planung-karte')].map((k) => k.querySelector('.planung-karte-titel')?.textContent)
  const karte = (root: Element, text: string) =>
    [...root.querySelectorAll<HTMLElement>('.planung-karte')].find((k) => k.textContent?.includes(text))!

  it('nur die Wahl: je Bereich eine Karte — keine Woche, kein „Holen", kein Vortragsplan', () => {
    /*
     * Betreiber 25.10.2026: „wenn man planung öffnet soll nur die auswahl
     * kommen, was man plant und nicht zusätzlich die zusammenkunftswochen".
     * Bis dahin stand die Wahl (T135) als Umschalter über den Wochen.
     */
    const { container } = zeige(<PlanungScreen />, { screen: 'planung' })
    expect(titel(container)).toEqual([t.navZusammenkuenfte, t.tabFs, t.navWeiterePlaene])
    expect(karten(container)).toHaveLength(0)
    expect(container.querySelector('.holen-karte')).toBeNull()
    expect(container.querySelector('.vp-karte')).toBeNull()
    expect(container.querySelector('.bereich-tabs')).toBeNull()
  })

  it('„Zusammenkünfte" führt zu den Wochen, die übrigen ins Planen — Zurück führt dann hierher', () => {
    const { container, dispatch } = zeige(<PlanungScreen />, { screen: 'planung' })
    fireEvent.click(karte(container, t.navZusammenkuenfte))
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'navigate', screen: 'wochen' })
    fireEvent.click(karte(container, t.tabFs))
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'navigate', screen: 'planen', thema: 'predigtdienst', von: 'planung' })
    fireEvent.click(karte(container, t.navWeiterePlaene))
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'navigate', screen: 'planen', thema: 'weitere', von: 'planung' })
  })

  it('wo die Wochen neben den Plan passen, führt „Zusammenkünfte" gleich ins Planen — die Wochen stehen dort in der Spalte', () => {
    breite(true)
    const { container, dispatch } = zeige(<PlanungScreen />, { screen: 'planung' })
    fireEvent.click(karte(container, t.navZusammenkuenfte))
    expect(dispatch).toHaveBeenCalledWith({ type: 'navigate', screen: 'planen', thema: 'zusammenkuenfte', von: 'planung' })
  })

  it('die Karte „Zusammenkünfte" nennt die Probleme aller Wochen — offene Plätze allein nicht', () => {
    // Offen ist jede kommende Woche, bis sie zugeteilt ist; das sagt erst die Liste.
    const ruhig = zeige(<PlanungScreen />, { screen: 'planung' })
    expect(karte(ruhig.container, t.navZusammenkuenfte).querySelector('.dash-chip')).toBeNull()
    cleanup()
    // Niemand kann Mikrofone: Je zwei Plätze am Dienstag und am Sonntag, in
    // dieser und der nächsten Woche, bleiben offen — der Kongress hat keine.
    const ohneMik = (id: string): Person => ({ ...person(id), priv: emptyQualifications() })
    const { container } = zeige(<PlanungScreen />, { screen: 'planung', persons: [ohneMik('p-pl'), ohneMik('p-ov')] })
    const chips = [...karte(container, t.navZusammenkuenfte).querySelectorAll('.dash-chip')]
    expect(chips.map((c) => [c.getAttribute('data-art'), c.textContent])).toEqual([
      ['probleme', fill(t.lageProbleme, { n: 8 })],
    ])
  })
})

describe('Die Seite der Wochen (`GWochen`, bis T144 „Planung")', () => {
  it('jede Woche ab der laufenden — die vergangene nicht', () => {
    const { container } = zeige(<PlanungWochenScreen />)
    expect(karten(container).map(spanne)).toEqual(['7.–13. September', '14.–20. September', '21.–27. September'].map(zahlBinden))
  })

  it('darunter, wann sie ist oder was sie besonders macht', () => {
    const { container } = zeige(<PlanungWochenScreen />)
    expect(karten(container).map((k) => k.querySelector('.wochen-karte-unter')?.textContent)).toEqual([
      t.aktuelleWoche, t.naechsteWoche, t.kongress,
    ])
  })

  it('rechts, was zu tun ist — und eine Woche ohne Zusammenkünfte hat keine Spur', () => {
    const { container } = zeige(<PlanungWochenScreen />)
    const [diese, , kongress] = karten(container)
    // Je zwei Mikrofone am Dienstag und am Sonntag — der Dienst zählt seine Plätze.
    expect(diese!.querySelector('.wochen-karte-lage')?.textContent).toBe(zahlBinden('Offen: 4'))
    expect(diese!.querySelector('.wochen-karte-lage')?.getAttribute('data-art')).toBe('offen')
    expect(diese!.querySelector('.spur--knapp')).not.toBeNull()
    // Auf der Seite hat die Spur Platz für ihre Namen — Punkte nur in der Spalte.
    expect(diese!.querySelector('.spur--punkte')).toBeNull()
    expect(kongress!.querySelector('.spur')).toBeNull()
  })

  it('ein Tipp öffnet den Plan der Woche dort, wo das Erste zu tun ist — Zurück führt hierher (T144)', () => {
    const { container, dispatch } = zeige(<PlanungWochenScreen />)
    fireEvent.click(karten(container)[1]!.querySelector('.wochen-karte-knopf')!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'navigate', screen: 'planen', woche: { wi: 2, tab: 'mid' }, von: 'wochen' })
  })

  it('unten die nächste Woche ohne Programm, mit „Holen"', () => {
    const { container } = zeige(<PlanungWochenScreen />)
    const holen = container.querySelector('.holen-karte')!
    expect(holSpanne(container)).toBe('28. September – 4. Oktober')
    expect(holen.textContent).toContain(t.programmNichtGeholt)
    expect(holen.querySelector('button')?.textContent).toBe(t.holen)
  })

  it('keine Wahl mehr darüber — die steht allein auf „Planung" (T144)', () => {
    const { container } = zeige(<PlanungWochenScreen />)
    expect(container.querySelector('.bereich-tabs')).toBeNull()
    expect(container.querySelector('.planung-karte')).toBeNull()
    expect(container.querySelector('h1')?.textContent).toBe(t.navZusammenkuenfte)
  })

  it('vor dem Titel Zurück zur Wahl — ab Tablet-Breite; am Handy tragen beides der Kopf der App (T144)', () => {
    // Bis zur Laufzeitprüfung am 25.10.2026 fehlte es am Tablet: Der Kopf der
    // App steht dort nicht, und die Seite hatte keinen eigenen Knopf.
    const { container, dispatch } = zeige(<PlanungWochenScreen />)
    expect(container.querySelector('.planen-knopf'), 'kein „Planen" auf der Seite der Wochen').toBeNull()
    fireEvent.click(container.querySelector(`.bereichstitel [aria-label="${t.a11yZurueck}"]`)!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'navigate', screen: 'planung' })
  })

  it('ohne geladene Woche steht nur „Holen" da — ab der laufenden', () => {
    const { container } = zeige(<PlanungWochenScreen />, { weeks: [], fsWeeks: [] })
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

  it('fehlt darunter — dann führt „Zusammenkünfte" auf der Wahl auf die Seite der Wochen', () => {
    const { container } = zeige(<PlanenScreen />, { screen: 'planen' })
    expect(container.querySelector('.wochen-spalte')).toBeNull()
  })

  it('trägt nur die Wochen — die Wahl steht seit T144 allein auf „Planung"', () => {
    breite(true)
    for (const tab of ['mid', 'fs'] as const) {
      const { container } = zeige(<PlanenScreen />, { screen: 'planen', tab })
      const spalte = container.querySelector('.wochen-spalte')!
      expect(spalte.querySelector('.bereich-tabs'), tab).toBeNull()
      expect(spalte.querySelector('.wochen-spalte-titel')?.textContent, tab).toBe(t.wochenLbl)
      expect(karten(spalte).length, tab).toBeGreaterThan(0)
      cleanup()
    }
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
    expect(gewaehlt.map(spanne)).toEqual([zahlBinden('14.–20. September')])
    expect(gewaehlt[0]!.querySelector('[aria-current="true"]')).not.toBeNull()
    fireEvent.click(karten(spalte)[0]!.querySelector('.wochen-karte-knopf')!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'navigate', screen: 'planen', woche: { wi: 1, tab: 'we' } })
  })

  it('ein Tipp in der Spalte behält, woher das Planen kam — Zurück führt weiter dorthin (T144)', () => {
    breite(true)
    for (const von of ['planung', 'ansicht'] as const) {
      const { container, dispatch } = zeige(<PlanenScreen />, { screen: 'planen', tab: 'mid', week: 2, planenVon: von })
      fireEvent.click(karten(container.querySelector('.wochen-spalte')!)[0]!.querySelector('.wochen-karte-knopf')!)
      expect(dispatch, von).toHaveBeenCalledWith({ type: 'navigate', screen: 'planen', woche: { wi: 1, tab: 'mid' }, von })
      cleanup()
    }
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
