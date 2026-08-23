/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { AppDispatchContext, AppStateContext, AppStoreContext, type AppState, useStaticStore } from './context'
import { initialState } from './init'
import { dict } from '../i18n/ui'
import { emptyQualifications } from '../data/helpers'
import type { Group, Notification, Person } from '../data/types'

/**
 * **Das App-Gerüst — die Hälfte der Rechteprüfung, die niemand gesehen hat.**
 *
 * Wer welchen Bereich betreten darf, steht an **zwei** Stellen: der Wächter in
 * `reducer.ts` (`case 'navigate'`) weist eine gesperrte Ansicht ab — und die
 * Navigationsliste hier entscheidet, welcher Eintrag überhaupt dasteht.
 * `reducer.test.ts` prüft den Wächter. Bliebe die Liste ungeprüft, sähe ein
 * Verkündiger den Punkt „Personen" und liefe beim Antippen ins Programm
 * zurück — der Fehler wäre sichtbar, aber kein Test würde rot.
 *
 * Dazu das übrige Gerüst, das sonst nirgends geprüft war: Mitteilungs-Chip,
 * Offline-Banner, die vier Status-Ansichten (Laden / keine Versammlung /
 * Fehler / leer), das Einlösen eines Einladungscodes, der Drawer und der
 * Push-Deep-Link.
 */

const loadAndHydrate = vi.fn(() => Promise.resolve())
const redeemInvite = vi.fn(() => Promise.resolve<string | null>(null))
const performLogout = vi.fn()

vi.mock('./hydrate', () => ({ loadAndHydrate: (...a: unknown[]) => loadAndHydrate(...(a as [])) }))
vi.mock('../lib/data', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  redeemInvite: (...a: unknown[]) => redeemInvite(...(a as [])),
}))
vi.mock('../lib/supabase', () => ({
  supabase: null,
  isSupabaseConfigured: false,
  performLogout: (...a: unknown[]) => performLogout(...(a as [])),
}))

const { AppShell } = await import('./AppShell')

const t = dict('de')

const person = (id: string, fn: string, ln: string): Person => ({
  id, fn, ln, role: 'verkuendiger', tel: '', mail: '', priv: emptyQualifications(),
})

const PLANER = person('p-planer', 'Paula', 'Planer')
const AUFSEHER = person('p-ov', 'Olaf', 'Overseer')
const VERKUENDIGER = person('p-verk', 'Vera', 'Verkuendiger')
const GRUPPEN: Group[] = [{ id: 'g1', name: 'Gruppe 1', ov: 'p-ov', as: null }]

function zustand(over: Partial<AppState> = {}): AppState {
  return {
    ...initialState(),
    screen: 'start',
    dataStatus: 'ready',
    dataEmpty: false,
    congregationId: 'c1',
    userId: 'u1',
    personId: PLANER.id,
    planner: true,
    persons: [PLANER, AUFSEHER, VERKUENDIGER],
    groups: GRUPPEN,
    weeks: [],
    fsWeeks: [],
    myTasks: [],
    pendingIds: [],
    substituteReqs: [],
    notifs: [],
    absences: [],
    ...over,
  }
}

function zeige(over: Partial<AppState> = {}) {
  const dispatch = vi.fn()
  const state = zustand(over)
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
  return { dispatch, state, ...render(<Buehne />) }
}

/** Beschriftungen der Hauptnavigation (Desktop-Sidebar, die immer gerendert wird). */
const navPunkte = (c: HTMLElement) =>
  [...(c.querySelector('.sidebar .sidebar-nav')?.querySelectorAll('button') ?? [])].map(
    (b) => b.textContent ?? '',
  )

beforeEach(() => {
  loadAndHydrate.mockClear()
  redeemInvite.mockClear().mockResolvedValue(null)
  performLogout.mockClear()
  history.replaceState(null, '', '/')
})
afterEach(cleanup)

