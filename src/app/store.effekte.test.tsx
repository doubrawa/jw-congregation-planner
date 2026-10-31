/** @vitest-environment happy-dom */
import { AuthRetryableFetchError } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { AppAction } from './context'
import type { LadeOptionen, StandOptionen } from './hydrate'
import { DE } from '../i18n/de'
import { APP_LANGS, isRTL } from '../i18n/langs'
import { dict, loadOverlay } from '../i18n/ui'

/**
 * **Was der Provider nebenher tut** — die Effekte, die keiner Aktion gehören.
 *
 * `store.test.tsx` prüft den Schreibschutz im Offline-Stand. Hier stehen die
 * übrigen Effekte, und jeder davon ist ein eigener Anwendungsfall:
 *
 * - **Fehlgeschlagene Schreibvorgänge melden.** Die Schreiber in `data.ts`
 *   sind fire-and-forget, der Erfolgs-Toast entsteht im Reducer, bevor die
 *   Datenbank geantwortet hat. Ohne diese Meldung liest der Nutzer
 *   „Zugeteilt", während nichts gespeichert wurde.
 * - **Schreibkonflikt** (T39): ein anderer Planer war schneller. Überschrieben
 *   wurde nichts — jetzt muss der Bildschirm zurück auf den Stand der
 *   Datenbank, sonst plant man auf einer Fassung weiter, die es nicht gibt.
 * - **Die Sitzung spiegeln**: eine bestehende Session überspringt den Login,
 *   `SIGNED_OUT` wirft zurück, der Link aus der E-Mail meldet an.
 * - **Gerätevorlieben auf `<html>`**: Theme, Schriftgröße, Sprache und
 *   Schreibrichtung. Sie stehen dort, weil das CSS sie liest — nicht als
 *   Zierde.
 *
 * Der Sitzungs-Teil braucht **keine** echte Instanz: geprüft wird die Seite
 * der App an diesem Vertrag, nicht die von Supabase.
 */

const authListener = { fn: null as ((e: string, s: unknown) => void) | null }
const unsubscribe = vi.fn()
type Antwort = { data: { session: { user: { id: string } } | null }; error?: unknown }
const getSession = vi.fn(() => Promise.resolve<Antwort>({ data: { session: null } }))
const supabaseStub = {
  auth: {
    getSession: () => getSession(),
    onAuthStateChange: (fn: (e: string, s: unknown) => void) => {
      authListener.fn = fn
      return { data: { subscription: { unsubscribe } } }
    },
  },
}
const loadAndHydrate = vi.fn((_dispatch: (a: AppAction) => void, _userId: string, _opts?: LadeOptionen) =>
  Promise.resolve(),
)
const letztenStandZeigen = vi.fn((_dispatch: (a: AppAction) => void, _userId: string, _wie?: StandOptionen): void => {})
const momentaufnahmeZeigen = vi.fn((_dispatch: (a: AppAction) => void, _userId: string, _wie?: StandOptionen): boolean => false)
const konfiguriert = { wert: true }
/** Was auth-js auf dem Gerät abgelegt hat — echt gelesen in `gespeicherte-sitzung.test.ts`. */
const abgelegt = vi.hoisted(() => ({ wert: null as { userId: string } | null }))
vi.mock('../lib/gespeicherte-sitzung', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  gespeicherteSitzung: () => abgelegt.wert,
}))

vi.mock('../lib/supabase', () => ({
  get supabase() {
    return konfiguriert.wert ? supabaseStub : null
  },
  get isSupabaseConfigured() {
    return konfiguriert.wert
  },
}))
vi.mock('./hydrate', () => ({
  loadAndHydrate: (...a: Parameters<typeof loadAndHydrate>) => loadAndHydrate(...a),
  // Weitergereicht wird, was kam — ohne `wie` auch ohne drittes Argument.
  letztenStandZeigen: (dispatch: (a: AppAction) => void, userId: string, ...wie: [StandOptionen?]) =>
    letztenStandZeigen(dispatch, userId, ...wie),
  momentaufnahmeZeigen: (dispatch: (a: AppAction) => void, userId: string, ...wie: [StandOptionen?]) =>
    momentaufnahmeZeigen(dispatch, userId, ...wie),
}))
const mitLinkAnmelden = vi.fn((_token: string) => Promise.resolve<string | null>(null))
vi.mock('../lib/anmelden', () => ({ mitLinkAnmelden: (token: string) => mitLinkAnmelden(token) }))
vi.mock('../lib/snapshot', () => ({
  saveSnapshot: vi.fn(), readSnapshot: vi.fn(() => null), clearSnapshot: vi.fn(),
}))
const ausstehendesSchreiben = vi.fn()
vi.mock('./persist', () => ({ persist: vi.fn(), ausstehendesSchreiben: () => ausstehendesSchreiben() }))
const kalender = vi.hoisted(() => ({ tag: '2026-10-16' }))
vi.mock('./useKalendertag', () => ({ useKalendertag: () => kalender.tag }))
const pushAboAbgleichen = vi.fn((_cong: string, _user: string, _lang: string) => Promise.resolve())
vi.mock('../lib/push-abo', () => ({
  pushAboAbgleichen: (cong: string, user: string, lang: string) => pushAboAbgleichen(cong, user, lang),
}))

/**
 * Die beiden Melder liegen in `data.ts` als Modulvariable; ausgelöst werden sie
 * dort beim fehlgeschlagenen bzw. kollidierenden Schreibvorgang. Statt einen
 * echten Schreibvorgang nachzustellen (das prüft `data-save.test.ts`), wird
 * hier die Übergabestelle abgegriffen: Der Provider trägt seine Funktion ein,
 * und der Test ruft genau die auf, die `data.ts` aufrufen würde.
 */
const melder = { schreibfehler: null as (() => void) | null, konflikt: null as (() => void) | null }
vi.mock('../lib/data', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  setSchreibfehlerMelder: (fn: (() => void) | null) => {
    melder.schreibfehler = fn
  },
  setKonfliktMelder: (fn: (() => void) | null) => {
    melder.konflikt = fn
  },
}))

const { AppProvider } = await import('./store')
const { aktuelleSitzung } = await import('./sitzung')
const { STANDARD_ZEITEN } = await import('../data/vorgaben')
const { useApp } = await import('./context')
const { anmeldeAdresseVergessen } = await import('../login/anmelde-adresse')

/** Auslösen, was `data.ts` bei einem Fehlschlag auslösen würde. */
function melderAufrufen(art: 'schreibfehler' | 'konflikt'): void {
  melder[art]?.()
}

function huelle({ children }: { children: ReactNode }) {
  return <AppProvider>{children}</AppProvider>
}

function starte() {
  return renderHook(() => useApp(), { wrapper: huelle })
}

