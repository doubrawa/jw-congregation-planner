/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { AppDispatchContext, AppStateContext, AppStoreContext, type AppState, useStaticStore } from './context'
import { sichtbareTexte } from '../../tests/deutsch-erkennen'
import { BILDSCHIRME } from '../../tests/testdaten/bildschirme'
import { demoZustand } from '../../tests/testdaten/demo-start'
import { ANSICHT_STUFEN, type AnsichtStufe } from '../data/ansicht'
import type { Group, MeetingTab, Notification, Screen } from '../data/types'
import { dict } from '../i18n/ui'
import { fill } from '../i18n/useT'

/**
 * **Befristet (T124): Die Ansicht zeigt, was die Stufe sieht — Bildschirm für
 * Bildschirm.**
 *
 * Der Admin schaltet im Profil auf Planer, Gruppenaufseher oder Verkündiger.
 * Taugen soll das nur, wenn er dann genau die App sieht, die ein echtes Konto
 * dieser Stufe sieht. Gemessen wird das am gerenderten DOM: dieselbe Person,
 * dieselben Daten, einmal mit den echten Rechten der Stufe und einmal als
 * Admin in der Ansicht. Bis auf die Leiste der Ansicht muss jeder Text gleich
 * sein — Menü, Knöpfe, Planen-Schalter, Mitteilungen, Karten.
 *
 * Ein Rechte-Entscheid an `rechteVon` vorbei fiele hier auf; die Quelltext-
 * Probe dazu steht in `tests/rechte-nur-ueber-rechtevon.test.ts`.
 */

vi.mock('./hydrate', () => ({ loadAndHydrate: () => Promise.resolve() }))
vi.mock('../lib/supabase', () => ({ supabase: null, isSupabaseConfigured: false }))

const { AppShell } = await import('./AppShell')

const t = dict('de')

// jsdom kennt `matchMedia` nicht; die Gesten fragen danach — die Handy-Fassung.
window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia

const DEMO = demoZustand()
/** Der Admin ist Simon (p9) — im Bestand Verkündiger, ohne Gruppe zu leiten. */
const ICH = 'p9'
const GRUPPE = DEMO.groups[0]!.id
/** Als Gruppenaufseher leitet er die erste Gruppe — echt wie gespielt, sonst wären es zwei Versammlungen. */
const ALS_AUFSEHER: Group[] = DEMO.groups.map((g, i) => (i === 0 ? { ...g, overseerId: ICH, assistantId: null } : g))
const gruppenFuer = (stufe: AnsichtStufe): Group[] => (stufe === 'gruppenaufseher' ? ALS_AUFSEHER : DEMO.groups)

/** Eine Mitteilung für alle und eine nur für die Planer (`local`). */
const MITTEILUNGEN: Notification[] = [
  { id: 'n1', type: 'zuteilung', title: 'Neue Zuteilung', text: 'Gebet', at: '2026-09-06T10:00:00.000Z', read: false },
  { id: 'n2', type: 'verhindert', title: 'Verhinderung', text: 'Gebet', at: '2026-09-06T11:00:00.000Z', read: false, local: true },
]

/** Die echten Rechte jeder Stufe — dieselbe Person, dieselben Daten. */
const ECHT: Record<AnsichtStufe, Pick<AppState, 'planner' | 'zuteiler'>> = {
  planer: { planner: false, zuteiler: true },
  gruppenaufseher: { planner: false, zuteiler: false },
  verkuendiger: { planner: false, zuteiler: false },
}

function zustand(over: Partial<AppState>): AppState {
  return {
    ...DEMO,
    dataStatus: 'ready',
    dataEmpty: false,
    congregationId: 'c1',
    userId: 'u1',
    personId: ICH,
    notifs: MITTEILUNGEN,
    terminGewaehlt: true,
    ...over,
  }
}

function zeige(state: AppState) {
  const dispatch = vi.fn()
  function Buehne() {
    const store = useStaticStore(state)
    return (
      <AppDispatchContext.Provider value={dispatch}>
        <AppStoreContext.Provider value={store}>
          <AppStateContext.Provider value={state}>
            <AppShell />
          </AppStateContext.Provider>
        </AppStoreContext.Provider>
      </AppDispatchContext.Provider>
    )
  }
  return { dispatch, ...render(<Buehne />) }
}

/**
 * Was nur die Ansicht zeigt: ihre Leiste und — im Profil — die Karte, mit der
 * man zurückschaltet. Abgezogen wird je Zeile einmal, nicht jede gleiche.
 */