describe('Die Navigationsliste ist die zweite Hälfte der Rechteprüfung', () => {
  it('der Planer sieht alle sieben Bereiche', () => {
    const { container } = zeige({ planner: true })
    expect(navPunkte(container)).toEqual([
      t.navStart, t.navProgramm, t.navAufgaben, t.navPlanen, t.navPersonen, t.navEinstellungen, t.navProfil,
    ])
  })

  it('der Verkündiger sieht weder Planen noch Personen noch Einstellungen', () => {
    const { container } = zeige({ planner: false, personId: VERKUENDIGER.id })
    expect(navPunkte(container)).toEqual([t.navStart, t.navProgramm, t.navAufgabenLong, t.navProfil])
  })

  it('der Gruppenaufseher bekommt Planen und Einstellungen dazu — Personen nicht', () => {
    // Er plant die Treffpunkte seiner Gruppe; die Personenverwaltung bleibt zu.
    const { container } = zeige({ planner: false, personId: AUFSEHER.id })
    expect(navPunkte(container)).toEqual([
      t.navStart, t.navProgramm, t.navAufgabenLong, t.navPlanen, t.navEinstellungen, t.navProfil,
    ])
  })

  it('auch der Gruppen-Gehilfe zählt als Aufseher', () => {
    const { container } = zeige({
      planner: false,
      personId: VERKUENDIGER.id,
      groups: [{ id: 'g1', name: 'Gruppe 1', ov: 'p-ov', as: VERKUENDIGER.id }],
    })
    expect(navPunkte(container)).toContain(t.navPlanen)
  })

  it('Vollständigkeitsprobe: kein Eintrag ohne Recht — die Liste deckt sich mit dem Wächter', async () => {
    // Gegenprobe zur Rechteprüfung im Reducer: Was hier steht, muss dort
    // durchgehen. Sonst zeigt die App einen Punkt, der ins Programm zurückwirft.
    const { reducer } = await import('./reducer')
    for (const [rolle, over] of [
      ['Planer', { planner: true, personId: PLANER.id }],
      ['Gruppenaufseher', { planner: false, personId: AUFSEHER.id }],
      ['Verkündiger', { planner: false, personId: VERKUENDIGER.id }],
    ] as const) {
      const { container } = zeige(over)
      const beschriftungen = navPunkte(container)
      const start = zustand(over)
      for (const [screen, label] of Object.entries({
        start: t.navStart, programm: t.navProgramm, planen: t.navPlanen,
        personen: t.navPersonen, einstellungen: t.navEinstellungen, profil: t.navProfil,
      } as const)) {
        if (!beschriftungen.includes(label)) continue
        const next = reducer(start, { type: 'navigate', screen: screen as never })
        expect(next.screen, `${rolle} · ${label}`).toBe(screen)
      }
      cleanup()
    }
  })

  it('ein Klick auf einen Punkt navigiert dorthin', () => {
    const { container, dispatch } = zeige()
    const planen = [...container.querySelectorAll('.sidebar .sidebar-nav button')].find(
      (b) => b.textContent === t.navPlanen,
    )!
    fireEvent.click(planen)
    expect(dispatch).toHaveBeenCalledWith({ type: 'navigate', screen: 'planen' })
  })

  it('der aktive Punkt ist als solcher ausgezeichnet — für Auge und Screenreader', () => {
    const { container } = zeige({ screen: 'programm' })
    const aktiv = container.querySelectorAll('.sidebar .sidebar-nav [aria-current="page"]')
    expect(aktiv).toHaveLength(1)
    expect(aktiv[0]?.textContent).toBe(t.navProgramm)
  })
})

describe('Der Mitteilungs-Chip zählt nur das Ungelesene', () => {
  const notif = (id: string, read: boolean): Notification => ({
    id, type: 'zuteilung', title: 'Neue Zuteilung', text: 'x', at: new Date().toISOString(), read,
  })

  it('ohne Ungelesenes trägt er nur das Wort', () => {
    const { container } = zeige({ notifs: [notif('n1', true)] })
    const chip = container.querySelector('.notif-chip')!
    expect(chip.textContent).toBe(t.mitteilungen)
    expect(chip.className).not.toContain('has-unread')
  })

  it('mit Ungelesenem nennt er die Zahl — und hebt sich ab', () => {
    const { container } = zeige({ notifs: [notif('n1', false), notif('n2', false), notif('n3', true)] })
    const chip = container.querySelector('.notif-chip')!
    expect(chip.textContent).toBe(`2 ${t.neuSuffix}`)
    expect(chip.className).toContain('has-unread')
  })

  it('ein Tipp öffnet die Mitteilungen', () => {
    const { container, dispatch } = zeige()
    fireEvent.click(container.querySelector('.notif-chip')!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'openNotifs' })
  })
})