/** Alles abwarten, was gerade unterwegs ist — die Prüfung beim Start läuft über mehrere Schritte. */
async function abwarten(): Promise<void> {
  await act(async () => {
    await new Promise((fertig) => setTimeout(fertig, 0))
  })
}

/** Lädt es still? So fragt das Laden selbst (`hydrate.ts`): Die Frage gilt beim Beginn und mit der Antwort. */
function istStill(opts?: LadeOptionen): boolean {
  return typeof opts?.silent === 'function' ? opts.silent() : opts?.silent === true
}

/**
 * Wie der Provider dieses Konto zuletzt geladen hat: still über dem letzten
 * Stand oder sichtbar mit dem Startbild — so, wie das Laden jetzt fragen würde.
 */
function ladeweise(userId: string): 'still' | 'sichtbar' | 'gar nicht' {
  const aufrufe = loadAndHydrate.mock.calls.filter((aufruf) => aufruf[1] === userId)
  const letzter = aufrufe[aufrufe.length - 1]
  if (!letzter) return 'gar nicht'
  return istStill(letzter[2]) ? 'still' : 'sichtbar'
}

beforeEach(() => {
  konfiguriert.wert = true
  authListener.fn = null
  melder.schreibfehler = null
  melder.konflikt = null
  unsubscribe.mockClear()
  loadAndHydrate.mockClear().mockResolvedValue(undefined)
  letztenStandZeigen.mockReset()
  momentaufnahmeZeigen.mockReset().mockReturnValue(false)
  abgelegt.wert = null
  getSession.mockClear().mockResolvedValue({ data: { session: null } })
  mitLinkAnmelden.mockClear()
  // Ohne Link in der Adresse, wie jeder gewöhnliche Start.
  window.history.replaceState(null, '', '/')
  anmeldeAdresseVergessen()
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
  document.documentElement.removeAttribute('dir')
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('Fehlgeschlagene Schreibvorgänge werden gemeldet', () => {
  it('ein Fehlschlag erzeugt einen Hinweis', () => {
    const { result } = starte()
    act(() => {
      melderAufrufen('schreibfehler')
    })
    expect(result.current.state.toast?.text).toBe(DE.toastSpeicherFehler)
  })

  it('mehrere kurz hintereinander erzeugen nur einen — sonst verdeckt der letzte alles', () => {
    // Ein Fehlschlag reißt meist mehrere Writes mit (Token weg, Netz weg).
    // Gemessen wird über das Wiederauftauchen: der Hinweis blendet sich nach
    // 2,4 s aus, und ein gesperrter zweiter Fehlschlag holt ihn nicht zurück.
    vi.useFakeTimers()
    const { result } = starte()
    act(() => {
      melderAufrufen('schreibfehler')
    })
    expect(result.current.state.toast?.text).toBe(DE.toastSpeicherFehler)
    act(() => {
      vi.advanceTimersByTime(2400)
    })
    expect(result.current.state.toast).toBeNull()
    act(() => {
      melderAufrufen('schreibfehler')
      melderAufrufen('schreibfehler')
    })
    expect(result.current.state.toast).toBeNull()
  })

  it('nach der Sperrfrist wieder — ein späterer Fehlschlag ist eine neue Nachricht', () => {
    vi.useFakeTimers()
    const { result } = starte()
    act(() => {
      melderAufrufen('schreibfehler')
    })
    act(() => {
      vi.advanceTimersByTime(6000)
    })
    expect(result.current.state.toast).toBeNull() // zwischendurch ausgeblendet
    act(() => {
      melderAufrufen('schreibfehler')
    })
    expect(result.current.state.toast?.text).toBe(DE.toastSpeicherFehler)
  })

  it('beim Abbauen wird der Melder abgeräumt — kein Aufruf in einen toten Baum', () => {
    const { unmount } = starte()
    unmount()
    expect(() => melderAufrufen('schreibfehler')).not.toThrow()
  })
})

describe('Schreibkonflikt: ein anderer Planer war schneller (T39)', () => {
  it('meldet es und lädt still den Stand der Datenbank nach', async () => {
    const { result } = starte()
    await act(async () => {
      result.current.dispatch({ type: 'setDataStatus', status: 'ready', userId: 'u1' })
    })
    loadAndHydrate.mockClear()
    await act(async () => {
      melderAufrufen('konflikt')
    })
    expect(result.current.state.toast?.text).toBe(DE.toastSpeicherFehler)
    expect(loadAndHydrate).toHaveBeenCalledWith(expect.anything(), 'u1', { silent: true })
  })

  it('während das Nachladen läuft, meldet ein zweiter Konflikt nichts', async () => {
    let loslassen: () => void = () => {}
    loadAndHydrate.mockReturnValue(new Promise<void>((res) => { loslassen = res }))
    const { result } = starte()
    await act(async () => {
      result.current.dispatch({ type: 'setDataStatus', status: 'ready', userId: 'u1' })
    })
    await act(async () => {
      melderAufrufen('konflikt')
    })
    loadAndHydrate.mockClear()
    await act(async () => {
      melderAufrufen('konflikt')
    })
    expect(loadAndHydrate).not.toHaveBeenCalled()
    await act(async () => {
      loslassen()
    })
  })

  it('ohne angemeldetes Konto wird nichts nachgeladen', async () => {
    const { result } = starte()
    await act(async () => {
      result.current.dispatch({ type: 'logout' })
    })
    loadAndHydrate.mockClear()
    await act(async () => {
      melderAufrufen('konflikt')
    })
    expect(loadAndHydrate).not.toHaveBeenCalled()
  })
})

/**
 * **Das Konto auf diesem Gerät** (16.10.2026): Nach dem Laden wird geprüft, ob
 * das Push-Abo des Geräts dem Angemeldeten gehört; das Abmelden beendet die
 * Sitzung, in der noch geladen wird.
 */
/** Was das Laden einspielt: eine kleine, leere Versammlung. */
const geladen = {
  congregation: { name: 'K', hall: '', times: STANDARD_ZEITEN },
  planner: false,
  zuteiler: false,
  personId: null,
  persons: [],
  services: [],
  groups: [],
  weeks: [],
  fsRules: [],
  fsWeeks: [],
  gruppenbesuche: [],
  vortraege: [],
  trolleys: [],
  trolleyTermine: [],
  plaene: [],
  planEintraege: [],
  absences: [],
  notifications: [],
  confirmations: {},
  sentLog: {},
  persoenlich: {},
  reminders: { first: 7, last: 1, repeat: false },
  congLang: 'de',
  progLangs: [],
  members: [],
  anmeldeLinks: [],
  auxClass: false,
  congregationId: 'c1',
  userId: 'u1',
  empty: false,
}

describe('Konto auf diesem Gerät', () => {
  it('nach dem Laden fragt die App einmal, ob das Push-Abo dem Angemeldeten gehört', async () => {
    pushAboAbgleichen.mockClear()
    const { result } = starte()
    await act(async () => {
      result.current.dispatch({ type: 'hydrate', payload: geladen })
    })
    expect(pushAboAbgleichen).toHaveBeenCalledTimes(1)
    expect(pushAboAbgleichen).toHaveBeenCalledWith('c1', 'u1', result.current.state.lang)
    // Ein weiteres Laden desselben Kontos fragt nicht noch einmal.
    await act(async () => {
      result.current.dispatch({ type: 'hydrate', payload: geladen })
    })
    expect(pushAboAbgleichen).toHaveBeenCalledTimes(1)
  })

  /*
   * **Ein neuer Tag** (16.10.2026): „Meine Aufgaben" lassen Vergangenes nur beim
   * Ableiten weg. Der Provider stößt es an, sobald der Kalendertag wechselt.
   */
  it('beim Tageswechsel stößt der Provider die neue Ableitung an — sonst nicht', async () => {
    const persistMock = vi.mocked((await import('./persist')).persist)
    const { rerender } = starte()
    persistMock.mockClear()
    rerender()
    expect(persistMock.mock.calls.some(([, , a]) => a.type === 'neuerTag')).toBe(false)
    kalender.tag = '2026-10-17'
    rerender()
    expect(persistMock.mock.calls.filter(([, , a]) => a.type === 'neuerTag')).toHaveLength(1)
    kalender.tag = '2026-10-16'
  })

  it('das Abmelden beendet die Sitzung — ein Laden, das noch läuft, spielt danach nichts ein', async () => {
    const { result } = starte()
    const vorher = aktuelleSitzung()
    await act(async () => {
      result.current.dispatch({ type: 'logout' })
    })
    expect(aktuelleSitzung()).toBe(vorher + 1)
  })
})

/**
 * **Geht die App in den Hintergrund, geht hinaus, was gebündelt wartet**
 * (15.10.2026). Wer am Handy einen Namen tippt und gleich in eine andere App
 * wechselt, dessen Änderung hing an einem Zeitgeber von 600 ms — den das
 * System im Hintergrund anhält, und mit der App beendet.
 */
describe('Verlassen der App', () => {
  /** Den Sichtbarkeitswechsel nachstellen, den der Browser beim App-Wechsel meldet. */
  function sichtbarkeit(zustand: 'hidden' | 'visible'): void {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => zustand })
    document.dispatchEvent(new Event('visibilitychange'))
  }
  afterEach(() => {
    Reflect.deleteProperty(document, 'visibilityState')
    ausstehendesSchreiben.mockClear()
  })

  it('in den Hintergrund: Gebündeltes geht sofort hinaus', () => {
    starte()
    sichtbarkeit('hidden')
    expect(ausstehendesSchreiben).toHaveBeenCalledTimes(1)
  })

  it('beim Zurückkehren nicht — da wartet nichts, was nicht ohnehin gleich geht', () => {
    starte()
    sichtbarkeit('visible')
    expect(ausstehendesSchreiben).not.toHaveBeenCalled()
  })

  it('nach dem Abbauen hört niemand mehr zu', () => {
    const { unmount } = starte()
    unmount()
    sichtbarkeit('hidden')
    expect(ausstehendesSchreiben).not.toHaveBeenCalled()
  })
})

