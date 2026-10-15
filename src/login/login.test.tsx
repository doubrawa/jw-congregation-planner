/** @vitest-environment jsdom */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import {
  AppDispatchContext,
  AppStateContext,
  AppStoreContext,
  type AppState,
  useStaticStore,
} from '../app/context'
import { demoZustand } from '../../tests/testdaten/demo-start'
import { APP_LANGS } from '../i18n/langs'
import { dict, loadOverlay } from '../i18n/ui'
import { fill } from '../i18n/useT'
import type { AnmeldeFehler, CodeGeprueft, LinkAngefordert } from '../lib/anmelden'
import { KONTAKT_MAIL } from './kontakt'

/**
 * **Der Login — die einzige Tür der App, ohne Kennwort** (T121, Phase 8).
 *
 * Drei Wege hinein: einen Link per E-Mail anfordern, den Zettel scannen, den
 * Code vom Zettel eintippen. Registrieren gibt es nicht — Konten legt der Admin
 * an. Zweierlei Betriebsarten muss die Seite auseinanderhalten:
 *
 * - **Mit Supabase** geht jeder Weg über die Function `anmelden`, und jeder
 *   Fehler kommt in der Sprache des Lesers an.
 * - **Ohne Client** (Entwicklerseite) ist Anmelden nachgestellt — die Maske
 *   sieht trotzdem aus wie im Betrieb (dort entsteht die Handbuch-Aufnahme).
 */

const linkAnfordern = vi.fn((_mail: string, _lang: string) => Promise.resolve<LinkAngefordert>('unterwegs'))
const codePruefen = vi.fn((_code: string) => Promise.resolve<CodeGeprueft>({ ok: true, name: 'Anna Alt', versammlung: 'Musterstadt' }))
const mitCodeAnmelden = vi.fn((_code: string) => Promise.resolve<AnmeldeFehler | null>(null))
const mitLinkAnmelden = vi.fn((_token: string) => Promise.resolve<AnmeldeFehler | null>(null))
const konfiguriert = { wert: true }

vi.mock('../lib/supabase', () => ({
  get isSupabaseConfigured() {
    return konfiguriert.wert
  },
  supabase: null,
  performLogout: vi.fn(),
}))
vi.mock('../lib/anmelden', () => ({
  linkAnfordern: (m: string, l: string) => linkAnfordern(m, l),
  codePruefen: (c: string) => codePruefen(c),
  mitCodeAnmelden: (c: string) => mitCodeAnmelden(c),
  mitLinkAnmelden: (t: string) => mitLinkAnmelden(t),
}))
// Der Scanner braucht eine Kamera — hier steht er für das, was er meldet.
const scanErgebnis = { text: '' }
vi.mock('./ZettelScanner', () => ({
  default: ({ onGefunden }: { onGefunden: (text: string) => void }) => (
    <button type="button" className="test-scan" onClick={() => onGefunden(scanErgebnis.text)}>
      scan
    </button>
  ),
}))

const { LoginScreen } = await import('./LoginScreen')
const { anmeldeAdresseVergessen } = await import('./anmelde-adresse')

const t = dict('de')

function zeige(over: Partial<AppState> = {}) {
  const dispatch = vi.fn()
  const state: AppState = { ...demoZustand(), screen: 'login', ...over }
  function Buehne() {
    const store = useStaticStore(state)
    return (
      <AppDispatchContext.Provider value={dispatch}>
        <AppStoreContext.Provider value={store}>
          <AppStateContext.Provider value={state}>
            <LoginScreen />
          </AppStateContext.Provider>
        </AppStoreContext.Provider>
      </AppDispatchContext.Provider>
    )
  }
  return { dispatch, ...render(<Buehne />) }
}

const knopf = (c: HTMLElement, text: string) => [...c.querySelectorAll('button')].find((b) => b.textContent?.trim() === text)
const mailFeld = (c: HTMLElement) => c.querySelector<HTMLInputElement>('input[type="email"]')!
const codeFeld = (c: HTMLElement) => c.querySelector<HTMLInputElement>('.login-code')!
const absenden = (c: HTMLElement) => fireEvent.submit(c.querySelector('.login-form')!)

