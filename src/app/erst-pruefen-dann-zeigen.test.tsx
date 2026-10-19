/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import type { AppAction } from './context'
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
 * Jetzt steht bis zur Antwort nur das Ladebild da, danach die Anmeldung oder
 * die App — nie beides nacheinander. Gezeichnet wird die ganze App, Provider
 * und Gerüst; Supabase ist eine Attrappe, deren Antwort der Test zurückhält,
 * bis er sie gibt.
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
// Laden wie im Betrieb: erst „Lädt …", die Daten kommen in diesem Test nie an.
vi.mock('./hydrate', () => ({
  loadAndHydrate: (dispatch: (a: AppAction) => void) => {
    dispatch({ type: 'setDataStatus', status: 'loading' })
    return new Promise(() => {})
  },
}))

const { default: App } = await import('../App')

// jsdom kennt `matchMedia` nicht; die Anmeldung fragt danach, ob sie am Desktop steht.
window.matchMedia = vi.fn().mockReturnValue({
  matches: false,
  addEventListener() {},
  removeEventListener() {},
}) as unknown as typeof window.matchMedia

beforeEach(() => {
  localStorage.clear()
  window.history.replaceState(null, '', '/')
})
afterEach(cleanup)

/**
 * Die App zeichnen und mitschreiben, ob die Anmeldung je ins Fenster kam —
 * auch nur für einen Zwischenstand, der vor dem nächsten Blick schon wieder
 * weg ist. Deshalb über die eingefügten Knoten, nicht über den Stand danach.
 */
function zeichne() {
  const container = document.body.appendChild(document.createElement('div'))
  let anmeldungGesehen = false
  const notieren = (eintraege: MutationRecord[]): void => {
    for (const eintrag of eintraege) {
      for (const knoten of eintrag.addedNodes) {
        if (knoten instanceof Element && (knoten.matches('.login') || knoten.querySelector('.login'))) {
          anmeldungGesehen = true
        }
      }
    }
  }
  const beobachter = new MutationObserver(notieren)
  beobachter.observe(container, { childList: true, subtree: true })
  render(<App />, { container })
  return {
    container,
    anmeldungGesehen: (): boolean => {
      // Was der Beobachter noch nicht gemeldet hat, zuerst abholen.
      notieren(beobachter.takeRecords())
      return anmeldungGesehen
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
  it('solange Supabase die Sitzung prüft, steht nur das Ladebild da — weder Anmeldung noch App', () => {
    const { container, anmeldungGesehen } = zeichne()
    expect(container.querySelector('.ladebild')?.textContent).toBe(DE.laedt)
    expect(anmeldungGesehen()).toBe(false)
    expect(container.querySelector('.leiste'), 'das Menü der App').toBeNull()
  })

  it('wer angemeldet ist, sieht danach die App — die Anmeldung erscheint nie, auch nicht kurz', async () => {
    const { container, anmeldungGesehen } = zeichne()
    await antworte({ user: { id: 'u7' } })
    expect(container.querySelector('.ladebild')).toBeNull()
    expect(container.querySelector('.leiste'), 'das Menü der App').not.toBeNull()
    // Die Daten laden noch — das sagt jetzt die App selbst.
    expect(container.querySelector('.status-loading')?.textContent).toBe(DE.laedt)
    expect(anmeldungGesehen()).toBe(false)
  })

  it('wer nicht angemeldet ist, sieht danach die Anmeldung — und nichts von der App', async () => {
    const { container, anmeldungGesehen } = zeichne()
    await antworte(null)
    expect(container.querySelector('.ladebild')).toBeNull()
    expect(anmeldungGesehen()).toBe(true)
    expect(container.querySelector('.login')).not.toBeNull()
    expect(container.querySelector('.leiste'), 'das Menü der App').toBeNull()
  })

  it('scheitert die Prüfung, bleibt das Ladebild nicht stehen — die Anmeldung kommt', async () => {
    // Sonst käme man nicht einmal mehr zur Anmeldung: ein Ladebild ohne Ende.
    const konsole = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { container } = zeichne()
    await antworte(new Error('Speicher gesperrt'))
    expect(container.querySelector('.ladebild')).toBeNull()
    expect(container.querySelector('.login')).not.toBeNull()
    expect(konsole).toHaveBeenCalledWith('[sitzung]', expect.any(Error))
    konsole.mockRestore()
  })
})