describe('Die Supabase-Sitzung wird gespiegelt', () => {
  it('eine bestehende Sitzung überspringt den Login und lädt die Daten', async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: 'u7' } } } })
    const { result } = starte()
    await act(async () => {
      await Promise.resolve()
    })
    expect(result.current.state.screen).not.toBe('login')
    expect(ladeweise('u7')).toBe('sichtbar')
  })

  it('ohne Sitzung bleibt der Login stehen', async () => {
    const { result } = starte()
    await act(async () => {
      await Promise.resolve()
    })
    expect(result.current.state.screen).toBe('login')
    expect(loadAndHydrate).not.toHaveBeenCalled()
  })

  it('ein späteres Anmelden lädt ebenfalls', async () => {
    starte()
    await act(async () => {
      await Promise.resolve()
    })
    loadAndHydrate.mockClear()
    await act(async () => {
      authListener.fn?.('SIGNED_IN', { user: { id: 'u9' } })
    })
    expect(ladeweise('u9')).toBe('sichtbar')
  })

  it('ein erneutes SIGNED_IN desselben Kontos lädt nicht noch einmal', async () => {
    // auth-js meldet es bei jedem Zurückwechseln in den Tab. Ein volles Neuladen
    // darauf hieß bei jedem Fokus „Lädt …" und ein neu aufgebauter Bildschirm.
    getSession.mockResolvedValue({ data: { session: { user: { id: 'u7' } } } })
    starte()
    await act(async () => {
      await Promise.resolve()
    })
    loadAndHydrate.mockClear()
    await act(async () => {
      authListener.fn?.('SIGNED_IN', { user: { id: 'u7' } })
    })
    expect(loadAndHydrate).not.toHaveBeenCalled()
    // Nach dem Abmelden ist dasselbe Konto wieder ein neues Anmelden.
    await act(async () => {
      authListener.fn?.('SIGNED_OUT', null)
      authListener.fn?.('SIGNED_IN', { user: { id: 'u7' } })
    })
    expect(ladeweise('u7')).toBe('sichtbar')
  })

  it('ein SIGNED_IN ohne Sitzung lädt nichts — es gäbe kein Konto dazu', async () => {
    starte()
    await act(async () => {
      await Promise.resolve()
    })
    loadAndHydrate.mockClear()
    await act(async () => {
      authListener.fn?.('SIGNED_IN', null)
    })
    expect(loadAndHydrate).not.toHaveBeenCalled()
  })

  it('Abmelden wirft zurück auf den Login', async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: 'u7' } } } })
    const { result } = starte()
    await act(async () => {
      await Promise.resolve()
    })
    await act(async () => {
      authListener.fn?.('SIGNED_OUT', null)
    })
    expect(result.current.state.screen).toBe('login')
  })

  it('beim Abbauen wird das Abo gekündigt', async () => {
    const { unmount } = starte()
    await act(async () => {
      await Promise.resolve()
    })
    unmount()
    expect(unsubscribe).toHaveBeenCalled()
  })

  it('ohne Supabase wird gar nicht erst gefragt (keine Datenbank, Entwicklerseite)', async () => {
    konfiguriert.wert = false
    const { result } = starte()
    // Dann ist auch nichts offen: Das Gerüst zeigt sofort, womit die App startet.
    expect(result.current.state.sitzungPruefen).toBe(false)
    await act(async () => {
      await Promise.resolve()
    })
    expect(getSession).not.toHaveBeenCalled()
  })
})