beforeEach(() => {
  konfiguriert.wert = true
  linkAnfordern.mockClear().mockResolvedValue('unterwegs')
  codePruefen.mockClear().mockResolvedValue({ ok: true, name: 'Anna Alt', versammlung: 'Musterstadt' })
  mitCodeAnmelden.mockClear().mockResolvedValue(null)
  mitLinkAnmelden.mockClear().mockResolvedValue(null)
  scanErgebnis.text = ''
  window.history.replaceState(null, '', '/')
  anmeldeAdresseVergessen()
  // Eine Kamera „gibt es" — ob sie aufgeht, zeigt erst der Scanner.
  Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia: vi.fn() }, configurable: true })
})
afterEach(cleanup)

describe('Ohne Kennwort', () => {
  it('es gibt kein Passwortfeld und kein Registrieren', () => {
    const { container } = zeige()
    expect(container.querySelector('input[type="password"]')).toBeNull()
    expect(container.textContent).toContain(t.ohnePasswort)
    expect(knopf(container, t.linkSenden)).toBeDefined()
  })
})

describe('Link senden', () => {
  it('fordert den Link für die eingegebene Adresse an — in der Sprache der Seite', async () => {
    const { container } = zeige({ lang: 'en' })
    fireEvent.change(mailFeld(container), { target: { value: '  wer@example.org ' } })
    absenden(container)
    await waitFor(() => expect(linkAnfordern).toHaveBeenCalledWith('wer@example.org', 'en'))
  })

  it('danach steht derselbe Satz da, gleich ob es die Adresse gibt', async () => {
    const { container } = zeige()
    fireEvent.change(mailFeld(container), { target: { value: 'wer@example.org' } })
    absenden(container)
    await waitFor(() => expect(container.querySelector('.login-meldung')?.textContent).toBe(t.linkUnterwegs))
  })

  it('kann die App nicht senden, sagt sie, was stattdessen geht', async () => {
    linkAnfordern.mockResolvedValue('nicht-eingerichtet')
    const { container } = zeige()
    fireEvent.change(mailFeld(container), { target: { value: 'wer@example.org' } })
    absenden(container)
    await waitFor(() => expect(container.querySelector('.login-meldung')?.textContent).toBe(t.mailNichtEingerichtet))
  })

  it('ohne Adresse fragt es zuerst danach — statt die Function leer zu rufen', () => {
    const { container } = zeige()
    absenden(container)
    expect(linkAnfordern).not.toHaveBeenCalled()
    expect(container.querySelector('.login-meldung')?.textContent).toBe(t.resetMailFehlt)
  })

  it('die Adresse steht links-nach-rechts, auch in einer RTL-Oberfläche', () => {
    expect(mailFeld(zeige({ lang: 'ar' }).container).getAttribute('dir')).toBe('ltr')
  })
})

