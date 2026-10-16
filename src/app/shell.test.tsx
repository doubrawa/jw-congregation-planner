/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { AppDispatchContext, AppStateContext, AppStoreContext, type AppState, useStaticStore } from './context'
import { demoZustand } from '../../tests/testdaten/demo-start'
import { APP_LANGS, LOCALES } from '../i18n/langs'
import { makeTr } from '../i18n/translate'
import { dict } from '../i18n/ui'
import { emptyQualifications } from '../data/helpers'
import type { Group, Notification, Person, SlotSelection } from '../data/types'

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
 * Dazu das übrige Gerüst, das sonst nirgends geprüft war: Glocke,
 * Offline-Banner, die vier Status-Ansichten (Laden / keine Versammlung /
 * Fehler / leer), die Schublade, der Kopf
 * des Planens und der Push-Deep-Link.
 */

const loadAndHydrate = vi.fn(() => Promise.resolve())
const performLogout = vi.fn()

vi.mock('./hydrate', () => ({ loadAndHydrate: (...a: unknown[]) => loadAndHydrate(...(a as [])) }))
vi.mock('../lib/supabase', () => ({
  supabase: null,
  isSupabaseConfigured: false,
}))
vi.mock('../lib/abmelden', () => ({ performLogout: (...a: unknown[]) => performLogout(...(a as [])) }))

const { AppShell } = await import('./AppShell')

const t = dict('de')

const person = (id: string, fn: string, ln: string): Person => ({
  id, fn, ln, role: 'verkuendiger', tel: '', mail: '', priv: emptyQualifications(),
})

const PLANER = person('p-planer', 'Paula', 'Planer')
const AUFSEHER = person('p-ov', 'Olaf', 'Overseer')
const VERKUENDIGER = person('p-verk', 'Vera', 'Verkuendiger')
const GRUPPEN: Group[] = [{ id: 'g1', name: 'Gruppe 1', overseerId: 'p-ov', assistantId: null }]