/*
 * **Der Link aus der E-Mail** (T121, Phase 8): Öffnet jemand die App mit
 * `#anmelden=…`, meldet sie damit an — vor der Sitzung, die vielleicht schon
 * auf dem Gerät liegt: Der Link gehört dem, der ihn öffnet. Gilt er nicht
 * mehr, sagt sie es und bleibt bei dem, was da war.
 */
describe('Mit dem Link aus der E-Mail', () => {
  const TOKEN = 'T'.repeat(43)

  beforeEach(() => {
    window.history.replaceState(null, '', `/#anmelden=${TOKEN}`)
    anmeldeAdresseVergessen()
    mitLinkAnmelden.mockReset().mockResolvedValue(null)
  })

  it('meldet mit dem Token an, begrüßt — und nimmt es aus der Adresse', async () => {
    const { result } = starte()
    await act(async () => {
      await Promise.resolve()
    })
    expect(mitLinkAnmelden).toHaveBeenCalledWith(TOKEN)
    expect(result.current.state.screen).not.toBe('login')
    expect(result.current.state.welcomePending).toBe(true)
    expect(window.location.hash).toBe('')
    // Geladen wird über das Ereignis von Supabase, nicht hier — sonst doppelt.
    expect(getSession).not.toHaveBeenCalled()
  })

  it('gilt er nicht mehr, steht der Grund da, und es bleibt bei der Sitzung, die da war', async () => {
    mitLinkAnmelden.mockResolvedValue('abgelaufen')
    getSession.mockResolvedValue({ data: { session: { user: { id: 'u7' } } } })
    const { result } = starte()
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(result.current.state.toast?.text).toBe(DE.linkUngueltig)
    expect(ladeweise('u7')).toBe('sichtbar')
  })

  /*
   * **Erst prüfen, dann zeigen** (19.10.2026): Solange die Anmeldung mit dem
   * Link läuft, ist offen, wer angemeldet ist — das Gerüst zeigt das Ladebild.
   * Bis dahin stand die Anmeldung da, für jemanden, der sich gerade anmeldet.
   */
  it('bis die Anmeldung mit dem Link durch ist, bleibt offen, wer angemeldet ist', async () => {
    let fertig: (fehler: string | null) => void = () => {}
    mitLinkAnmelden.mockReturnValue(new Promise((res) => { fertig = res }))
    const { result } = starte()
    await abwarten()
    expect(result.current.state).toMatchObject({ sitzungPruefen: true, screen: 'login' })
    fertig(null)
    await abwarten()
    expect(result.current.state).toMatchObject({ sitzungPruefen: false, screen: 'start' })
  })

  it('gilt er nicht mehr und liegt keine Sitzung vor, steht die Anmeldung da — mit dem Grund', async () => {
    mitLinkAnmelden.mockResolvedValue('abgelaufen')
    const { result } = starte()
    await abwarten()
    expect(result.current.state).toMatchObject({ sitzungPruefen: false, screen: 'login' })
    expect(result.current.state.toast?.text).toBe(DE.linkUngueltig)
  })

  it('scheitert die Anmeldung mit dem Link ganz, steht trotzdem die Anmeldung da', async () => {
    // Ein Ladebild ohne Ende ließe nicht einmal mehr einen zweiten Versuch zu.
    const konsole = vi.spyOn(console, 'error').mockImplementation(() => {})
    mitLinkAnmelden.mockRejectedValue(new Error('kaputt'))
    const { result } = starte()
    await abwarten()
    expect(result.current.state).toMatchObject({ sitzungPruefen: false, screen: 'login' })
    expect(konsole).toHaveBeenCalledWith('[sitzung]', expect.any(Error))
    konsole.mockRestore()
  })

  it('ohne Link in der Adresse wird nicht angemeldet', async () => {
    window.history.replaceState(null, '', '/')
    anmeldeAdresseVergessen()
    starte()
    await act(async () => {
      await Promise.resolve()
    })
    expect(mitLinkAnmelden).not.toHaveBeenCalled()
  })
})

/*
 * **Offline-Start** (19.10.2026). Liegt ein Konto auf dem Gerät, steht das
 * Startbild höchstens vier Sekunden, offline gar nicht; danach der letzte
 * Stand dieses Kontos, nur lesend.
 *
 * Nach über einer Stunde muss auth-js das Token erst erneuern, und jede Frage
 * nach der Sitzung wartet auf das Netz. Offline gibt es nach 25 s auf und
 * meldet keine Sitzung, obwohl sie noch auf dem Gerät liegt; bis dahin kam
 * danach die Anmeldung. In der ersten Stunde antwortet es sofort, aber die
 * Abfragen der Daten scheitern, und PostgREST wiederholt jede dreimal: sieben
 * Sekunden Startbild. Die Momentaufnahme selbst lesen `letztenStandZeigen` und
 * `momentaufnahmeZeigen` (hier Attrappen, echt in `hydrate.test.ts`), die
 * abgelegte Sitzung `gespeicherteSitzung` (echt in `gespeicherte-sitzung.test.ts`).
 */