describe('Das Offline-Banner nennt den Stand', () => {
  it('ohne Offline-Stand steht es nicht da', () => {
    const { container } = zeige({ staleAt: null })
    expect(container.querySelector('.offline-banner')).toBeNull()
  })

  it('mit Offline-Stand nennt es Zeitpunkt und Einschränkung', () => {
    const at = new Date(2026, 7, 23, 14, 5).getTime()
    const { container } = zeige({ staleAt: at })
    const banner = container.querySelector('.offline-banner')!
    expect(banner.textContent).toContain('23.08')
    expect(banner.textContent).toContain('14:05')
    expect(banner.textContent).toContain(t.offlineBannerHint)
  })

  it('ein unbekanntes Sprach-Tag lässt es nicht abstürzen', () => {
    // toLocaleString wirft bei einem ungültigen Tag — dann gilt die Systemsprache.
    const at = new Date(2026, 7, 23, 14, 5).getTime()
    expect(() => zeige({ staleAt: at, lang: 'xx-nicht-echt' as AppState['lang'] })).not.toThrow()
    expect(document.querySelector('.offline-banner')).toBeTruthy()
  })

  it('„Neu laden" lädt die Seite neu', () => {
    const reload = vi.fn()
    const echt = window.location
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...echt, reload, pathname: '/', search: '', hash: '' },
    })
    const { container } = zeige({ staleAt: Date.now() })
    fireEvent.click(container.querySelector('.offline-banner-btn')!)
    expect(reload).toHaveBeenCalled()
    Object.defineProperty(window, 'location', { configurable: true, value: echt })
  })
})

describe('Die vier Status-Ansichten der Datenanbindung', () => {
  it('während des Ladens steht der Ladehinweis — und kein Screen', () => {
    const { container, getByText } = zeige({ dataStatus: 'loading' })
    expect(getByText(t.laedt)).toBeTruthy()
    expect(container.querySelector('.status-view')).toBeTruthy()
  })

  it('ein Ladefehler bietet „erneut versuchen" an', () => {
    const { getByText } = zeige({ dataStatus: 'error' })
    expect(getByText(t.stFehler)).toBeTruthy()
    fireEvent.click(getByText(t.stErneut))
    expect(loadAndHydrate).toHaveBeenCalled()
  })

  it('die leere Versammlung verweist an den Koordinator — ohne Knopf, der Demo-Daten einfüllt', () => {
    const { getByText, container } = zeige({ dataEmpty: true })
    expect(getByText(t.stLeer)).toBeTruthy()
    expect(getByText(t.stLeerText)).toBeTruthy()
    expect(container.querySelector('.status-btn')).toBeNull()
  })

  it('der Status geht dem Screen vor — auch mit gesetztem screen', () => {
    const { container } = zeige({ dataStatus: 'loading', screen: 'personen' })
    expect(container.querySelector('.status-view')).toBeTruthy()
  })
})

describe('Ein Konto ohne Versammlung löst seinen Einladungscode ein', () => {
  const zeigeOhneVersammlung = () => zeige({ dataStatus: 'no-membership' })

  it('nennt den Fall und bietet das Feld an', () => {
    const { getByText, container } = zeigeOhneVersammlung()
    expect(getByText(t.stKeineVers)).toBeTruthy()
    expect(container.querySelector<HTMLInputElement>('.status-input')).toBeTruthy()
  })

  it('Kleinschreibung wird zu Großschreibung — Codes sind großgeschrieben', () => {
    const { container } = zeigeOhneVersammlung()
    const feld = container.querySelector<HTMLInputElement>('.status-input')!
    fireEvent.change(feld, { target: { value: 'abc123' } })
    expect(feld.value).toBe('ABC123')
  })

  it('ein leeres Feld löst gar nichts aus — kein Netzaufruf', () => {
    const { container } = zeigeOhneVersammlung()
    fireEvent.click(container.querySelector('.status-btn')!)
    expect(redeemInvite).not.toHaveBeenCalled()
  })

  it('ein gültiger Code lädt die Versammlung nach', async () => {
    const { container } = zeigeOhneVersammlung()
    fireEvent.change(container.querySelector('.status-input')!, { target: { value: 'ABC123' } })
    fireEvent.click(container.querySelector('.status-btn')!)
    await waitFor(() => expect(redeemInvite).toHaveBeenCalledWith('ABC123'))
    await waitFor(() => expect(loadAndHydrate).toHaveBeenCalled())
  })

  it('ein ungültiger Code sagt es — in der Sprache der App, nicht als Fehlercode', async () => {
    redeemInvite.mockResolvedValue('invalid-code')
    const { container, dispatch } = zeigeOhneVersammlung()
    fireEvent.change(container.querySelector('.status-input')!, { target: { value: 'FALSCH' } })
    fireEvent.click(container.querySelector('.status-btn')!)
    await waitFor(() =>
      expect(dispatch).toHaveBeenCalledWith({ type: 'showToast', text: t.invCodeInvalid }),
    )
    expect(loadAndHydrate).not.toHaveBeenCalled()
  })

  it('ein Konto, das schon Mitglied ist, bekommt seinen eigenen Satz', async () => {
    redeemInvite.mockResolvedValue('already-member')
    const { container, dispatch } = zeigeOhneVersammlung()
    fireEvent.change(container.querySelector('.status-input')!, { target: { value: 'ABC123' } })
    fireEvent.click(container.querySelector('.status-btn')!)
    await waitFor(() =>
      expect(dispatch).toHaveBeenCalledWith({ type: 'showToast', text: t.invAlreadyMember }),
    )
  })

  it('eine unbekannte Meldung wird durchgereicht statt verschluckt', async () => {
    redeemInvite.mockResolvedValue('etwas ganz anderes')
    const { container, dispatch } = zeigeOhneVersammlung()
    fireEvent.change(container.querySelector('.status-input')!, { target: { value: 'ABC123' } })
    fireEvent.click(container.querySelector('.status-btn')!)
    await waitFor(() =>
      expect(dispatch).toHaveBeenCalledWith({ type: 'showToast', text: 'etwas ganz anderes' }),
    )
  })

  it('nach einem Fehlschlag ist der Knopf wieder bedienbar — sonst säße man fest', async () => {
    redeemInvite.mockResolvedValue('invalid-code')
    const { container } = zeigeOhneVersammlung()
    const knopf = container.querySelector<HTMLButtonElement>('.status-btn')!
    fireEvent.change(container.querySelector('.status-input')!, { target: { value: 'FALSCH' } })
    fireEvent.click(knopf)
    await waitFor(() => expect(knopf.disabled).toBe(false))
  })
})

