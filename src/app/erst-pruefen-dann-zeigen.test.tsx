/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import type { AppAction, HydratePayload } from './context'
import { STANDARD_ZEITEN } from '../data/vorgaben'
import { DE } from '../i18n/de'

/**
 * **Beim Öffnen blitzt die Anmeldung nicht auf** (19.10.2026).
 *
 * Wer angemeldet war und die App öffnete, sah bis dahin eine Sekunde lang die
 * Anmeldung, und erst dann sich selbst. Supabase gibt die gespeicherte Sitzung
 * erst heraus, wenn das Token frisch ist; liegt die letzte Nutzung über eine
 * Stunde zurück, geht dafür eine Anfrage übers Netz. So lange zeigte die App,
 * womit sie startet: die Anmeldung.
 *
 * Jetzt steht bis zur Antwort das Startbild da — und weiter, bis die Daten
 * kommen (Entwurf „B · Welle durch die Reihen"). Danach die Anmeldung oder die
 * App, nie beides nacheinander und nie eine App ohne Inhalt. Gezeichnet wird
 * die ganze App, Provider und Gerüst; Supabase ist eine Attrappe, deren Antwort
 * der Test zurückhält, bis er sie gibt, ebenso die Daten.
 */

type Sitzung = { user: { id: string } } | null

const attrappe = vi.hoisted(() => {
  const offen = {
    antworten: (_sitzung: Sitzung): void => {},
    scheitern: (_fehler: Error): void => {},
  }
  const client = {
    auth: {
      getSession: () =>
        new Promise((antworten, scheitern) => {
          offen.antworten = (session) => antworten({ data: { session } })
          offen.scheitern = scheitern
        }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
  }
  return { offen, client }
})

vi.mock('../lib/supabase', () => ({ supabase: attrappe.client, isSupabaseConfigured: true }))
// Laden wie im Betrieb: erst der Ladezustand, dann die Daten — wann, sagt der
// Test (`datenKommen`). Der letzte Stand ist die Momentaufnahme einer kleinen
// Versammlung, nur lesend.
const laden = vi.hoisted(() => ({ dispatch: null as ((a: AppAction) => void) | null, userId: '' }))
vi.mock('./hydrate', () => ({
  loadAndHydrate: (dispatch: (a: AppAction) => void, userId: string) => {
    laden.dispatch = dispatch
    laden.userId = userId
    dispatch({ type: 'setDataStatus', status: 'loading' })
    return new Promise(() => {})
  },
  letztenStandZeigen: (dispatch: (a: AppAction) => void, userId: string) =>
    dispatch({ type: 'hydrate', payload: momentaufnahme(userId), staleAt: Date.now() - 7_200_000 }),
}))
/** Was auth-js auf dem Gerät abgelegt hat (echt gelesen in `gespeicherte-sitzung.test.ts`). */
const abgelegt = vi.hoisted(() => ({ wert: null as { userId: string; laeuftAb: number } | null }))
vi.mock('../lib/gespeicherte-sitzung', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  gespeicherteSitzung: () => abgelegt.wert,
}))

const { default: App } = await import('../App')

// jsdom kennt `matchMedia` nicht; die Anmeldung fragt danach, ob sie am Desktop steht.
window.matchMedia = vi.fn().mockReturnValue({
  matches: false,
  addEventListener() {},
  removeEventListener() {},
}) as unknown as typeof window.matchMedia

/** Die Momentaufnahme einer kleinen, leeren Versammlung. */
function momentaufnahme(userId: string): HydratePayload {
  return {
    congregationId: 'c1',
    userId,
    empty: false,
    congregation: { name: 'Kalvo', hall: '', times: STANDARD_ZEITEN },
    planner: false,
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
    reminders: { first: 7, last: 1, repeat: false },
    congLang: 'de',
    progLangs: [],
    auxClass: false,
    members: [],
  }
}

beforeEach(() => {
  localStorage.clear()
  window.history.replaceState(null, '', '/')
  abgelegt.wert = null
})
afterEach(() => {
  cleanup()
  Reflect.deleteProperty(navigator, 'onLine')
})

/**
 * Die App zeichnen und mitschreiben, was je ins Fenster kam — auch nur für
 * einen Zwischenstand, der vor dem nächsten Blick schon wieder weg ist: die
 * Anmeldung, und das Menü der App, bevor die Daten da sind (bis zum 19.10.2026
 * die Kopfzeile mit „Lädt …"). Deshalb über die eingefügten Knoten, nicht über
 * den Stand danach.
 */