describe('Offline-Start', () => {
  /** Abgelegt ist eine Sitzung dieses Kontos. */
  const KONTO = { userId: 'u7' }
  /** Supabase antwortet nicht, solange es das Token erneuert — die letzte Nutzung liegt über eine Stunde zurück. */
  const haengt = (): void => {
    getSession.mockReturnValue(new Promise(() => {}))
  }
  /** Das Token gilt noch: Supabase antwortet sofort aus dem Speicher. */
  const giltNoch = (): void => {
    getSession.mockResolvedValue({ data: { session: { user: { id: 'u7' } } } })
  }
  /** Die Daten lassen auf sich warten: Das Laden beginnt (sichtbar mit dem Startbild) und kommt nicht an. */
  const datenHaengen = (): void => {
    loadAndHydrate.mockImplementation((dispatch, _userId, opts) => {
      if (!istStill(opts)) dispatch({ type: 'setDataStatus', status: 'loading' })
      return new Promise(() => {})
    })
  }
  /** Das Gerät meldet: kein Netz. */
  const offline = (): void => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false })
  }
  /** Das Gerät hat wieder Netz — noch ohne das Ereignis `online`. */
  const online = (): void => {
    Reflect.deleteProperty(navigator, 'onLine')
  }
  /** Das Netz ist zurück, und das Gerät meldet es (`online`). */
  const wiederOnline = async (): Promise<void> => {
    online()
    await act(async () => {
      window.dispatchEvent(new Event('online'))
    })
  }
  /** Die Wecker der Uhr laufen lassen und abwarten, was sie auslösen. */
  const vergehen = async (ms: number): Promise<void> => {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms)
    })
  }

  beforeEach(() => {
    // Der letzte Stand, wie ihn die Momentaufnahme einspielt: nur lesend —
    // „langsam", wenn der Wecker ihn zeigt (`hydrate.ts`).
    letztenStandZeigen.mockImplementation((dispatch, userId, wie) =>
      dispatch({
        type: 'hydrate',
        payload: { ...geladen, userId },
        staleAt: Date.now() - 7_200_000,
        ...(wie?.langsam ? { langsam: true as const } : {}),
      }),
    )
  })
  afterEach(() => {
    online()
  })

  it('nach über einer Stunde, offline: sofort der letzte Stand — kein Warten, keine Anmeldung', async () => {
    abgelegt.wert = KONTO
    offline()
    haengt()
    const { result } = starte()
    await abwarten()
    expect(letztenStandZeigen).toHaveBeenCalledWith(expect.anything(), 'u7', { langsam: false })
    expect(result.current.state).toMatchObject({ screen: 'start', sitzungPruefen: false, userId: 'u7', staleLangsam: false })
    expect(result.current.state.staleAt).not.toBeNull()
    // Geladen wird nicht: Jede Abfrage wartete ebenfalls auf die Erneuerung.
    expect(loadAndHydrate).not.toHaveBeenCalled()
  })

  it('online, aber Supabase antwortet nicht: nach vier Sekunden der letzte Stand — vorher nicht', async () => {
    // Im WLAN ohne Internet oder bei Empfang ohne Daten meldet das Gerät „online".
    vi.useFakeTimers()
    abgelegt.wert = KONTO
    haengt()
    const { result } = starte()
    await vergehen(3999)
    expect(result.current.state.sitzungPruefen).toBe(true)
    expect(letztenStandZeigen).not.toHaveBeenCalled()
    await vergehen(1)
    // Das Gerät meldet Netz, die Antwort kann noch kommen: „Verbindung langsam".
    expect(letztenStandZeigen).toHaveBeenCalledWith(expect.anything(), 'u7', { langsam: true })
    expect(result.current.state).toMatchObject({ screen: 'start', sitzungPruefen: false, staleLangsam: true })
  })

  it('in der ersten Stunde, offline: ebenso sofort der letzte Stand — geladen wird erst mit dem Netz', async () => {
    // Supabase antwortet sofort, aber jede Abfrage der Daten scheiterte am
    // Netz und würde dreimal wiederholt: bis zum 19.10.2026 abends sieben
    // Sekunden Startbild vor demselben letzten Stand.
    abgelegt.wert = KONTO
    offline()
    giltNoch()
    const { result } = starte()
    await abwarten()
    expect(letztenStandZeigen).toHaveBeenCalledTimes(1)
    expect(letztenStandZeigen).toHaveBeenCalledWith(expect.anything(), 'u7', { langsam: false })
    expect(result.current.state).toMatchObject({ screen: 'start', sitzungPruefen: false, userId: 'u7' })
    expect(result.current.state.staleAt).not.toBeNull()
    expect(loadAndHydrate).not.toHaveBeenCalled()
  })

  it('kommt das Netz zurück, kommen die Daten — still über dem letzten Stand', async () => {
    abgelegt.wert = KONTO
    offline()
    giltNoch()
    starte()
    await abwarten()
    await wiederOnline()
    expect(loadAndHydrate).toHaveBeenCalledTimes(1)
    expect(ladeweise('u7')).toBe('still')
  })

  it('kommt es zurück, während ohne Momentaufnahme die Fehlerseite steht, kommen sie sichtbar', async () => {
    letztenStandZeigen.mockImplementation((dispatch, userId) => dispatch({ type: 'setDataStatus', status: 'error', userId }))
    abgelegt.wert = KONTO
    offline()
    giltNoch()
    const { result } = starte()
    await abwarten()
    expect(result.current.state).toMatchObject({ dataStatus: 'error', userId: 'u7' })
    await wiederOnline()
    expect(ladeweise('u7')).toBe('sichtbar')
  })

  it('lädt es schon, lädt eine gelungene Erneuerung nicht daneben', async () => {
    // Nach über einer Stunde erneuert das Laden selbst das Token, und auth-js
    // meldet es mittendrin.
    abgelegt.wert = KONTO
    offline()
    haengt()
    starte()
    await abwarten()
    datenHaengen()
    await wiederOnline()
    await act(async () => {
      authListener.fn?.('TOKEN_REFRESHED', { user: { id: 'u7' } })
    })
    expect(loadAndHydrate).toHaveBeenCalledTimes(1)
  })

  it('im Alltag lädt das Netz nichts nach — die Daten sind ja da', async () => {
    giltNoch()
    starte()
    await abwarten()
    loadAndHydrate.mockClear()
    await wiederOnline()
    expect(loadAndHydrate).not.toHaveBeenCalled()
  })

  it('nach dem Abbauen hört niemand mehr auf das Netz', async () => {
    abgelegt.wert = KONTO
    offline()
    giltNoch()
    const { unmount } = starte()
    await abwarten()
    unmount()
    await wiederOnline()
    expect(loadAndHydrate).not.toHaveBeenCalled()
  })

  it('in der ersten Stunde, online, aber die Daten lassen auf sich warten: nach vier Sekunden der letzte Stand', async () => {
    // WLAN ohne Internet, schwacher Empfang: Das Gerät meldet „online", und die
    // Abfragen hängen oder scheitern erst nach ihren Wiederholungen.
    vi.useFakeTimers()
    momentaufnahmeZeigen.mockImplementation((dispatch, userId, wie) => {
      dispatch({
        type: 'hydrate',
        payload: { ...geladen, userId },
        staleAt: Date.now() - 7_200_000,
        ...(wie?.langsam ? { langsam: true as const } : {}),
      })
      return true
    })
    abgelegt.wert = KONTO
    giltNoch()
    datenHaengen()
    const { result } = starte()
    await vergehen(3999)
    expect(result.current.state.dataStatus).toBe('loading')
    expect(momentaufnahmeZeigen).not.toHaveBeenCalled()
    await vergehen(1)
    expect(momentaufnahmeZeigen).toHaveBeenCalledWith(expect.anything(), 'u7', { langsam: true })
    expect(result.current.state).toMatchObject({ screen: 'start', dataStatus: 'ready', userId: 'u7', staleLangsam: true })
    expect(result.current.state.staleAt).not.toBeNull()
    // Das Laden läuft weiter, und was es bringt, kommt jetzt still darüber.
    expect(loadAndHydrate).toHaveBeenCalledTimes(1)
    expect(ladeweise('u7')).toBe('still')
  })

  it('… ohne Momentaufnahme bleibt dann das Startbild — eine Fehlerseite wäre verfrüht, das Laden läuft ja noch', async () => {
    vi.useFakeTimers()
    abgelegt.wert = KONTO
    giltNoch()
    datenHaengen()
    const { result } = starte()
    await vergehen(4000)
    expect(momentaufnahmeZeigen).toHaveBeenCalledWith(expect.anything(), 'u7', { langsam: true })
    expect(letztenStandZeigen).not.toHaveBeenCalled()
    expect(result.current.state.dataStatus).toBe('loading')
  })

  it('sind die Daten vor dem Wecker da, greift er nicht vor — auch wenn noch still nachgeladen wird', async () => {
    // Ging beim Laden etwas hinaus, lädt es danach still ein zweites Mal
    // (`hydrate.ts`); das Laden läuft dann noch, die Daten stehen aber schon.
    vi.useFakeTimers()
    abgelegt.wert = KONTO
    giltNoch()
    loadAndHydrate.mockImplementation((dispatch, userId) => {
      dispatch({ type: 'setDataStatus', status: 'loading' })
      dispatch({ type: 'hydrate', payload: { ...geladen, userId } })
      return new Promise(() => {})
    })
    starte()
    await vergehen(10_000)
    expect(momentaufnahmeZeigen).not.toHaveBeenCalled()
    expect(letztenStandZeigen).not.toHaveBeenCalled()
  })

  it('scheitert der Link am Netz und gilt das Token noch, steht offline der letzte Stand — keine leere App', async () => {
    // Mit einem Link greift nichts vor; die Sitzung, die da war, kommt erst
    // mit der Prüfung. Ihre Daten zu laden wäre offline vergeblich.
    window.history.replaceState(null, '', `/#anmelden=${'T'.repeat(43)}`)
    anmeldeAdresseVergessen()
    mitLinkAnmelden.mockResolvedValueOnce('netz')
    abgelegt.wert = KONTO
    offline()
    giltNoch()
    const { result } = starte()
    await abwarten()
    expect(letztenStandZeigen).toHaveBeenCalledWith(expect.anything(), 'u7')
    expect(result.current.state).toMatchObject({ screen: 'start', sitzungPruefen: false, userId: 'u7' })
    expect(result.current.state.staleAt).not.toBeNull()
    expect(loadAndHydrate).not.toHaveBeenCalled()
  })

  it('lädt ein anderes Konto als das abgelegte, zeigt der Wecker dessen Stand nicht', async () => {
    // Die abgelegte Sitzung galt auth-js nicht mehr, und jemand meldet sich an.
    vi.useFakeTimers()
    abgelegt.wert = KONTO
    datenHaengen()
    const { result } = starte()
    await vergehen(0)
    expect(result.current.state).toMatchObject({ screen: 'login', sitzungPruefen: false })
    await act(async () => {
      authListener.fn?.('SIGNED_IN', { user: { id: 'u9' } })
    })
    await vergehen(4000)
    expect(result.current.state.dataStatus).toBe('loading')
    expect(momentaufnahmeZeigen).not.toHaveBeenCalled()
    expect(letztenStandZeigen).not.toHaveBeenCalled()
  })

  it('mit dem Link aus der E-Mail greift nichts vor — angemeldet wird, wen der Link nennt', async () => {
    vi.useFakeTimers()
    window.history.replaceState(null, '', `/#anmelden=${'T'.repeat(43)}`)
    anmeldeAdresseVergessen()
    mitLinkAnmelden.mockReturnValueOnce(new Promise(() => {}))
    abgelegt.wert = KONTO
    offline()
    const { result } = starte()
    await vergehen(10_000)
    expect(letztenStandZeigen).not.toHaveBeenCalled()
    expect(result.current.state.sitzungPruefen).toBe(true)
  })

  it('nach dem Vorgriff greift nichts noch einmal vor — die Ansicht bleibt, wo sie ist', async () => {
    // Der Wecker greift nach vier Sekunden vor; 25 s später meldet Supabase
    // den Netzfehler. Ein zweiter Vorgriff spränge zurück auf den Start und
    // legte das Blatt beim Öffnen noch einmal vor.
    vi.useFakeTimers()
    abgelegt.wert = KONTO
    let antworten: (a: Antwort) => void = () => {}
    getSession.mockReturnValue(new Promise((res) => { antworten = res }))
    const { result } = starte()
    await vergehen(4000)
    await act(async () => {
      result.current.dispatch({ type: 'navigate', screen: 'programm' })
    })
    antworten({ data: { session: null }, error: new AuthRetryableFetchError('Failed to fetch', 0) })
    await vergehen(1)
    expect(letztenStandZeigen).toHaveBeenCalledTimes(1)
    expect(result.current.state.screen).toBe('programm')
  })

  it('zeigte der Wecker den Stand als „langsam" und scheitert danach die Prüfung am Netz, heißt er wieder „Offline"', async () => {
    // Es kommt nichts mehr — „Verbindung langsam" verspräche ein Warten, das
    // nichts bringt (19.10.2026).
    vi.useFakeTimers()
    abgelegt.wert = KONTO
    let antworten: (a: Antwort) => void = () => {}
    getSession.mockReturnValue(new Promise((res) => { antworten = res }))
    const { result } = starte()
    await vergehen(4000)
    expect(result.current.state.staleLangsam).toBe(true)
    antworten({ data: { session: null }, error: new AuthRetryableFetchError('Failed to fetch', 0) })
    await vergehen(1)
    expect(result.current.state.staleLangsam).toBe(false)
    expect(result.current.state.staleAt).not.toBeNull()
    expect(result.current.state.toast?.text).toBe(DE.stFehler)
    expect(letztenStandZeigen).toHaveBeenCalledTimes(1)
  })

  it('scheitert der Link am Netz, bleibt es bei der Sitzung, die da war — mit ihrem letzten Stand', async () => {
    window.history.replaceState(null, '', `/#anmelden=${'T'.repeat(43)}`)
    anmeldeAdresseVergessen()
    mitLinkAnmelden.mockResolvedValueOnce('netz')
    abgelegt.wert = KONTO
    getSession.mockResolvedValue({ data: { session: null }, error: new AuthRetryableFetchError('Failed to fetch', 0) })
    const { result } = starte()
    await abwarten()
    expect(letztenStandZeigen).toHaveBeenCalledWith(expect.anything(), 'u7', { langsam: false })
    expect(result.current.state).toMatchObject({ screen: 'start', sitzungPruefen: false })
  })

  it('steht der letzte Stand eines anderen Kontos, lädt dessen Anmeldung sichtbar — nicht still darüber', async () => {
    // Das Netz ist zurück, und ein anderer Tab meldet B an, während hier noch
    // der Stand von u7 steht.
    abgelegt.wert = KONTO
    offline()
    haengt()
    starte()
    await abwarten()
    online()
    await act(async () => {
      authListener.fn?.('SIGNED_IN', { user: { id: 'u9' } })
    })
    expect(ladeweise('u9')).toBe('sichtbar')
  })

  it('offline zeigt auch eine Anmeldung von anderswo nur den letzten Stand — und lädt mit dem Netz dieses Konto', async () => {
    // auth-js meldet ein Konto aus dem Speicher auch ohne Netz, etwa wenn ein
    // anderer Tab es angemeldet hat. Geladen wird dann dieses, nicht u7.
    abgelegt.wert = KONTO
    offline()
    haengt()
    const { result } = starte()
    await abwarten()
    await act(async () => {
      authListener.fn?.('SIGNED_IN', { user: { id: 'u9' } })
    })
    expect(letztenStandZeigen).toHaveBeenLastCalledWith(expect.anything(), 'u9')
    expect(result.current.state.userId).toBe('u9')
    expect(loadAndHydrate).not.toHaveBeenCalled()
    await wiederOnline()
    expect(ladeweise('u9')).toBe('still')
    expect(ladeweise('u7')).toBe('gar nicht')
  })

  it('scheitert die Erneuerung am Netz, bevor der Wecker klingelt, steht der letzte Stand ebenso — als „Offline"', async () => {
    abgelegt.wert = KONTO
    getSession.mockResolvedValue({ data: { session: null }, error: new AuthRetryableFetchError('Failed to fetch', 0) })
    const { result } = starte()
    await abwarten()
    expect(letztenStandZeigen).toHaveBeenCalledWith(expect.anything(), 'u7', { langsam: false })
    expect(result.current.state).toMatchObject({ screen: 'start', sitzungPruefen: false, staleLangsam: false })
  })

  it('ist die Sitzung wirklich weg (Token ungültig), kommt die Anmeldung — und der Wecker greift nicht mehr vor', async () => {
    vi.useFakeTimers()
    abgelegt.wert = KONTO
    // auth-js hat sie entfernt (SIGNED_OUT) und antwortet ohne Sitzung und ohne Fehler.
    getSession.mockResolvedValue({ data: { session: null }, error: null })
    const { result } = starte()
    await vergehen(10_000)
    expect(result.current.state).toMatchObject({ screen: 'login', sitzungPruefen: false })
    expect(letztenStandZeigen).not.toHaveBeenCalled()
    expect(momentaufnahmeZeigen).not.toHaveBeenCalled()
  })

  it('meldet Supabase später SIGNED_OUT, geht es vom letzten Stand zur Anmeldung', async () => {
    abgelegt.wert = KONTO
    offline()
    haengt()
    const { result } = starte()
    await abwarten()
    await act(async () => {
      authListener.fn?.('SIGNED_OUT', null)
    })
    expect(result.current.state).toMatchObject({ screen: 'login', staleAt: null, userId: null })
  })

  it('kommt die Erneuerung durch, ersetzen die Daten den letzten Stand — still, ohne „Lädt …"', async () => {
    abgelegt.wert = KONTO
    offline()
    haengt()
    starte()
    await abwarten()
    // Sie ging übers Netz; das Gerät meldet es hier nicht eigens (`online`).
    online()
    await act(async () => {
      authListener.fn?.('TOKEN_REFRESHED', { user: { id: 'u7' } })
    })
    expect(ladeweise('u7')).toBe('still')
  })

  it('… auch wenn das Gerät noch „offline" meldet — die Erneuerung ging ja übers Netz', async () => {
    // Meldet das Gerät fälschlich „offline", lädt der Start nicht, und „Neu
    // laden" beginnt wieder beim letzten Stand. Erst die Erneuerung kurz vor
    // dem Ablauf des Tokens beweist das Netz.
    abgelegt.wert = KONTO
    offline()
    giltNoch()
    starte()
    await abwarten()
    expect(loadAndHydrate).not.toHaveBeenCalled()
    await act(async () => {
      authListener.fn?.('TOKEN_REFRESHED', { user: { id: 'u7' } })
    })
    expect(ladeweise('u7')).toBe('still')
  })

  it('antwortet Supabase doch noch mit der Sitzung, bleibt die Ansicht, wo sie ist', async () => {
    abgelegt.wert = KONTO
    offline()
    let antworten: (a: Antwort) => void = () => {}
    getSession.mockReturnValue(new Promise((res) => { antworten = res }))
    const { result } = starte()
    await abwarten()
    // Inzwischen schlägt jemand das Programm auf, und das Netz kommt zurück.
    await act(async () => {
      result.current.dispatch({ type: 'navigate', screen: 'programm' })
    })
    online()
    antworten({ data: { session: { user: { id: 'u7' } } } })
    await abwarten()
    expect(result.current.state.screen).toBe('programm')
    expect(ladeweise('u7')).toBe('still')
  })

  it('ohne Momentaufnahme steht die Fehlerseite — die Erneuerung lädt dann sichtbar', async () => {
    letztenStandZeigen.mockImplementation((dispatch, userId) => dispatch({ type: 'setDataStatus', status: 'error', userId }))
    abgelegt.wert = KONTO
    offline()
    haengt()
    const { result } = starte()
    await abwarten()
    expect(result.current.state).toMatchObject({ screen: 'start', dataStatus: 'error', userId: 'u7' })
    online()
    await act(async () => {
      authListener.fn?.('TOKEN_REFRESHED', { user: { id: 'u7' } })
    })
    expect(ladeweise('u7')).toBe('sichtbar')
  })

  it('stand der letzte Stand nach einem gescheiterten Laden, holt die nächste Erneuerung die Daten', async () => {
    // Die erste Stunde: Supabase antwortet sofort, das Laden scheitert offline,
    // und die Momentaufnahme steht. Die Erneuerung zeigt: Das Netz ist zurück.
    getSession.mockResolvedValue({ data: { session: { user: { id: 'u7' } } } })
    loadAndHydrate.mockImplementationOnce((dispatch) => {
      dispatch({ type: 'hydrate', payload: { ...geladen, userId: 'u7' }, staleAt: Date.now() - 600_000 })
      return Promise.resolve()
    })
    starte()
    await abwarten()
    expect(loadAndHydrate).toHaveBeenCalledTimes(1)
    await act(async () => {
      authListener.fn?.('TOKEN_REFRESHED', { user: { id: 'u7' } })
    })
    expect(loadAndHydrate).toHaveBeenCalledTimes(2)
    expect(ladeweise('u7')).toBe('still')
  })

  it('im Alltag lädt eine Erneuerung nichts nach — die Daten sind ja da', async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: 'u7' } } } })
    starte()
    await abwarten()
    loadAndHydrate.mockClear()
    await act(async () => {
      authListener.fn?.('TOKEN_REFRESHED', { user: { id: 'u7' } })
    })
    expect(loadAndHydrate).not.toHaveBeenCalled()
  })
})