describe('Das mobile Seitenmenü', () => {
  it('ist zu, bis man es öffnet', () => {
    const { container } = zeige()
    expect(container.querySelector('.drawer')).toBeNull()
    expect(container.querySelector('.menu-btn')?.getAttribute('aria-expanded')).toBe('false')
  })

  it('der Menü-Knopf öffnet es als Dialog', () => {
    const { container } = zeige()
    fireEvent.click(container.querySelector('.menu-btn')!)
    const drawer = container.querySelector('.drawer')!
    expect(drawer.getAttribute('role')).toBe('dialog')
    expect(drawer.getAttribute('aria-modal')).toBe('true')
  })

  it('Escape schließt es wieder', () => {
    const { container } = zeige()
    fireEvent.click(container.querySelector('.menu-btn')!)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(container.querySelector('.drawer')).toBeNull()
  })

  it('ein Klick auf den Hintergrund ebenfalls', () => {
    const { container } = zeige()
    fireEvent.click(container.querySelector('.menu-btn')!)
    fireEvent.click(container.querySelector('.drawer-backdrop')!)
    expect(container.querySelector('.drawer')).toBeNull()
  })

  it('eine Navigation schließt es mit — sonst stünde es über dem neuen Screen', () => {
    const { container, dispatch } = zeige()
    fireEvent.click(container.querySelector('.menu-btn')!)
    const punkt = [...container.querySelectorAll('.drawer .sidebar-nav button')].find(
      (b) => b.textContent === t.navProgramm,
    )!
    fireEvent.click(punkt)
    expect(dispatch).toHaveBeenCalledWith({ type: 'navigate', screen: 'programm' })
    expect(container.querySelector('.drawer')).toBeNull()
  })

  it('das Menü führt dieselben Punkte wie die Sidebar — eine Rechteliste, zwei Orte', () => {
    const { container } = zeige({ planner: false, personId: VERKUENDIGER.id })
    fireEvent.click(container.querySelector('.menu-btn')!)
    const imMenue = [...container.querySelectorAll('.drawer .sidebar-nav button')].map((b) => b.textContent)
    expect(imMenue).toEqual(navPunkte(container))
  })
})

describe('Abmelden und Rollenanzeige', () => {
  it('der Fuß nennt Namen und Rolle', () => {
    const { container } = zeige()
    expect(container.querySelector('.sidebar-profile-name')?.textContent).toBe('Paula Planer')
    expect(container.querySelector('.sidebar-profile-role')?.textContent).toBe(t.rolleKoordinator)
  })

  it('im Demo-Modus steht der Zusatz dahinter', () => {
    const { container } = zeige({ dataStatus: 'demo' })
    expect(container.querySelector('.sidebar-profile-role')?.textContent).toBe(
      t.rolleKoordinator + t.demoSuffix,
    )
  })

  it('ohne eigene Person bleibt der Name leer, statt „undefined" zu zeigen', () => {
    const { container } = zeige({ personId: null })
    expect(container.querySelector('.sidebar-profile-name')?.textContent).toBe('')
    expect(container.querySelector('.sidebar-profile .avatar')?.textContent).toBe('–')
  })

  it('„Abmelden" meldet ab', () => {
    const { container, dispatch } = zeige()
    fireEvent.click(container.querySelector('.sidebar-logout')!)
    expect(performLogout).toHaveBeenCalledWith(dispatch)
  })
})

