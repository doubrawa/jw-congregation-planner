/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import {
  AppDispatchContext,
  AppStateContext,
  AppStoreContext,
  type AppState,
  useStaticStore,
} from './context'
import { initialState } from './init'
import {
  buildDemoFsWeeks,
  buildDemoWeeks,
  CONGREGATION,
  DEMO_ABSENCES,
  DEMO_FS_RULES,
  DEMO_GROUPS,
  DEMO_MY_TASKS,
  DEMO_NOTIFICATIONS,
  DEMO_PERSONS,
  DEMO_SERVICES,
  FS_BASE,
} from '../data/testdaten'
import type { S89Payload, Screen } from '../data/types'

/**
 * **Jeder Knopf muss einen Namen haben.**
 *
 * Ein Knopf, der nur ein Zeichen trägt — ✕, ✓, ＋, ein Pfeil —, ist für einen
 * Screenreader stumm: Er wird angesagt als „Schaltfläche", und was sie tut,
 * steht nirgends. Dasselbe gilt für ein Eingabefeld ohne Beschriftung.
 *
 * Im Bestand ist das durchweg bedacht (`aria-label={t.a11yClose}` und
 * Geschwister). Genau deshalb lohnt die Prüfung: Es ist eine Zusicherung, die
 * heute überall gilt und beim nächsten Knopf leicht vergessen wird — und
 * niemandem auffällt, der sieht.
 */

vi.mock('./hydrate', () => ({ loadAndHydrate: () => Promise.resolve() }))
vi.mock('../lib/supabase', () => ({
  supabase: null,
  isSupabaseConfigured: false,
  performLogout: () => {},
}))

const { AppShell } = await import('./AppShell')

window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia

afterEach(cleanup)

const S89: S89Payload = {
  name: 'Xavo Quintus',
  partner: '',
  date: 'Dienstag, 8. September · 19:00',
  type: 'Bibellesung',
  point: 'th Lektion 2',
  aux: false,
}

function zeige(over: Partial<AppState> = {}) {
  const state: AppState = {
    ...initialState(),
    dataStatus: 'ready',
    congregationId: 'c1',
    userId: 'u1',
    personId: DEMO_PERSONS[0]!.id,
    planner: true,
    terminGewaehlt: true,
    congregation: { ...CONGREGATION },
    persons: [...DEMO_PERSONS],
    groups: [...DEMO_GROUPS],
    services: [...DEMO_SERVICES],
    weeks: buildDemoWeeks(),
    fsWeeks: buildDemoFsWeeks(),
    fsRules: [...DEMO_FS_RULES],
    fsBase: FS_BASE,
    absences: [...DEMO_ABSENCES],
    notifs: [...DEMO_NOTIFICATIONS],
    myTasks: [...DEMO_MY_TASKS],
    members: [{ userId: 'u1', personId: DEMO_PERSONS[0]!.id, planner: true, email: 'a@b.c' }],
    week: 0,
    tab: 'mid',
    ...over,
  }
  function Buehne() {
    const store = useStaticStore(state)
    return (
      <AppDispatchContext.Provider value={vi.fn()}>
        <AppStoreContext.Provider value={store}>
          <AppStateContext.Provider value={state}>
            <AppShell />
          </AppStateContext.Provider>
        </AppStoreContext.Provider>
      </AppDispatchContext.Provider>
    )
  }
  return render(<Buehne />)
}

const SCREENS: Screen[] = [
  'start', 'programm', 'aufgaben', 'planen', 'personen', 'einstellungen', 'profil',
]

const LAGEN: Array<[string, Partial<AppState>]> = [
  ...SCREENS.map((screen) => [`Bildschirm ${screen}`, { screen }] as [string, Partial<AppState>]),
  ['Planen · Wochenende', { screen: 'planen', tab: 'we' }],
  ['Planen · Predigtdienst', { screen: 'planen', tab: 'fs' }],
  ['Mitteilungen', { screen: 'start', notifOpen: true }],
  ['Aufgaben-Blatt', { screen: 'aufgaben', myTaskId: DEMO_MY_TASKS[0]?.id ?? '' }],
  ['Sprachauswahl', { screen: 'einstellungen', langSheetOpen: true }],
  ['S-89-Formular', { screen: 'aufgaben', s89: S89 }],
  ['Dienst-Freigabe', { screen: 'einstellungen', svcSheet: DEMO_SERVICES[0]?.key ?? '' }],
  ['Personen-Detail', { screen: 'personen', selectedPersonId: DEMO_PERSONS[0]!.id }],
]

/**
 * Ein Zeichen, das ein Wort ausmacht — Buchstabe oder Ziffer, in jeder Schrift.
 *
 * **Die eigentliche Prüfung steckt hier.** Ein Knopf mit „✕" hat formal einen
 * Namen, und ein Screenreader liest ihn auch vor: „Multiplikationszeichen".
 * Damit ist niemandem geholfen. Erst ein Wort sagt, was der Knopf tut —
 * deshalb zählt nur ein Name mit Buchstaben oder Ziffern.
 */
const WORTZEICHEN = /[\p{L}\p{N}]/u

/**
 * Der Name, den ein Hilfsmittel ansagt: die Beschriftung, sonst der sichtbare
 * Text. `aria-hidden`-Zeichen im Inneren zählen nicht mit — sie werden ebenso
 * wenig vorgelesen wie auf dem Bildschirm gedeutet.
 */
function angesagt(el: Element): string {
  const label = el.getAttribute('aria-label')
  if (label?.trim()) return label.trim()
  const kopie = el.cloneNode(true) as Element
  for (const weg of kopie.querySelectorAll('[aria-hidden="true"]')) weg.remove()
  return (kopie.textContent ?? '').trim()
}

/** Sagt dieser Knopf mit Worten, was er tut? */
function hatNamen(el: Element): boolean {
  return WORTZEICHEN.test(angesagt(el))
}

/** Ein Knopf, der sich nur durch ein Zeichen zu erkennen gibt. */
function beschreibung(el: Element): string {
  const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 30)
  return `<${el.tagName.toLowerCase()} class="${el.getAttribute('class') ?? ''}">${text}`
}

describe('Die Oberfläche ist ohne Augen bedienbar', () => {
  it.each(LAGEN)('%s — jeder Knopf sagt, was er tut', (_name, over) => {
    const { container } = zeige(over)
    const knoepfe = [...container.querySelectorAll('button, [role="switch"]')].filter(
      (el) => el.closest('[aria-hidden="true"]') === null,
    )
    // Gegenprobe: Ohne Knöpfe prüfte der Test nichts.
    expect(knoepfe.length, 'keine Knöpfe gefunden').toBeGreaterThan(2)

    const stumm = knoepfe.filter((el) => !hatNamen(el)).map(beschreibung)
    expect(stumm, `ohne Namen: ${stumm.join(' · ')}`).toEqual([])
  })

  it.each(LAGEN)('%s — jedes Eingabefeld ist beschriftet', (_name, over) => {
    const { container } = zeige(over)
    const felder = [...container.querySelectorAll('input, select, textarea')].filter(
      (el) => el.getAttribute('type') !== 'hidden' && el.closest('[aria-hidden="true"]') === null,
    )
    const ohne = felder
      .filter((el) => {
        if (el.getAttribute('aria-label')?.trim()) return false
        const id = el.getAttribute('id')
        if (id && container.querySelector(`label[for="${id}"]`)) return false
        return el.closest('label') === null
      })
      .map(beschreibung)
    expect(ohne, `ohne Beschriftung: ${ohne.join(' · ')}`).toEqual([])
  })
})