describe('Gerätevorlieben stehen auf <html> — dort liest das CSS sie', () => {
  it('die Darstellung landet als Palette auf <html> und als Wahl im Speicher', async () => {
    const { result } = starte()
    await act(async () => {
      result.current.dispatch({ type: 'setTheme', theme: 'dunkel' })
    })
    expect(document.documentElement.dataset.theme).toBe('dunkel')
    expect(localStorage.getItem('theme')).toBe('dunkel')
    await act(async () => {
      result.current.dispatch({ type: 'setTheme', theme: 'hell' })
    })
    expect(document.documentElement.dataset.theme).toBe('hell')
  })

  it('„Automatisch" bleibt als Wahl gespeichert — auf <html> steht die Palette', async () => {
    // Wie das Gerät gerade steht und umschaltet, prüft darstellung.test.ts;
    // jsdom kennt kein matchMedia, ohne Gerät gilt Hell.
    const { result } = starte()
    await act(async () => {
      result.current.dispatch({ type: 'setTheme', theme: 'auto' })
    })
    expect(localStorage.getItem('theme')).toBe('auto')
    expect(document.documentElement.dataset.theme).toBe('hell')
  })

  it('die Statusleiste der installierten App folgt der Palette', async () => {
    const meta = document.createElement('meta')
    meta.name = 'theme-color'
    document.head.append(meta)
    document.documentElement.style.setProperty('--grund', '#123456')
    const { result } = starte()
    await act(async () => {
      result.current.dispatch({ type: 'setTheme', theme: 'dunkel' })
    })
    expect(meta.content).toBe('#123456')
    meta.remove()
    document.documentElement.style.removeProperty('--grund')
  })

  it('die Schriftgröße wird als CSS-Variable gesetzt und gemerkt', async () => {
    const { result } = starte()
    await act(async () => {
      result.current.dispatch({ type: 'setFontScale', scale: 1.15 })
    })
    expect(document.documentElement.style.getPropertyValue('--fs')).toBe('1.15')
    expect(localStorage.getItem('fontScale')).toBe('1.15')
  })

  it('die Sprache setzt lang und Leserichtung', async () => {
    const { result } = starte()
    await act(async () => {
      result.current.dispatch({ type: 'setLang', lang: 'en' })
    })
    expect(document.documentElement.lang).toBe('en')
    expect(document.documentElement.dir).toBe('ltr')
    expect(localStorage.getItem('lang')).toBe('en')
  })

  it('Arabisch wird von rechts nach links gelesen', async () => {
    const { result } = starte()
    await act(async () => {
      result.current.dispatch({ type: 'setLang', lang: 'ar' })
    })
    expect(document.documentElement.dir).toBe('rtl')
  })

  /**
   * **Alle 34, nicht zwei.**
   *
   * Zwei Sprachen zu messen und auf die übrigen 32 zu schließen ist genau der
   * Schluss, der in diesem Projekt mehrfach danebenging. Hier hängt an ihm
   * mehr als ein Wort: `lang` steuert, wie Screenreader vorlesen und wie der
   * Browser trennt; `dir` dreht das ganze Layout.
   */
  it.each(APP_LANGS.map((l) => l.code))('%s: lang und dir werden gesetzt', async (code) => {
    const { result } = starte()
    await act(async () => {
      result.current.dispatch({ type: 'setLang', lang: code })
    })
    expect(document.documentElement.lang).toBe(code)
    expect(localStorage.getItem('lang')).toBe(code)
    expect(document.documentElement.dir).toBe(isRTL(code) ? 'rtl' : 'ltr')
  })

  it('genau zwei Sprachen drehen das Layout — und die Rückkehr dreht es zurück', async () => {
    // Der Rückweg ist die Hälfte, die man vergisst: Wer von Arabisch auf
    // Deutsch wechselt, muss wieder von links nach rechts lesen. Ein `dir`,
    // das nur gesetzt und nie zurückgenommen wird, fällt beim Umschalten in
    // eine Richtung nicht auf.
    const { result } = starte()
    const rtl: string[] = []
    for (const { code } of APP_LANGS) {
      await act(async () => {
        result.current.dispatch({ type: 'setLang', lang: code })
      })
      if (document.documentElement.dir === 'rtl') rtl.push(code)
    }
    expect(rtl.sort()).toEqual(['ar', 'fa'])
    await act(async () => {
      result.current.dispatch({ type: 'setLang', lang: 'de' })
    })
    expect(document.documentElement.dir).toBe('ltr')
  })

  it('das Sprach-Overlay wird nachgeladen und die Oberfläche danach neu gezeichnet', async () => {
    /*
      Die Overlays liegen als eigene Chunks (Code-Splitting). Bis eines da ist,
      liefert `dict()` den **englischen** Rückfall. Der Nachladeschritt stößt
      deshalb ein zweites `setLang` an — ohne das bliebe die Oberfläche für
      jede der lazy geladenen Sprachen dauerhaft englisch, ohne Fehler und
      ohne dass ein Test es sähe.
    */
    const { result } = starte()
    await act(async () => {
      result.current.dispatch({ type: 'setLang', lang: 'uk' })
    })
    // Der Effekt löst den Import aus; abwarten, bis er durch ist.
    await act(async () => {
      await loadOverlay('uk')
    })
    expect(dict('uk').navProfil).not.toBe(dict('en').navProfil)
    expect(dict('uk').navProfil).not.toBe(dict('de').navProfil)
  })
})