describe('Der Login rendert ohne App-Gerüst', () => {
  it('kein Sidebar, kein Kopf, kein Mitteilungs-Chip', () => {
    const { container } = zeige({ screen: 'login' })
    expect(container.querySelector('.sidebar')).toBeNull()
    expect(container.querySelector('.mobile-header')).toBeNull()
    expect(container.querySelector('.notif-chip')).toBeNull()
    expect(container.querySelector('.app-main.is-login')).toBeTruthy()
  })

  it('die Passwort-Rücksetz-Ansicht ebenso — sie kommt aus einem Mail-Link', () => {
    const { container } = zeige({ screen: 'start', recovery: true })
    expect(container.querySelector('.sidebar')).toBeNull()
    expect(container.querySelector('.app-main.is-login')).toBeTruthy()
  })
})

describe('Der Toast', () => {
  it('steht nur, wenn es etwas zu melden gibt', () => {
    expect(zeige().container.querySelector('.toast')).toBeNull()
    cleanup()
    const { container } = zeige({ toast: { id: 1, text: 'Zugeteilt' } })
    const toast = container.querySelector('.toast')!
    expect(toast.textContent).toBe('Zugeteilt')
    expect(toast.getAttribute('role')).toBe('status')
  })
})

describe('Der Push-Deep-Link führt in den erlaubten Bereich', () => {
  it('führt den Planer dorthin, wohin der Push zeigt', () => {
    history.replaceState(null, '', '/#go=planen')
    const { dispatch } = zeige({ planner: true })
    expect(dispatch).toHaveBeenCalledWith({ type: 'navigate', screen: 'planen' })
  })

  it('einen Verkündiger, der „planen" gar nicht sehen darf, führt er zu den Aufgaben', () => {
    history.replaceState(null, '', '/#go=planen')
    const { dispatch } = zeige({ planner: false, personId: VERKUENDIGER.id })
    expect(dispatch).toHaveBeenCalledWith({ type: 'navigate', screen: 'aufgaben' })
  })

  it('lädt die Daten still nach — der Push meldet eine Änderung auf dem Server', () => {
    history.replaceState(null, '', '/#go=aufgaben')
    zeige()
    expect(loadAndHydrate).toHaveBeenCalledWith(expect.anything(), 'u1', { silent: true })
  })

  it('nimmt den Hash aus der Adresse — ein Neuladen springt nicht noch einmal', () => {
    history.replaceState(null, '', '/#go=aufgaben')
    zeige()
    expect(location.hash).toBe('')
  })

  it('am Login wird noch nicht gesprungen — erst nach dem Anmelden', () => {
    history.replaceState(null, '', '/#go=aufgaben')
    const { dispatch } = zeige({ screen: 'login' })
    expect(dispatch).not.toHaveBeenCalledWith({ type: 'navigate', screen: 'aufgaben' })
  })

  it('ein fremder Hash bleibt unangetastet — die Debug-Hashes leben daneben', () => {
    history.replaceState(null, '', '/#s=planen')
    zeige()
    expect(location.hash).toBe('#s=planen')
  })
})

describe('Die Begrüßung nach dem Anmelden', () => {
  it('nennt den Vornamen und räumt die Vormerkung ab', () => {
    const { dispatch } = zeige({ welcomePending: true })
    expect(dispatch).toHaveBeenCalledWith({ type: 'welcomeShown' })
    expect(dispatch).toHaveBeenCalledWith({ type: 'showToast', text: 'Willkommen, Paula!' })
  })

  it('wartet, solange die Daten noch laden — sonst grüßte sie ins Leere', () => {
    const { dispatch } = zeige({ welcomePending: true, dataStatus: 'loading' })
    expect(dispatch).not.toHaveBeenCalledWith({ type: 'welcomeShown' })
  })

  it('ohne Vormerkung wird nicht gegrüßt', () => {
    const { dispatch } = zeige({ welcomePending: false })
    expect(dispatch).not.toHaveBeenCalledWith({ type: 'welcomeShown' })
  })
})