function ohneAnsicht(texte: string[]): string[] {
  const karte = [...document.querySelectorAll('section')].find((s) => s.querySelector('h2')?.textContent === t.ansichtTitel)
  const weg = [...(karte ? sichtbareTexte(karte) : []), ...sichtbareTexte(document.querySelector('.ansicht-leiste') ?? document.createElement('div'))]
  const rest = [...texte]
  for (const zeile of weg) {
    const i = rest.indexOf(zeile)
    if (i >= 0) rest.splice(i, 1)
  }
  return rest
}

/** Jeder Bildschirm — Programm und Planen dazu je Reiter, der Rechte kennt. */
const ORTE: Array<[Screen, MeetingTab]> = [
  ...BILDSCHIRME.map((s): [Screen, MeetingTab] => [s, 'mid']),
  ['programm', 'fs'],
  ['programm', 'wp'],
  ['planen', 'fs'],
  ['planen', 'wp'],
  ['planen', 'zusagen'],
]

afterEach(cleanup)

describe('Die Ansicht einer Stufe zeigt, was die Stufe sieht (T124)', () => {
  it.each(ANSICHT_STUFEN)('%s', (stufe) => {
    const unterschiede: string[] = []
    const groups = gruppenFuer(stufe)
    for (const [screen, tab] of ORTE) {
      zeige(zustand({ ...ECHT[stufe], groups, screen, tab }))
      const echt = sichtbareTexte()
      cleanup()
      zeige(zustand({ planner: true, zuteiler: false, groups, ansicht: { stufe, gruppe: GRUPPE }, screen, tab }))
      const gespielt = ohneAnsicht(sichtbareTexte())
      cleanup()
      if (JSON.stringify(echt) !== JSON.stringify(gespielt)) {
        const nurEcht = echt.filter((z) => !gespielt.includes(z))
        const nurGespielt = gespielt.filter((z) => !echt.includes(z))
        unterschiede.push(`${screen}/${tab}: echt ${JSON.stringify(nurEcht)} · Ansicht ${JSON.stringify(nurGespielt)}`)
      }
    }
    expect(unterschiede).toEqual([])
  })

  it('die Probe sieht einen Unterschied, wo einer ist', () => {
    // Gegenprobe: der Admin selbst gegen den Verkündiger — dort fehlen Planen und Verwaltung.
    zeige(zustand({ planner: true, screen: 'start' }))
    const admin = sichtbareTexte()
    cleanup()
    zeige(zustand({ planner: false, screen: 'start' }))
    const verkuendiger = sichtbareTexte()
    expect(admin).not.toEqual(verkuendiger)
    expect(admin).toContain(t.navPersonen)
    expect(verkuendiger).not.toContain(t.navPersonen)
  })
})

describe('Die Leiste der Ansicht (T124)', () => {
  it('steht auf jedem Bildschirm, nennt die Stufe und führt zurück', () => {
    for (const screen of BILDSCHIRME) {
      const { container, dispatch } = zeige(zustand({ planner: true, ansicht: { stufe: 'verkuendiger', gruppe: null }, screen }))
      const leiste = container.querySelector('.ansicht-leiste')
      expect(leiste?.querySelector('strong')?.textContent, screen).toBe(fill(t.ansichtLeiste, { stufe: t.rolleVerkuendiger }))
      fireEvent.click(leiste!.querySelector('button')!)
      expect(dispatch).toHaveBeenCalledWith({ type: 'setAnsicht', ansicht: null })
      cleanup()
    }
  })

  it('ohne Ansicht keine Leiste — und ohne echtes Admin-Recht auch mit keiner', () => {
    expect(zeige(zustand({ planner: true, screen: 'start' })).container.querySelector('.ansicht-leiste')).toBeNull()
    cleanup()
    const planer = zustand({ planner: false, zuteiler: true, ansicht: { stufe: 'verkuendiger', gruppe: null }, screen: 'start' })
    expect(zeige(planer).container.querySelector('.ansicht-leiste')).toBeNull()
  })

  it('unter dem Namen steht die gespielte Stufe', () => {
    const { container } = zeige(zustand({ planner: true, ansicht: { stufe: 'gruppenaufseher', gruppe: GRUPPE }, screen: 'start' }))
    expect(container.querySelector('.leiste')?.textContent).toContain(t.rolleGruppenaufseher)
    expect(container.querySelector('.leiste')?.textContent).not.toContain(t.rolleKoordinator)
  })
})