describe('Ohne E-Mail-Adresse', () => {
  const karte = (c: HTMLElement) => c.querySelector<HTMLElement>('.login-ohne-mail')!
  const amDesktop = (ja: boolean) => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: ja }) as unknown as typeof window.matchMedia
  }
  afterEach(() => {
    delete (window as { matchMedia?: unknown }).matchMedia
  })

  it('Zettel scannen und Code eintippen stehen in der Karte — der Hinweis nennt beides', () => {
    const k = karte(zeige().container)
    expect(k.textContent).toContain(t.ohneMailFrage)
    expect(k.textContent).toContain(t.ohneMailHinweis)
    expect(knopf(k, t.zettelScannen)?.className).toBe('knopf-umriss')
    expect(knopf(k, t.codeEintippen)?.className).toBe('knopf-leise')
  })

  it('ohne Kamera-Schnittstelle kein „Zettel scannen" — nur der Code, und der Hinweis sagt es so', () => {
    Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true })
    const k = karte(zeige().container)
    expect(knopf(k, t.zettelScannen)).toBeUndefined()
    expect(k.textContent).toContain(t.ohneMailHinweisTippen)
    expect(k.textContent).not.toContain(t.ohneMailHinweis)
    // Allein ist der Code der Weg — so deutlich wie sonst „Zettel scannen".
    expect(knopf(k, t.codeEintippen)?.className).toBe('knopf-umriss')
  })

  it('am Desktop ebenso: Dort hält man keinen Zettel vor die Kamera', () => {
    amDesktop(true)
    const k = karte(zeige().container)
    expect(knopf(k, t.zettelScannen)).toBeUndefined()
    expect(k.textContent).toContain(t.ohneMailHinweisTippen)
    expect(knopf(k, t.codeEintippen)?.className).toBe('knopf-umriss')
  })

  it('Gegenprobe: am Handy mit derselben Attrappe steht „Zettel scannen" da', () => {
    amDesktop(false)
    expect(knopf(karte(zeige().container), t.zettelScannen)).toBeDefined()
  })
})

describe('Mit Code anmelden', () => {
  const zumCode = () => {
    const r = zeige()
    fireEvent.click(knopf(r.container, t.codeEintippen)!)
    return r
  }

  it('erst vollständig wird gefragt, wem der Code gehört — und es steht da, bevor man anmeldet', async () => {
    const { container } = zumCode()
    fireEvent.change(codeFeld(container), { target: { value: 'k7rd' } })
    expect(codePruefen).not.toHaveBeenCalled()
    fireEvent.change(codeFeld(container), { target: { value: 'k7rd-2qwm' } })
    await waitFor(() => expect(codePruefen).toHaveBeenCalledWith('K7RD2QWM'))
    await waitFor(() => expect(container.querySelector('.login-code-passt')?.textContent).toContain('Anna Alt'))
    expect(container.querySelector('.login-code-passt')?.textContent).toContain(fill(t.congLabel, { name: 'Musterstadt' }))
    expect(mitCodeAnmelden).not.toHaveBeenCalled()
  })

  it('„Anmelden" meldet mit genau diesem Code an', async () => {
    const { container, dispatch } = zumCode()
    fireEvent.change(codeFeld(container), { target: { value: 'K7RD2QWM' } })
    await waitFor(() => expect(container.querySelector('.login-code-passt')).toBeTruthy())
    fireEvent.click(knopf(container, t.anmeldenKnopf)!)
    await waitFor(() => expect(mitCodeAnmelden).toHaveBeenCalledWith('K7RD2QWM'))
    await waitFor(() => expect(dispatch).toHaveBeenCalledWith({ type: 'login', welcome: true }))
  })

  it('vor dem Prüfen meldet „Anmelden" nicht an', () => {
    const { container } = zumCode()
    fireEvent.click(knopf(container, t.anmeldenKnopf)!)
    expect(mitCodeAnmelden).not.toHaveBeenCalled()
  })

  it.each([
    ['ungueltig', 'codeUnbekannt'],
    ['abgelaufen', 'codeAbgelaufen'],
    ['zu-viele', 'zuVieleVersuche'],
    ['netz', 'anmeldenFehler'],
  ] as const)('„%s" steht als Satz da', async (fehler, key) => {
    codePruefen.mockResolvedValue({ ok: false, fehler })
    const { container } = zumCode()
    fireEvent.change(codeFeld(container), { target: { value: 'K7RD2QWM' } })
    await waitFor(() => expect(container.querySelector('.feld-fehler')?.textContent).toBe(t[key]))
  })

  it('ein Code aus der Adresse (QR-Code mit der Handy-Kamera) steht gleich im Feld — angemeldet wird erst auf den Knopf', async () => {
    window.history.replaceState(null, '', '/#code=K7RD2QWM')
    const { container } = zeige()
    expect(codeFeld(container).value).toBe('K7RD-2QWM')
    await waitFor(() => expect(codePruefen).toHaveBeenCalledWith('K7RD2QWM'))
    expect(mitCodeAnmelden).not.toHaveBeenCalled()
    // … und aus der Adresse ist er heraus: Ein Neuladen fragt nicht noch einmal.
    expect(window.location.hash).toBe('')
  })

  it('angemeldet ist der Code verbraucht: Wer sich danach abmeldet, sieht wieder die Anmeldung', async () => {
    window.history.replaceState(null, '', '/#code=K7RD2QWM')
    const erst = zeige()
    await waitFor(() => expect(erst.container.querySelector('.login-code-passt')).toBeTruthy())
    fireEvent.click(knopf(erst.container, t.anmeldenKnopf)!)
    await waitFor(() => expect(erst.dispatch).toHaveBeenCalledWith({ type: 'login', welcome: true }))
    erst.unmount()
    const danach = zeige().container
    expect(danach.querySelector('.login-code')).toBeNull()
    expect(mailFeld(danach)).toBeTruthy()
  })

  it('ebenso nach „Zurück"', () => {
    window.history.replaceState(null, '', '/#code=K7RD2QWM')
    const erst = zeige()
    fireEvent.click(knopf(erst.container, t.a11yZurueck)!)
    erst.unmount()
    expect(zeige().container.querySelector('.login-code')).toBeNull()
  })

  it('„Zurück" führt zur Anmeldung', () => {
    const { container } = zumCode()
    fireEvent.click(knopf(container, t.a11yZurueck)!)
    expect(mailFeld(container)).toBeTruthy()
  })
})