function zustand(over: Partial<AppState> = {}): AppState {
  return {
    ...demoZustand(),
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

/**
 * Das Menü am Desktop (`.leiste`) — es wird immer gerendert; welche Form man
 * sieht, entscheidet allein das CSS nach der Breite. Es trägt als einziges
 * auch „Mitteilungen".
 */
const LEISTE = '.leiste .seitenmenue'

/** Beschriftungen der Hauptnavigation, in ihrer Reihenfolge. */
const beschriftungen = (wurzel: Element | null) =>
  [...(wurzel?.querySelectorAll('.menue-eintrag') ?? [])].map((b) => b.querySelector('.menue-eintrag-text')?.textContent ?? '')
const navPunkte = (c: HTMLElement) => beschriftungen(c.querySelector(LEISTE))

beforeEach(() => {
  loadAndHydrate.mockClear()
  performLogout.mockClear()
  history.replaceState(null, '', '/')
})
afterEach(cleanup)

/** Überschriften der Menü-Abschnitte. */
const abschnittTitel = (c: HTMLElement) =>
  [...c.querySelectorAll(`${LEISTE} .seitenmenue-titel`)].map((e) => e.textContent ?? '')

/** Den Menüpunkt mit dieser Beschriftung antippen (Menü am Desktop). */
function tippe(c: HTMLElement, label: string) {
  const punkt = [...c.querySelectorAll(`${LEISTE} .menue-eintrag`)].find(
    (b) => b.querySelector('.menue-eintrag-text')?.textContent === label,
  )
  if (!punkt) throw new Error(`kein Menüpunkt „${label}"`)
  fireEvent.click(punkt)
}

describe('Die Navigationsliste ist die zweite Hälfte der Rechteprüfung', () => {
  /*
   * **Das Menü im neuen Design** (T121, entschieden am 11.10.2026): Eigenes
   * oben, dann die Versammlung mit ihren Bereichen, zuletzt „Planen und
   * verwalten" — die Planung für alle, die planen dürfen, Personen und
   * Einstellungen nur für den Admin. Das Profil erreicht man über den Namen.
   */
  it('der Admin sieht Eigenes, die Bereiche der Versammlung, die Planung und die Verwaltung', () => {
    // „Weitere Pläne" (T120, Phase 5) immer — dort legt er den ersten an.
    const { container } = zeige({ planner: true })
    expect(navPunkte(container)).toEqual([
      t.navStart, t.navAufgabenLong, t.mitteilungen,
      t.navZusammenkuenfte, t.tabFs, t.navWeiterePlaene,
      t.dashPlanung, t.navPersonen, t.navEinstellungen,
    ])
    expect(abschnittTitel(container)).toEqual([t.versammlungLbl, t.navPlanenVerwalten])
  })

  it('der Verkündiger sieht dieselben Bereiche — ohne Planen und Verwalten, ohne leere Weitere Pläne', () => {
    const { container } = zeige({ planner: false, personId: VERKUENDIGER.id })
    expect(navPunkte(container)).toEqual([t.navStart, t.navAufgabenLong, t.mitteilungen, t.navZusammenkuenfte, t.tabFs])
    expect(abschnittTitel(container)).toEqual([t.versammlungLbl])
  })

  it('„Weitere Pläne" erscheint dem Verkündiger, sobald ein veröffentlichter Plan läuft', () => {
    const plan = { id: 'pl', vorlage: 'saal' as const, name: 'Winterdienst', von: '2026-01-05', bis: '2099-12-31', entwurf: false }
    const sichtbar = zeige({ planner: false, personId: VERKUENDIGER.id, plaene: [plan] })
    expect(navPunkte(sichtbar.container)).toContain(t.navWeiterePlaene)
    cleanup()
    // Ein Entwurf nicht.
    const entwurf = zeige({ planner: false, personId: VERKUENDIGER.id, plaene: [{ ...plan, entwurf: true }] })
    expect(navPunkte(entwurf.container)).not.toContain(t.navWeiterePlaene)
  })

  it('der Gruppenaufseher plant über „Planung" — die Treffpunkte seiner Gruppe', () => {
    // Die Einstellungen brauchte er nur für den Grundplan seiner Gruppe; der
    // steht seit T120 im Predigtdienst. Personen bleiben ohnehin zu.
    const { container, dispatch } = zeige({ planner: false, personId: AUFSEHER.id })
    expect(navPunkte(container)).toEqual([
      t.navStart, t.navAufgabenLong, t.mitteilungen, t.navZusammenkuenfte, t.tabFs, t.dashPlanung,
    ])
    tippe(container, t.dashPlanung)
    expect(dispatch).toHaveBeenCalledWith({ type: 'navigate', screen: 'planen', thema: 'predigtdienst' })
  })

  it('„Planung" führt den Planer zu den Wochen — ohne Platz für die Spalte auf ihre Seite (T121, Phase 10)', () => {
    // jsdom kennt keine Breite: Hier gilt die Fassung des Handys.
    const { container, dispatch } = zeige({ planner: true })
    tippe(container, t.dashPlanung)
    expect(dispatch).toHaveBeenCalledWith({ type: 'navigate', screen: 'planung' })
  })

  it('… und wo die Wochen neben den Plan passen, gleich ins Planen der Zusammenkünfte', () => {
    // Nur die Breite der Spalte zählt (`WOCHEN_SPALTE_BREITE`), nicht schon der Desktop.
    window.matchMedia = vi.fn((abfrage: string) => ({ matches: abfrage === '(min-width: 1400px)' })) as unknown as typeof window.matchMedia
    try {
      const { container, dispatch } = zeige({ planner: true })
      tippe(container, t.dashPlanung)
      expect(dispatch).toHaveBeenCalledWith({ type: 'navigate', screen: 'planen', thema: 'zusammenkuenfte' })
    } finally {
      delete (window as { matchMedia?: unknown }).matchMedia
    }
  })

  it('das Profil ist kein Menüpunkt — der Name im Fuß führt hin und nennt es', () => {
    const { container, dispatch } = zeige({ planner: true })
    expect(navPunkte(container)).not.toContain(t.navProfil)
    const fuss = container.querySelector(`${LEISTE} .menue-profil`)!
    expect(fuss.querySelector('.menue-profil-unterzeile')?.textContent).toBe(`${t.navProfil} · ${t.rolleKoordinator}`)
    fireEvent.click(fuss)
    expect(dispatch).toHaveBeenCalledWith({ type: 'navigate', screen: 'profil' })
  })

  it('wer in einer Gruppe ist, hat sie im Fuß stehen', () => {
    const mitGruppe = { ...PLANER, grp: 'g1' }
    const { container } = zeige({ persons: [mitGruppe, AUFSEHER, VERKUENDIGER] })
    expect(container.querySelector(`${LEISTE} .menue-profil-unterzeile`)?.textContent).toBe(
      `${t.navProfil} · ${t.rolleKoordinator} · Gruppe 1`,
    )
  })

  it('die Gruppe im Fuß steht in der Sprache der App — wie im Profil', () => {
    // Bis zum 12.10.2026 stand sie hier unübersetzt („Gruppe 1" auch auf Englisch).
    const en = dict('en')
    const mitGruppe = { ...PLANER, grp: 'g1' }
    const { container } = zeige({ lang: 'en', persons: [mitGruppe, AUFSEHER, VERKUENDIGER] })
    expect(container.querySelector(`${LEISTE} .menue-profil-unterzeile`)?.textContent).toBe(
      `${en.navProfil} · ${en.rolleKoordinator} · ${makeTr('en')('Gruppe 1')}`,
    )
    expect(makeTr('en')('Gruppe 1')).not.toBe('Gruppe 1')
  })

  it('auf dem Profil ist der Name als aktuelle Seite markiert', () => {
    const { container } = zeige({ planner: true, screen: 'profil' })
    const fuss = container.querySelector(`${LEISTE} .menue-profil`)!
    expect(fuss.classList.contains('is-active')).toBe(true)
    expect(fuss.getAttribute('aria-current')).toBe('page')
  })

  it('Vollständigkeitsprobe: kein Eintrag ohne Recht — die Liste deckt sich mit dem Wächter', async () => {
    // Gegenprobe zur Rechteprüfung im Reducer: Was hier steht, muss dort
    // durchgehen. Sonst zeigt die App einen Punkt, der ins Programm zurückwirft.
    // Geprüft wird die Aktion, die der Punkt wirklich auslöst — bei den
    // Bereichen samt ihrem Reiter.
    const { reducer } = await import('./reducer')
    for (const [rolle, over] of [
      ['Planer', { planner: true, personId: PLANER.id }],
      ['Gruppenaufseher', { planner: false, personId: AUFSEHER.id }],
      ['Verkündiger', { planner: false, personId: VERKUENDIGER.id }],
    ] as const) {
      const { container, dispatch } = zeige(over)
      for (const label of navPunkte(container)) {
        dispatch.mockClear()
        tippe(container, label)
        const aktion = dispatch.mock.calls[0]?.[0]
        const next = reducer(zustand(over), aktion)
        expect(next.screen, `${rolle} · ${label}`).toBe(aktion.screen)
      }
      cleanup()
    }
  })

  it('ein Bereich öffnet immer zum Ansehen — auch wer gerade plant', () => {
    // Planen ist ein eigener Modus (11.10.2026): über „Planen" am Titel oder
    // über „Planung" im Menü. Bis dahin öffnete ein Thema beim Planen, wer
    // zuletzt geplant hatte.
    const { container, dispatch } = zeige({ planner: true, screen: 'planen', tab: 'mid' })
    tippe(container, t.tabFs)
    expect(dispatch).toHaveBeenCalledWith({ type: 'navigate', screen: 'programm', thema: 'predigtdienst' })
  })

  it('ein Klick auf einen Bildschirm-Punkt navigiert dorthin', () => {
    const { container, dispatch } = zeige()
    tippe(container, t.navPersonen)
    expect(dispatch).toHaveBeenCalledWith({ type: 'navigate', screen: 'personen' })
  })

  it('der aktive Punkt ist als solcher ausgezeichnet — beim Ansehen entscheidet der Reiter', () => {
    for (const [over, erwartet] of [
      [{ screen: 'programm', tab: 'mid' }, t.navZusammenkuenfte],
      [{ screen: 'programm', tab: 'fs' }, t.tabFs],
      [{ screen: 'planen', tab: 'edit' }, t.dashPlanung],
      [{ screen: 'planen', tab: 'fs' }, t.dashPlanung],
      [{ screen: 'planung' }, t.dashPlanung],
      [{ screen: 'aufgaben' }, t.navAufgabenLong],
      [{ screen: 'mitteilungen' }, t.mitteilungen],
    ] as const) {
      const { container } = zeige(over)
      const aktiv = container.querySelectorAll(`${LEISTE} .menue-eintrag[aria-current="page"]`)
      expect(aktiv).toHaveLength(1)
      expect(aktiv[0]?.querySelector('.menue-eintrag-text')?.textContent).toBe(erwartet)
      cleanup()
    }
  })

  it('an „Meine Aufgaben" steht, wie viele auf Zusage warten', () => {
    const offen = (id: string) => ({ ...demoZustand().myTasks[0]!, id, status: 'offen' as const })
    const { container } = zeige({ myTasks: [offen('a1'), offen('a2'), { ...offen('a3'), status: 'bestätigt' as const }] })
    const aufgaben = [...container.querySelectorAll(`${LEISTE} .menue-eintrag`)].find(
      (b) => b.querySelector('.menue-eintrag-text')?.textContent === t.navAufgabenLong,
    )!
    expect(aufgaben.querySelector('.menue-zahl')?.textContent).toBe('2')
  })
})

describe('Die Glocke zählt nur das Ungelesene', () => {
  const notif = (id: string, read: boolean): Notification => ({
    id, type: 'zuteilung', title: 'Neue Zuteilung', text: 'x', at: new Date().toISOString(), read,
  })
  const glocke = (c: HTMLElement) => c.querySelector<HTMLButtonElement>('.kopfzeile .kopfzeile-glocke')!

  it('ohne Ungelesenes heißt sie nur „Mitteilungen" und trägt keinen Punkt', () => {
    const { container } = zeige({ notifs: [notif('n1', true)] })
    expect(glocke(container).getAttribute('aria-label')).toBe(t.mitteilungen)
    expect(glocke(container).querySelector('.kopfzeile-neu')).toBeNull()
  })

  it('mit Ungelesenem nennt sie die Zahl — und trägt den Punkt', () => {
    const { container } = zeige({ notifs: [notif('n1', false), notif('n2', false), notif('n3', true)] })
    expect(glocke(container).getAttribute('aria-label')).toBe(`${t.mitteilungen}, Neu: 2`)
    expect(glocke(container).querySelector('.kopfzeile-neu')).not.toBeNull()
  })

  it('ein Tipp führt zu den Mitteilungen — einer eigenen Seite (T121)', () => {
    const { container, dispatch } = zeige()
    fireEvent.click(glocke(container))
    expect(dispatch).toHaveBeenCalledWith({ type: 'navigate', screen: 'mitteilungen' })
  })

  it('am Desktop stehen die Mitteilungen in der Leiste — mit derselben Zahl', () => {
    const { container, dispatch } = zeige({ notifs: [notif('n1', false), notif('n2', false)] })
    const eintrag = [...container.querySelectorAll(`${LEISTE} .menue-eintrag`)].find(
      (b) => b.querySelector('.menue-eintrag-text')?.textContent === t.mitteilungen,
    )!
    expect(eintrag.querySelector('.menue-zahl')?.textContent).toBe('2')
    fireEvent.click(eintrag)
    expect(dispatch).toHaveBeenCalledWith({ type: 'navigate', screen: 'mitteilungen' })
  })
})

describe('Klein steht die kleine Fassung des Logos (4.10.2026)', () => {
  it('im Menü 3-5-7 statt 4-6-8 — in den Farben der Darstellung', () => {
    // Klein verschwammen die 18 Plätze von 4-6-8 zu Streifen; die Anmeldung
    // (72 px) und die App-Icons behalten das große Zeichen.
    const { container } = zeige()
    const logo = container.querySelector(`${LEISTE} .logo`)!
    expect(logo.querySelectorAll('.logo-platz circle')).toHaveLength(3 + 5 + 7)
    expect(logo.querySelectorAll('.logo-pult')).toHaveLength(1)
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

  /*
   * Der Stand steht in der Sprache des Lesers, nicht in der des Systems.
   *
   * Geprüft wird die **Wirkung**, nicht der Weg dorthin: dass der Text
   * derselbe ist, den `LOCALES` für diese Sprache ergibt. Ob die Zeile den
   * nackten Sprachcode oder die Tabelle benutzt, unterscheidet Intl bei diesem
   * rein numerischen Format nicht (es löst `tl` selbst zu `fil` auf) — ein Test
   * darauf wäre eine Behauptung ohne Deckung. Was er hält, hält er dafür für
   * jede der 34 Sprachen: Sobald eine dabei ist, die Intl nicht selbst
   * auflöst, fällt es hier auf.
   */
  it('nennt den Zeitpunkt in der Sprache des Lesers, in jeder Sprache', () => {
    const at = new Date(2026, 7, 23, 14, 5).getTime()
    const opts: Intl.DateTimeFormatOptions = {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    }
    for (const { code } of APP_LANGS) {
      const { container } = zeige({ staleAt: at, lang: code })
      expect(container.querySelector('.offline-banner')!.textContent, code).toContain(
        new Date(at).toLocaleString(LOCALES[code], opts),
      )
      cleanup()
    }
  })

  it('„Neu laden" lädt die Seite neu', () => {
    const reload = vi.fn()
    const echt = window.location
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...echt, reload, pathname: '/', search: '', hash: '' },
    })
    const { container } = zeige({ staleAt: Date.now() })
    fireEvent.click(container.querySelector('.offline-banner button')!)
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

  it('die leere Versammlung verweist den Verkündiger an einen Admin — ohne Knopf, der Demo-Daten einfüllt', () => {
    const { getByText, container } = zeige({ dataEmpty: true, planner: false })
    expect(getByText(t.stLeer)).toBeTruthy()
    expect(getByText(t.stLeerText)).toBeTruthy()
    // Nur der Weg hinaus (seit 4.10.2026) — kein Knopf, der etwas einfüllt.
    expect([...container.querySelectorAll('.status-view button')].map((b) => b.textContent)).toEqual([t.abmelden])
  })

  it('dem Planer steht die leere Versammlung offen — er ist der Admin, an den der Hinweis verwiese', () => {
    // Personen anlegen und „Nächste Woche importieren" sind sein Weg hinein;
    // hinter dem Hinweis waren beide unerreichbar (bis zum 24.9.2026).
    const { container, queryByText } = zeige({ dataEmpty: true, planner: true })
    expect(container.querySelector('.status-view')).toBeNull()
    expect(queryByText(t.stLeer)).toBeNull()
  })

  it('ebenso dem Planer ohne Admin-Recht: Er holt das erste Programm (15.10.2026)', () => {
    const { container } = zeige({ dataEmpty: true, planner: false, zuteiler: true })
    expect(container.querySelector('.status-view')).toBeNull()
  })

  it('der Status geht dem Screen vor — auch mit gesetztem screen', () => {
    const { container } = zeige({ dataStatus: 'loading', screen: 'personen' })
    expect(container.querySelector('.status-view')).toBeTruthy()
  })
})

describe('Ein Konto ohne Versammlung', () => {
  /*
   * Seit dem Anmelden per Link (T121, Phase 8) gibt es keinen Code mehr zum
   * Einlösen: Ein Konto ohne Versammlung hat der Admin entfernt, hinein kommt
   * es nur mit einem neuen Link. Die Seite sagt das — und bietet Abmelden an.
   */
  const zeigeOhneVersammlung = () => zeige({ dataStatus: 'no-membership' })

  it('nennt den Fall und den Weg zurück — ein Feld für einen Code gibt es nicht mehr', () => {
    const { getByText, container } = zeigeOhneVersammlung()
    expect(getByText(t.stKeineVers)).toBeTruthy()
    expect(getByText(t.stKeineVersText)).toBeTruthy()
    expect(container.querySelector('.status-view input')).toBeNull()
  })
})

describe('Die Schublade am Handy (und am Tablet hochkant)', () => {
  const menueKnopf = (c: HTMLElement) => c.querySelector<HTMLButtonElement>('.kopfzeile .kopfzeile-menue')!

  it('ist zu, bis man sie öffnet', () => {
    const { container } = zeige()
    expect(container.querySelector('.schublade')).toBeNull()
    expect(menueKnopf(container).getAttribute('aria-expanded')).toBe('false')
  })

  it('der Menü-Knopf öffnet sie als Dialog', () => {
    const { container } = zeige()
    fireEvent.click(menueKnopf(container))
    const schublade = container.querySelector('.schublade')!
    expect(schublade.getAttribute('role')).toBe('dialog')
    expect(schublade.getAttribute('aria-modal')).toBe('true')
  })

  it('der Knopf der schmalen Leiste öffnet dieselbe', () => {
    const { container } = zeige()
    fireEvent.click(container.querySelector('.schmale-leiste .schmale-leiste-menue')!)
    expect(container.querySelector('.schublade')).not.toBeNull()
  })

  it('Escape schließt sie wieder', () => {
    const { container } = zeige()
    fireEvent.click(menueKnopf(container))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(container.querySelector('.schublade')).toBeNull()
  })

  it('ein Klick auf den Schleier ebenfalls — und das Kreuz', () => {
    const { container } = zeige()
    fireEvent.click(menueKnopf(container))
    fireEvent.click(container.querySelector('.schublade-schleier')!)
    expect(container.querySelector('.schublade')).toBeNull()
    fireEvent.click(menueKnopf(container))
    fireEvent.click(container.querySelector(`.schublade [aria-label="${t.a11yClose}"]`)!)
    expect(container.querySelector('.schublade')).toBeNull()
  })

  it('eine Navigation schließt sie mit — sonst stünde sie über dem neuen Screen', () => {
    const { container, dispatch } = zeige()
    fireEvent.click(menueKnopf(container))
    const punkt = [...container.querySelectorAll('.schublade .menue-eintrag')].find(
      (b) => b.querySelector('.menue-eintrag-text')?.textContent === t.navZusammenkuenfte,
    )!
    fireEvent.click(punkt)
    expect(dispatch).toHaveBeenCalledWith({ type: 'navigate', screen: 'programm', thema: 'zusammenkuenfte' })
    expect(container.querySelector('.schublade')).toBeNull()
  })

  it('sie führt dieselben Punkte wie die Leiste — ohne Mitteilungen, die hat die Glocke', () => {
    const { container } = zeige({ planner: false, personId: VERKUENDIGER.id })
    fireEvent.click(menueKnopf(container))
    const inDerSchublade = beschriftungen(container.querySelector('.schublade'))
    expect(inDerSchublade).toEqual(navPunkte(container).filter((p) => p !== t.mitteilungen))
  })

  it('die schmale Leiste ebenso — mit dem kurzen Namen für Meine Aufgaben', () => {
    const { container } = zeige({ planner: true })
    const kurz = [...container.querySelectorAll('.schmale-leiste .leisten-text')].map((e) => e.textContent)
    expect(kurz).toEqual(
      navPunkte(container)
        .filter((p) => p !== t.mitteilungen)
        .map((p) => (p === t.navAufgabenLong ? t.navAufgaben : p)),
    )
  })
})

/**
 * Die Kopfzeile auf dem Handy nennt die Versammlung (T107). Vorher stand dort
 * die Kurzform der Wortmarke, „VERSAMMLUNG" — sie sah aus wie eine Überschrift
 * und sagte nichts, weil das Wort in dieser App ohnehin überall steht.
 */
describe('Die Kopfzeile auf dem Handy nennt Tag und Versammlung', () => {
  const kopfName = (c: HTMLElement) => c.querySelector('.kopfzeile .kopfzeile-versammlung')
  const krumbach = { name: 'Krumbach', hall: '', times: demoZustand().congregation.times }

  it('steht die Versammlung — so, wie das Wörterbuch sie nennt', () => {
    const { container } = zeige({ congregation: krumbach })
    expect(kopfName(container)?.textContent).toBe('Versammlung Krumbach')
  })

  it('und darüber der heutige Tag in der Sprache der App', () => {
    const { container } = zeige({ congregation: krumbach })
    const tag = container.querySelector('.kopfzeile .kopfzeile-datum')?.textContent ?? ''
    expect(tag).toBe(new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date()))
  })

  it('ein langer Name wird nicht abgeschnitten, bevor er ankommt — kürzen darf nur die Anzeige', () => {
    const lang = 'Neu-Ulm Ludwigsfeld Spanischsprachige Versammlung'
    const { container } = zeige({ congregation: { ...krumbach, name: lang } })
    expect(kopfName(container)?.textContent).toBe(`Versammlung ${lang}`)
  })

  it('der Name in anderer Schrift bestimmt seine Leserichtung selbst', () => {
    const { container } = zeige({ congregation: { ...krumbach, name: 'جماعة الرياض' } })
    expect(kopfName(container)?.getAttribute('dir')).toBe('auto')
  })

  it('solange keine Versammlung geladen ist, steht der Produktname da — kein leerer Kopf', () => {
    // Beim Laden und für ein Konto, das noch keinen Code eingelöst hat, gibt es
    // keinen Versammlungsnamen. Ein leerer Kopf sähe aus wie ein Ladefehler.
    for (const over of [
      { dataStatus: 'loading' as const },
      { dataStatus: 'no-membership' as const },
    ]) {
      const { container } = zeige({ ...over, congregation: { ...krumbach, name: '' } })
      expect(kopfName(container)?.textContent).toBe('Versammlung.app')
      cleanup()
    }
  })

  it('ein Name aus lauter Leerzeichen zählt als leer', () => {
    const { container } = zeige({ congregation: { ...krumbach, name: '   ' } })
    expect(kopfName(container)?.textContent).toBe('Versammlung.app')
  })

  it('das Menü führt Produktnamen und Versammlung', () => {
    const { container } = zeige({ congregation: krumbach })
    const marke = container.querySelector(`${LEISTE} .seitenmenue-marke`)!
    expect(marke.querySelector('.seitenmenue-app')?.textContent).toBe('Versammlung.app')
    expect(marke.querySelector('.seitenmenue-versammlung')?.textContent).toBe('Krumbach')
  })
})

describe('Beim Planen trägt am Handy der Kopf des Planens Titel und „Fertig"', () => {
  it('Kreuz und „Fertig" führen zurück zum Ansehen desselben Bereichs', () => {
    const { container, dispatch } = zeige({ screen: 'planen', tab: 'fs' })
    const kopf = container.querySelector('.planenkopf')!
    expect(kopf.querySelector('.planenkopf-titel')?.textContent).toBe(t.tabFs)
    fireEvent.click(kopf.querySelector(`[aria-label="${t.planenBeenden}"]`)!)
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'navigate', screen: 'programm', thema: 'predigtdienst' })
    fireEvent.click([...kopf.querySelectorAll('button')].find((b) => b.textContent === t.fertig)!)
    expect(dispatch).toHaveBeenCalledTimes(2)
  })

  it('beim Gruppenaufseher nennt er den Predigtdienst — auch mit einem Reiter von früher', () => {
    // Darunter stehen seine Treffpunkte (`geplantesThema`); „Fertig" führt
    // dorthin zurück, nicht in die Zusammenkünfte.
    const { container, dispatch } = zeige({ planner: false, personId: AUFSEHER.id, screen: 'planen', tab: 'mid' })
    const kopf = container.querySelector('.planenkopf')!
    expect(kopf.querySelector('.planenkopf-titel')?.textContent).toBe(t.tabFs)
    fireEvent.click([...kopf.querySelectorAll('button')].find((b) => b.textContent === t.fertig)!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'navigate', screen: 'programm', thema: 'predigtdienst' })
  })

  it('beim Ansehen gibt es ihn nicht', () => {
    const { container } = zeige({ screen: 'programm', tab: 'mid' })
    expect(container.querySelector('.planenkopf')).toBeNull()
    expect(container.querySelector('.kopfzeile')?.classList.contains('kopfzeile--ersetzt')).toBe(false)
  })
})