function zeichne() {
  const container = document.body.appendChild(document.createElement('div'))
  const stand = { datenDa: false, anmeldung: false, menueOhneDaten: false }
  const notieren = (eintraege: MutationRecord[]): void => {
    for (const eintrag of eintraege) {
      for (const knoten of eintrag.addedNodes) {
        if (!(knoten instanceof Element)) continue
        const hat = (sel: string): boolean => knoten.matches(sel) || knoten.querySelector(sel) !== null
        if (hat('.login')) stand.anmeldung = true
        if (hat('.leiste') && !stand.datenDa) stand.menueOhneDaten = true
      }
    }
  }
  const beobachter = new MutationObserver(notieren)
  beobachter.observe(container, { childList: true, subtree: true })
  render(<App />, { container })
  /** Was der Beobachter noch nicht gemeldet hat, zuerst abholen. */
  const abholen = (): void => notieren(beobachter.takeRecords())
  return {
    container,
    anmeldungGesehen: (): boolean => {
      abholen()
      return stand.anmeldung
    },
    menueOhneDatenGesehen: (): boolean => {
      abholen()
      return stand.menueOhneDaten
    },
    /** Die Daten kommen an — wie `loadAndHydrate` sie einspielte. */
    datenKommen: async (): Promise<void> => {
      abholen()
      stand.datenDa = true
      await act(async () => {
        laden.dispatch?.({ type: 'hydrate', payload: momentaufnahme(laden.userId) })
        await new Promise((fertig) => setTimeout(fertig, 0))
      })
    },
  }
}

/** Supabase antworten (oder mit einem Fehler scheitern) lassen und abwarten, bis die App damit durch ist. */
async function antworte(antwort: Sitzung | Error): Promise<void> {
  await act(async () => {
    if (antwort instanceof Error) attrappe.offen.scheitern(antwort)
    else attrappe.offen.antworten(antwort)
    await new Promise((fertig) => setTimeout(fertig, 0))
  })
}

describe('Erst prüfen, dann zeigen', () => {
  it('solange Supabase die Sitzung prüft, steht nur das Startbild da — weder Anmeldung noch App', () => {
    const { container, anmeldungGesehen } = zeichne()
    expect(container.querySelector('.startbild')).not.toBeNull()
    // Vorleseprogramme hören, dass es lädt.
    expect(container.querySelector('.startbild [role="status"], .startbild[role="status"]')?.textContent).toBe(DE.laedt)
    expect(anmeldungGesehen()).toBe(false)
    expect(container.querySelector('.leiste'), 'das Menü der App').toBeNull()
  })

  it('wer angemeldet ist, sieht das Startbild, bis die Daten da sind — dann die App, nie die Anmeldung', async () => {
    const { container, anmeldungGesehen, menueOhneDatenGesehen, datenKommen } = zeichne()
    await antworte({ user: { id: 'u7' } })
    // Die Daten laden noch: kein Menü ohne Inhalt, das Startbild bleibt.
    expect(container.querySelector('.startbild')).not.toBeNull()
    await datenKommen()
    expect(container.querySelector('.startbild')).toBeNull()
    expect(container.querySelector('.leiste'), 'das Menü der App').not.toBeNull()
    expect(anmeldungGesehen()).toBe(false)
    // Auch nicht kurz: bis zum 19.10.2026 stand hier das Menü mit „Lädt …".
    expect(menueOhneDatenGesehen(), 'das Menü, bevor die Daten da waren').toBe(false)
  })

  it('wer nicht angemeldet ist, sieht danach die Anmeldung — und nichts von der App', async () => {
    const { container, anmeldungGesehen } = zeichne()
    await antworte(null)
    expect(container.querySelector('.startbild')).toBeNull()
    expect(anmeldungGesehen()).toBe(true)
    expect(container.querySelector('.login')).not.toBeNull()
    expect(container.querySelector('.leiste'), 'das Menü der App').toBeNull()
  })

  it('scheitert die Prüfung, bleibt das Startbild nicht stehen — die Anmeldung kommt', async () => {
    // Sonst käme man nicht einmal mehr zur Anmeldung: ein Startbild ohne Ende.
    const konsole = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { container } = zeichne()
    await antworte(new Error('Speicher gesperrt'))
    expect(container.querySelector('.startbild')).toBeNull()
    expect(container.querySelector('.login')).not.toBeNull()
    expect(konsole).toHaveBeenCalledWith('[sitzung]', expect.any(Error))
    konsole.mockRestore()
  })

  it('offline nach über einer Stunde: der letzte Stand mit Hinweis — kein Warten, keine Anmeldung', () => {
    // Supabase erneuerte offline 25 s lang das Token und meldete dann keine
    // Sitzung; bis zum 19.10.2026 stand danach die Anmeldung da.
    abgelegt.wert = { userId: 'u7', laeuftAb: Date.now() - 3_600_000 }
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false })
    const { container, anmeldungGesehen } = zeichne()
    expect(container.querySelector('.startbild')).toBeNull()
    expect(container.querySelector('.offline-banner'), 'der Hinweis auf den letzten Stand').not.toBeNull()
    expect(container.querySelector('.leiste'), 'das Menü der App').not.toBeNull()
    expect(anmeldungGesehen()).toBe(false)
  })
})
