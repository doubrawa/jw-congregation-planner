/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
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
 *   `SIGNED_OUT` wirft zurück, der Mail-Link führt in die Passwort-Ansicht.
 * - **Gerätevorlieben auf `<html>`**: Theme, Schriftgröße, Sprache und
 *   Schreibrichtung. Sie stehen dort, weil das CSS sie liest — nicht als
 *   Zierde.
 *
 * Der Sitzungs-Teil braucht **keine** echte Instanz: geprüft wird die Seite
 * der App an diesem Vertrag, nicht die von Supabase.
 */

const authListener = { fn: null as ((e: string, s: unknown) => void) | null }
const unsubscribe = vi.fn()
const getSession = vi.fn(() =>
  Promise.resolve<{ data: { session: { user: { id: string } } | null } }>({ data: { session: null } }),
)
const supabaseStub = {
  auth: {
    getSession: () => getSession(),
    onAuthStateChange: (fn: (e: string, s: unknown) => void) => {
      authListener.fn = fn
      return { data: { subscription: { unsubscribe } } }
    },
  },
}
const loadAndHydrate = vi.fn(() => Promise.resolve())
const konfiguriert = { wert: true }

vi.mock('../lib/supabase', () => ({
  get supabase() {
    return konfiguriert.wert ? supabaseStub : null
  },
  get isSupabaseConfigured() {
    return konfiguriert.wert
  },
  performLogout: vi.fn(),
}))
vi.mock('./hydrate', () => ({ loadAndHydrate: (...a: unknown[]) => loadAndHydrate(...(a as [])) }))
vi.mock('../lib/snapshot', () => ({
  saveSnapshot: vi.fn(), readSnapshot: vi.fn(() => null), clearSnapshot: vi.fn(),
}))
vi.mock('./persist', () => ({ persist: vi.fn() }))

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
const { useApp } = await import('./context')

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

beforeEach(() => {
  konfiguriert.wert = true
  authListener.fn = null
  melder.schreibfehler = null
  melder.konflikt = null
  unsubscribe.mockClear()
  loadAndHydrate.mockClear().mockResolvedValue(undefined)
  getSession.mockClear().mockResolvedValue({ data: { session: null } })
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
  document.documentElement.removeAttribute('data-dark')
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

describe('Die Supabase-Sitzung wird gespiegelt', () => {
  it('eine bestehende Sitzung überspringt den Login und lädt die Daten', async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: 'u7' } } } })
    const { result } = starte()
    await act(async () => {
      await Promise.resolve()
    })
    expect(result.current.state.screen).not.toBe('login')
    expect(loadAndHydrate).toHaveBeenCalledWith(expect.anything(), 'u7')
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
    expect(loadAndHydrate).toHaveBeenCalledWith(expect.anything(), 'u9')
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

  it('der Mail-Link führt in die Passwort-Ansicht', async () => {
    const { result } = starte()
    await act(async () => {
      await Promise.resolve()
    })
    await act(async () => {
      authListener.fn?.('PASSWORD_RECOVERY', null)
    })
    expect(result.current.state.recovery).toBe(true)
  })

  it('beim Abbauen wird das Abo gekündigt', async () => {
    const { unmount } = starte()
    await act(async () => {
      await Promise.resolve()
    })
    unmount()
    expect(unsubscribe).toHaveBeenCalled()
  })

  it('ohne Supabase wird gar nicht erst gefragt (Demo-Modus)', async () => {
    konfiguriert.wert = false
    starte()
    await act(async () => {
      await Promise.resolve()
    })
    expect(getSession).not.toHaveBeenCalled()
  })
})

describe('Gerätevorlieben stehen auf <html> — dort liest das CSS sie', () => {
  it('das Farbschema landet als Attribut und im Speicher', async () => {
    const { result } = starte()
    await act(async () => {
      result.current.dispatch({ type: 'setTheme', theme: 'blatt' })
    })
    expect(document.documentElement.dataset.theme).toBe('blatt')
    expect(localStorage.getItem('theme')).toBe('blatt')
  })

  it('eine dunkle Palette bekommt zusätzlich die Dunkel-Marke', async () => {
    const { result } = starte()
    await act(async () => {
      result.current.dispatch({ type: 'setTheme', theme: 'graphit' })
    })
    expect(document.documentElement.dataset.dark).toBe('1')
  })

  it('und beim Wechsel zurück verschwindet sie wieder', async () => {
    const { result } = starte()
    await act(async () => {
      result.current.dispatch({ type: 'setTheme', theme: 'graphit' })
    })
    await act(async () => {
      result.current.dispatch({ type: 'setTheme', theme: 'weiss' })
    })
    expect(document.documentElement.dataset.dark).toBeUndefined()
  })

  it('die Statusleiste der installierten App folgt dem Theme', async () => {
    const meta = document.createElement('meta')
    meta.name = 'theme-color'
    document.head.append(meta)
    document.documentElement.style.setProperty('--bg', '#123456')
    const { result } = starte()
    await act(async () => {
      result.current.dispatch({ type: 'setTheme', theme: 'graphit' })
    })
    expect(meta.content).toBe('#123456')
    meta.remove()
    document.documentElement.style.removeProperty('--bg')
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

  it('genau vier Sprachen drehen das Layout — und die Rückkehr dreht es zurück', async () => {
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
    expect(rtl.sort()).toEqual(['ar', 'fa', 'he', 'ur'])
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
      jede der ~30 lazy geladenen Sprachen dauerhaft englisch, ohne Fehler und
      ohne dass ein Test es sähe.
    */
    const { result } = starte()
    await act(async () => {
      result.current.dispatch({ type: 'setLang', lang: 'ko' })
    })
    // Der Effekt löst den Import aus; abwarten, bis er durch ist.
    await act(async () => {
      await loadOverlay('ko')
    })
    expect(dict('ko').navProfil).not.toBe(dict('en').navProfil)
    expect(dict('ko').navProfil).not.toBe(dict('de').navProfil)
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