describe('Auf den Mitteilungen steht am Handy der Kopf mit Zurück (T121)', () => {
  const ungelesen: Notification = {
    id: 'n1', type: 'zuteilung', title: 'Neue Zuteilung', text: 'x', at: new Date().toISOString(), read: false,
  }
  const kopf = (c: HTMLElement) => c.querySelector('.unterseitenkopf')

  it('statt der Kopfzeile — Zurück führt zu Start, wie die Zurück-Taste', () => {
    const { container, dispatch } = zeige({ screen: 'mitteilungen' })
    expect(container.querySelector('.kopfzeile')?.classList.contains('kopfzeile--ersetzt')).toBe(true)
    fireEvent.click(kopf(container)!.querySelector(`[aria-label="${t.a11yZurueck}"]`)!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'navigate', screen: 'start' })
  })

  it('daneben „Alle gelesen" — nur, solange es Neues gibt', () => {
    const leer = zeige({ screen: 'mitteilungen' })
    expect(kopf(leer.container)?.textContent).not.toContain(t.alleGelesen)
    cleanup()
    const { container, dispatch } = zeige({ screen: 'mitteilungen', notifs: [ungelesen] })
    const knopf = [...kopf(container)!.querySelectorAll('button')].find((b) => b.textContent === t.alleGelesen)!
    fireEvent.click(knopf)
    expect(dispatch).toHaveBeenCalledWith({ type: 'markAllRead' })
  })

  it('auf anderen Bildschirmen nicht', () => {
    const { container } = zeige({ screen: 'aufgaben' })
    expect(kopf(container)).toBeNull()
  })
})