describe('Der Toast blendet sich selbst aus', () => {
  it('nach 2,4 Sekunden', async () => {
    vi.useFakeTimers()
    const { result } = starte()
    await act(async () => {
      result.current.dispatch({ type: 'showToast', text: 'Zugeteilt' })
    })
    expect(result.current.state.toast).not.toBeNull()
    await act(async () => {
      vi.advanceTimersByTime(2400)
    })
    expect(result.current.state.toast).toBeNull()
  })

  it('vorher nicht — sonst liest ihn niemand', async () => {
    vi.useFakeTimers()
    const { result } = starte()
    await act(async () => {
      result.current.dispatch({ type: 'showToast', text: 'Zugeteilt' })
    })
    await act(async () => {
      vi.advanceTimersByTime(2000)
    })
    expect(result.current.state.toast).not.toBeNull()
  })
})

describe('Die drei Kontexte liegen an', () => {
  it('Versand, Speicher und Zustand — alle drei erreichbar', () => {
    const { result } = starte()
    expect(typeof result.current.dispatch).toBe('function')
    expect(result.current.state).toBeTruthy()
  })

  it('die Kinder werden gerendert', () => {
    const { container } = render(<AppProvider><p className="kind">da</p></AppProvider>)
    expect(container.querySelector('.kind')?.textContent).toBe('da')
  })
})