describe('Zettel scannen', () => {
  const scannen = async (text: string) => {
    const r = zeige()
    fireEvent.click(knopf(r.container, t.zettelScannen)!)
    scanErgebnis.text = text
    await waitFor(() => expect(r.container.querySelector('.test-scan')).toBeTruthy())
    await act(async () => {
      fireEvent.click(r.container.querySelector('.test-scan')!)
    })
    return r
  }

  it('auch beim Scannen hat die Seite ihre Überschrift — genau eine', async () => {
    const r = zeige()
    fireEvent.click(knopf(r.container, t.zettelScannen)!)
    await waitFor(() => expect(r.container.querySelector('.test-scan')).toBeTruthy())
    expect([...r.container.querySelectorAll('h1')].map((h) => h.textContent)).toEqual([t.zettelScannen])
  })

  it('der QR-Code des Zettels füllt den Code — angemeldet wird erst auf den Knopf', async () => {
    const { container } = await scannen('https://versammlung.app/#code=K7RD2QWM')
    expect(codeFeld(container).value).toBe('K7RD-2QWM')
    expect(mitCodeAnmelden).not.toHaveBeenCalled()
  })

  it('ein Link aus einer E-Mail meldet gleich an', async () => {
    const token = 'T'.repeat(43)
    const { dispatch } = await scannen(`https://versammlung.app/#anmelden=${token}`)
    await waitFor(() => expect(mitLinkAnmelden).toHaveBeenCalledWith(token))
    await waitFor(() => expect(dispatch).toHaveBeenCalledWith({ type: 'login', welcome: true }))
  })

  it('ein fremder QR-Code öffnet nichts und sagt es', async () => {
    const { dispatch } = await scannen('https://fremd.example/irgendwas')
    expect(mitLinkAnmelden).not.toHaveBeenCalled()
    expect(dispatch).toHaveBeenCalledWith({ type: 'showToast', text: t.scanFremd })
  })
})