describe('Abmelden und Rollenanzeige', () => {
  it('der Fuß nennt Namen und Rolle', () => {
    const { container } = zeige()
    expect(container.querySelector('.menue-profil-name')?.textContent).toBe('Paula Planer')
    expect(container.querySelector('.menue-profil-unterzeile')?.textContent).toBe(`${t.navProfil} · ${t.rolleKoordinator}`)
  })

  /*
   * **Wer eine Gruppe betreut, nennt sich so** (5.10.2026). Bis dahin stand dort
   * „Verkündiger" — dabei ändert und sendet er die Treffpunkte seiner Gruppe.
   */
  it('der Aufseher einer Gruppe steht als Gruppenaufseher da, sein Gehilfe als Gehilfe', () => {
    const rolle = (c: HTMLElement) => c.querySelector('.menue-profil-unterzeile')?.textContent?.split(' · ')[1]
    const aufseher = zeige({ planner: false, personId: AUFSEHER.id })
    expect(rolle(aufseher.container)).toBe(t.rolleGruppenaufseher)
    cleanup()
    const mitGehilfe = [{ ...GRUPPEN[0]!, overseerId: 'p-anders', assistantId: AUFSEHER.id }]
    const gehilfe = zeige({ planner: false, personId: AUFSEHER.id, groups: mitGehilfe })
    expect(rolle(gehilfe.container)).toBe(t.rolleGehilfe)
    cleanup()
    const verk = zeige({ planner: false, personId: VERKUENDIGER.id })
    expect(rolle(verk.container)).toBe(t.rolleVerkuendiger)
  })

  it('auch ohne Konto (Entwicklerseite) steht die Rolle ohne Zusatz da', () => {
    // Bis zum 2.10.2026 hing im Demo-Modus „ (Demo)" daran — und stand damit
    // auf jedem Handbuchbild. Die Entwicklerseite zeigt die App wie im Betrieb.
    const { container } = zeige({ userId: null, congregationId: null })
    expect(container.querySelector('.menue-profil-unterzeile')?.textContent).toBe(`${t.navProfil} · ${t.rolleKoordinator}`)
  })

  it('ohne eigene Person bleibt der Name leer, statt „undefined" zu zeigen', () => {
    const { container } = zeige({ personId: null })
    expect(container.querySelector('.menue-profil-name')?.textContent).toBe('')
    expect(container.querySelector('.menue-profil .menue-kuerzel')?.textContent).toBe('–')
  })

  it('im Menü steht kein „Abmelden" mehr — es steht im Profil, als Knopf wie „App installieren"', () => {
    // Seit dem 4.10.2026. Das Menü steht in drei Formen da (Leiste, schmale Leiste, Schublade).
    const { container, dispatch } = zeige({ screen: 'profil' })
    const menue = [...container.querySelectorAll('.leiste, .schmale-leiste, .schublade')]
    expect(menue.flatMap((m) => [...m.querySelectorAll('button')]).map((b) => b.textContent)).not.toContain(t.abmelden)
    const imProfil = [...container.querySelectorAll('.app-content button')].find((b) => b.textContent === t.abmelden)
    expect(imProfil?.classList.contains('knopf-umriss'), 'kein richtiger Knopf').toBe(true)
    // Mit Rückfrage (4.10.2026): Der erste Tipp fragt nur, erst der zweite meldet ab.
    fireEvent.click(imProfil!)
    expect(performLogout).not.toHaveBeenCalled()
    expect(imProfil!.textContent).toBe(t.abmeldenSicher)
    fireEvent.click(imProfil!)
    expect(performLogout).toHaveBeenCalledWith(dispatch)
  })

  it('ein Tipp daneben bricht die Rückfrage beim Abmelden ab', () => {
    const { container } = zeige({ screen: 'profil' })
    const knopf = [...container.querySelectorAll('.app-content button')].find((b) => b.textContent === t.abmelden)!
    fireEvent.click(knopf)
    fireEvent.blur(knopf)
    expect(knopf.textContent).toBe(t.abmelden)
    fireEvent.click(knopf)
    expect(performLogout).not.toHaveBeenCalled()
  })

  /*
   * Wo statt jedes Bildschirms eine Statusseite steht, ist das Profil nicht
   * erreichbar — bis zum 4.10.2026 war „Abmelden" im Menü dort der einzige Weg
   * hinaus. Wer mit dem falschen Konto angemeldet ist, säße sonst fest.
   */
  it.each([
    ['ohne Versammlung (Code einlösen)', { dataStatus: 'no-membership' } as Partial<AppState>],
    ['nach einem Ladefehler', { dataStatus: 'error' } as Partial<AppState>],
    ['vor einer leeren Versammlung (Verkündiger)', { dataEmpty: true, planner: false } as Partial<AppState>],
  ])('%s: die Statusseite meldet selbst ab', (_was, over) => {
    const { container, dispatch } = zeige(over)
    const knopf = [...container.querySelectorAll('.status-view button')].find((b) => b.textContent === t.abmelden)
    expect(knopf, 'kein Weg hinaus').toBeDefined()
    fireEvent.click(knopf!) // fragt nach …
    expect(performLogout).not.toHaveBeenCalled()
    fireEvent.click(knopf!) // … und meldet ab
    expect(performLogout).toHaveBeenCalledWith(dispatch)
  })

  it('beim Laden nicht — das dauert nur einen Augenblick', () => {
    const { container } = zeige({ dataStatus: 'loading' })
    expect(container.querySelector('.status-view')).not.toBeNull()
    expect([...container.querySelectorAll('.status-view button')].map((b) => b.textContent)).not.toContain(t.abmelden)
  })
})

describe('Der Login rendert ohne App-Gerüst', () => {
  it('kein Menü, keine Kopfzeile, keine Glocke', () => {
    const { container } = zeige({ screen: 'login' })
    expect(container.querySelector('.leiste')).toBeNull()
    expect(container.querySelector('.schmale-leiste')).toBeNull()
    expect(container.querySelector('.kopfzeile')).toBeNull()
    expect(container.querySelector('.app-main .login')).toBeTruthy()
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

  /*
   * „Ersatz gesucht" nennt zusätzlich den Bereich (T109). Die Navigation nimmt
   * ihn mit; springen tut dann „Meine Aufgaben", sobald das Gesuch dasteht.
   */
  it('„Ersatz gesucht" nimmt den Bereich Einspringen mit', () => {
    history.replaceState(null, '', '/#go=aufgaben&abschnitt=einspringen')
    const { dispatch } = zeige({ planner: false, personId: VERKUENDIGER.id })
    expect(dispatch).toHaveBeenCalledWith({ type: 'navigate', screen: 'aufgaben', abschnitt: 'einspringen' })
    expect(location.hash).toBe('')
  })

  it('auch bei schon offenem Fenster — dort kommt das Ziel als Hash-Wechsel', () => {
    const { dispatch } = zeige({ planner: false, personId: VERKUENDIGER.id })
    dispatch.mockClear()
    act(() => {
      history.replaceState(null, '', '/#go=aufgaben&abschnitt=einspringen')
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    expect(dispatch).toHaveBeenCalledWith({ type: 'navigate', screen: 'aufgaben', abschnitt: 'einspringen' })
  })

  it('ein Link ohne Bereich springt nirgendwohin — wie alle Pushes bisher', () => {
    history.replaceState(null, '', '/#go=aufgaben')
    const { dispatch } = zeige()
    const navigiert = dispatch.mock.calls.map(([a]) => a).filter((a) => a.type === 'navigate')
    expect(navigiert).toEqual([{ type: 'navigate', screen: 'aufgaben' }])
  })

  it('ein Bereich, der nicht zum Screen gehört, wird nicht mitgenommen', () => {
    history.replaceState(null, '', '/#go=planen&abschnitt=einspringen')
    const { dispatch } = zeige({ planner: true })
    const navigiert = dispatch.mock.calls.map(([a]) => a).filter((a) => a.type === 'navigate')
    expect(navigiert).toEqual([{ type: 'navigate', screen: 'planen' }])
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

describe('Am Desktop teilt die Spalte neben dem Plan zu — ohne Blatt darüber (T121, Phase 5d-2)', () => {
  /** Der erste Platz der Woche — welcher, ist gleich: Gefragt ist, wo er zugeteilt wird. */
  const SEL: SlotSelection = { kind: 'part', wi: 0, tab: 'mid', si: 0, ii: 0, ni: 0, label: 'Punkt', priv: null, groups: false }
  const breite = (desktop: boolean) => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: desktop }) as unknown as typeof window.matchMedia
  }
  const planen = () => zeige({ screen: 'planen', tab: 'mid', week: 0, weeks: demoZustand().weeks, slotSel: SEL })
  afterEach(() => {
    delete (window as { matchMedia?: unknown }).matchMedia
  })

  it('am Desktop steht der Platz in der Spalte, und kein Blatt legt sich darüber', () => {
    breite(true)
    const { container } = planen()
    expect(container.querySelector('.zuteilen-spalte .zuteilen-liste')).not.toBeNull()
    expect(document.querySelector('.sheet')).toBeNull()
  })

  it('am Handy derselbe Platz im Blatt', () => {
    breite(false)
    const { container } = planen()
    expect(container.querySelector('.zuteilen-spalte')).toBeNull()
    expect(document.querySelector('.sheet .zuteilen-liste')).not.toBeNull()
  })
})