describe('Ohne Datenbank: Anmeldung nachgestellt', () => {
  beforeEach(() => {
    konfiguriert.wert = false
  })

  it('sagt es unten deutlich', () => {
    expect(zeige().container.querySelector('.login-note')?.textContent).toBe(t.anmeldungOhneDb)
  })

  it('„Link senden" meldet gleich an, ohne Netzaufruf', () => {
    const { container, dispatch } = zeige()
    fireEvent.change(mailFeld(container), { target: { value: 'wer@example.org' } })
    absenden(container)
    expect(linkAnfordern).not.toHaveBeenCalled()
    expect(dispatch).toHaveBeenCalledWith({ type: 'login', welcome: true })
  })

  it('mit Supabase steht dort dagegen der Hinweis auf die Mitgliedschaft', () => {
    konfiguriert.wert = true
    expect(zeige().container.querySelector('.login-note')?.textContent).toBe(t.nurMitglieder)
  })
})

describe('Die Sprache lässt sich schon vor dem Anmelden wählen', () => {
  it('die Auswahl steht da und trägt die aktuelle Sprache', () => {
    const { container } = zeige({ lang: 'de' })
    const wahl = container.querySelector<HTMLSelectElement>('.login-lang-select')!
    expect(wahl.value).toBe('de')
    expect(wahl.querySelectorAll('option').length).toBe(APP_LANGS.length)
  })

  it('ein Wechsel schlägt sofort durch — man muss sich nicht erst anmelden', () => {
    const { container, dispatch } = zeige()
    fireEvent.change(container.querySelector('.login-lang-select')!, { target: { value: 'en' } })
    expect(dispatch).toHaveBeenCalledWith({ type: 'setLang', lang: 'en' })
  })
})

/*
 * **Wofür die App da ist — und an wen man sich für eine neue Versammlung
 * wendet (T113).** Wer ohne Link hierher kommt, kennt die App nicht: Er soll
 * lesen können, was sie tut, und eine Adresse finden, unter der er seine
 * Versammlung anfragen kann. Beides in seiner Sprache. Was der Betreff in allen
 * Sprachen aushalten muss, prüft `kontakt.test.ts`.
 */
describe('Wofür die App da ist und wo man eine Versammlung anfragt', () => {
  beforeAll(async () => {
    await Promise.all([loadOverlay('uk'), loadOverlay('ar')])
  })

  const zweck = (c: HTMLElement) => c.querySelector('.login-head .login-sub')?.textContent
  const bezeichnung = (c: HTMLElement) => c.querySelector('.login-kontakt span')?.textContent
  const verweis = (c: HTMLElement) => c.querySelector<HTMLAnchorElement>('.login-kontakt a')!
  const betreff = (a: HTMLAnchorElement) => new URL(a.getAttribute('href')!).searchParams.get('subject')

  it('unter dem Namen steht in einem Satz, wofür die App da ist', () => {
    expect(zweck(zeige().container)).toBe(t.appZweck)
  })

  it('die Adresse steht sichtbar da, ein Tipp öffnet eine Mail an den Betreiber', () => {
    const { container } = zeige()
    expect(bezeichnung(container)).toBe(t.versammlungAnfragen)
    expect(verweis(container).textContent).toBe(KONTAKT_MAIL)
    const url = new URL(verweis(container).getAttribute('href')!)
    expect(url.protocol).toBe('mailto:')
    expect(url.pathname).toBe(KONTAKT_MAIL)
    expect(betreff(verweis(container))).toBe(t.anfrageBetreff)
  })

  it('auf Ukrainisch kommt alles ukrainisch an, auch der Betreff — kodiert, damit der Verweis hält', () => {
    const uk = dict('uk')
    expect(uk.appZweck).not.toBe(dict('en').appZweck)
    const { container } = zeige({ lang: 'uk' })
    expect(zweck(container)).toBe(uk.appZweck)
    expect(verweis(container).getAttribute('href')).toMatch(/^[\x21-\x7e]+$/)
    expect(betreff(verweis(container))).toBe(uk.anfrageBetreff)
  })

  it('auf Arabisch bleibt die Adresse links-nach-rechts', () => {
    const { container } = zeige({ lang: 'ar' })
    expect(verweis(container).getAttribute('dir')).toBe('ltr')
  })
})
