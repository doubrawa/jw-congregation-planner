/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import {
  AppDispatchContext,
  AppStateContext,
  AppStoreContext,
  type AppState,
  useStaticStore,
} from '../app/context'
import { initialState } from '../app/init'
import { dict } from '../i18n/ui'

/**
 * **Der Login — die einzige Tür der App.**
 *
 * Er trägt vier Wege (anmelden, registrieren, Passwort vergessen, Sprache
 * wählen) und muss dabei zweierlei Betriebsarten auseinanderhalten:
 *
 * - **Mit Supabase** wird wirklich angemeldet, und jeder Fehler muss in der
 *   Sprache des Lesers ankommen — ein durchgereichter englischer
 *   Supabase-Fehler ist für den Verkündiger keine Auskunft.
 * - **Ohne Supabase** (Demo) genügt jede Eingabe. Dann darf aber weder eine
 *   Reset-Mail versprochen noch ein Konto angeboten werden: beides gibt es
 *   dort nicht, und der Hinweis darauf wäre eine Lüge.
 *
 * Dazu die Passwort-Rücksetz-Ansicht, in die der Mail-Link führt.
 */

type AuthFehler = { key: 'authFalsch' | 'authUnbestaetigt' | 'authSchonRegistriert' | 'authPwKurz' | 'authZuVieleVersuche' } | { text: string }

const signIn = vi.fn((_mail: string, _pw: string) => Promise.resolve<AuthFehler | null>(null))
type SignUpResult = { ok: true; needsConfirm: boolean } | { ok: false; error: AuthFehler }
const signUp = vi.fn((_mail: string, _pw: string) =>
  Promise.resolve<SignUpResult>({ ok: true, needsConfirm: false }),
)
const requestPasswordReset = vi.fn((_mail: string) => Promise.resolve<AuthFehler | null>(null))
const updatePassword = vi.fn((_pw: string) => Promise.resolve<AuthFehler | null>(null))
const konfiguriert = { wert: true }

vi.mock('../lib/supabase', () => ({
  supabase: null,
  get isSupabaseConfigured() {
    return konfiguriert.wert
  },
  signIn: (m: string, p: string) => signIn(m, p),
  signUp: (m: string, p: string) => signUp(m, p),
  requestPasswordReset: (m: string) => requestPasswordReset(m),
  updatePassword: (p: string) => updatePassword(p),
  performLogout: vi.fn(),
}))

const { LoginScreen } = await import('./LoginScreen')
const { RecoveryScreen } = await import('./RecoveryScreen')

const t = dict('de')

function zeige(was: 'login' | 'recovery', over: Partial<AppState> = {}) {
  const dispatch = vi.fn()
  const state: AppState = { ...initialState(), screen: 'login', ...over }
  function Buehne() {
    const store = useStaticStore(state)
    return (
      <AppDispatchContext.Provider value={dispatch}>
        <AppStoreContext.Provider value={store}>
          <AppStateContext.Provider value={state}>
            {was === 'login' ? <LoginScreen /> : <RecoveryScreen />}
          </AppStateContext.Provider>
        </AppStoreContext.Provider>
      </AppDispatchContext.Provider>
    )
  }
  return { dispatch, ...render(<Buehne />) }
}

const eingeben = (c: HTMLElement, mail: string, pw = 'geheim123') => {
  fireEvent.change(c.querySelector('#login-mail')!, { target: { value: mail } })
  fireEvent.change(c.querySelector('#login-pass')!, { target: { value: pw } })
}
const absenden = (c: HTMLElement) => fireEvent.submit(c.querySelector('.login-form')!)
const knopf = (c: HTMLElement, text: string) =>
  [...c.querySelectorAll('button')].find((b) => b.textContent?.trim() === text)

beforeEach(() => {
  konfiguriert.wert = true
  signIn.mockClear().mockResolvedValue(null)
  signUp.mockClear().mockResolvedValue({ ok: true, needsConfirm: false })
  requestPasswordReset.mockClear().mockResolvedValue(null)
  updatePassword.mockClear().mockResolvedValue(null)
})
afterEach(cleanup)

describe('Anmelden', () => {
  it('führt die beiden Felder und den Anmelde-Knopf', () => {
    const { container } = zeige('login')
    expect(container.querySelector('#login-mail')).toBeTruthy()
    expect(container.querySelector<HTMLInputElement>('#login-pass')?.type).toBe('password')
    expect(container.querySelector('.login-submit')?.textContent).toBe(t.anmelden)
  })

  it('meldet mit den eingegebenen Daten an und geht weiter', async () => {
    const { container, dispatch } = zeige('login')
    eingeben(container, 'wer@example.org')
    absenden(container)
    await waitFor(() => expect(signIn).toHaveBeenCalledWith('wer@example.org', 'geheim123'))
    await waitFor(() => expect(dispatch).toHaveBeenCalledWith({ type: 'login', welcome: true }))
  })

  it('ein Fehler kommt in der Sprache des Lesers an, nicht als Supabase-Text', async () => {
    signIn.mockResolvedValue({ key: 'authFalsch' })
    const { container, dispatch } = zeige('login')
    eingeben(container, 'wer@example.org')
    absenden(container)
    await waitFor(() =>
      expect(dispatch).toHaveBeenCalledWith({ type: 'showToast', text: t.authFalsch }),
    )
    expect(dispatch.mock.calls.some((c) => c[0].type === 'login')).toBe(false)
  })

  it('ein unbekannter Fehler wird durchgereicht statt verschluckt', async () => {
    signIn.mockResolvedValue({ text: 'Etwas ganz Neues' })
    const { container, dispatch } = zeige('login')
    eingeben(container, 'wer@example.org')
    absenden(container)
    await waitFor(() =>
      expect(dispatch).toHaveBeenCalledWith({ type: 'showToast', text: 'Etwas ganz Neues' }),
    )
  })

  it('während des Anmeldens ist der Knopf gesperrt — kein zweiter Versuch nebenher', async () => {
    let loslassen: (v: AuthFehler | null) => void = () => {}
    signIn.mockReturnValue(new Promise((res) => { loslassen = res }))
    const { container } = zeige('login')
    eingeben(container, 'wer@example.org')
    absenden(container)
    const knopfEl = container.querySelector<HTMLButtonElement>('.login-submit')!
    await waitFor(() => expect(knopfEl.disabled).toBe(true))
    absenden(container)
    expect(signIn).toHaveBeenCalledTimes(1)
    loslassen(null)
    await waitFor(() => expect(knopfEl.disabled).toBe(false))
  })
})

describe('Registrieren', () => {
  it('der Umschalter führt hin und wieder zurück', () => {
    const { container } = zeige('login')
    fireEvent.click(knopf(container, t.kontoErstellen)!)
    expect(container.querySelector('.login-submit')?.textContent).toBe(t.registrieren)
    fireEvent.click(knopf(container, t.zurAnmeldung)!)
    expect(container.querySelector('.login-submit')?.textContent).toBe(t.anmelden)
  })

  it('beim Registrieren schlägt der Browser ein NEUES Passwort vor, kein gespeichertes', () => {
    const { container } = zeige('login')
    expect(container.querySelector('#login-pass')?.getAttribute('autoComplete')).toBe('current-password')
    fireEvent.click(knopf(container, t.kontoErstellen)!)
    expect(container.querySelector('#login-pass')?.getAttribute('autoComplete')).toBe('new-password')
  })

  it('„Passwort vergessen" steht beim Registrieren nicht da — es gibt noch kein Konto', () => {
    const { container } = zeige('login')
    expect(knopf(container, t.pwVergessen)).toBeTruthy()
    fireEvent.click(knopf(container, t.kontoErstellen)!)
    expect(knopf(container, t.pwVergessen)).toBeUndefined()
  })

  it('legt ein Konto an', async () => {
    const { container } = zeige('login')
    fireEvent.click(knopf(container, t.kontoErstellen)!)
    eingeben(container, '  neu@example.org  ')
    absenden(container)
    await waitFor(() => expect(signUp).toHaveBeenCalledWith('neu@example.org', 'geheim123'))
  })

  it('mit Mail-Bestätigung führt es zurück zur Anmeldung und sagt, was zu tun ist', async () => {
    signUp.mockResolvedValue({ ok: true, needsConfirm: true })
    const { container, dispatch } = zeige('login')
    fireEvent.click(knopf(container, t.kontoErstellen)!)
    eingeben(container, 'neu@example.org')
    absenden(container)
    await waitFor(() =>
      expect(dispatch).toHaveBeenCalledWith({ type: 'showToast', text: t.regMailHinweis }),
    )
    expect(container.querySelector('.login-submit')?.textContent).toBe(t.anmelden)
  })

  it('ohne Bestätigungspflicht wird hier nicht selbst eingeloggt — das Sitzungs-Ereignis übernimmt', async () => {
    signUp.mockResolvedValue({ ok: true, needsConfirm: false })
    const { container, dispatch } = zeige('login')
    fireEvent.click(knopf(container, t.kontoErstellen)!)
    eingeben(container, 'neu@example.org')
    absenden(container)
    await waitFor(() => expect(signUp).toHaveBeenCalled())
    expect(dispatch.mock.calls.some((c) => c[0].type === 'login')).toBe(false)
  })

  it('ein Fehler bleibt im Registrieren-Modus stehen — man will die Eingabe korrigieren', async () => {
    signUp.mockResolvedValue({ ok: false, error: { key: 'authSchonRegistriert' } })
    const { container, dispatch } = zeige('login')
    fireEvent.click(knopf(container, t.kontoErstellen)!)
    eingeben(container, 'neu@example.org')
    absenden(container)
    await waitFor(() => expect(dispatch.mock.calls.some((c) => c[0].type === 'showToast')).toBe(true))
    expect(container.querySelector('.login-submit')?.textContent).toBe(t.registrieren)
  })
})

describe('Passwort vergessen', () => {
  it('schickt die Reset-Mail an die eingegebene Adresse', async () => {
    const { container, dispatch } = zeige('login')
    fireEvent.change(container.querySelector('#login-mail')!, { target: { value: '  wer@example.org ' } })
    fireEvent.click(knopf(container, t.pwVergessen)!)
    await waitFor(() => expect(requestPasswordReset).toHaveBeenCalledWith('wer@example.org'))
    await waitFor(() =>
      expect(dispatch).toHaveBeenCalledWith({ type: 'showToast', text: t.resetMailHinweis }),
    )
  })

  it('ohne Adresse fragt es zuerst danach — statt eine Mail ins Leere zu schicken', async () => {
    const { container, dispatch } = zeige('login')
    fireEvent.click(knopf(container, t.pwVergessen)!)
    expect(requestPasswordReset).not.toHaveBeenCalled()
    expect(dispatch).toHaveBeenCalledWith({ type: 'showToast', text: t.email })
  })

  it('ein Fehler beim Versand wird gemeldet, nicht als Erfolg ausgegeben', async () => {
    requestPasswordReset.mockResolvedValue({ key: 'authFalsch' })
    const { container, dispatch } = zeige('login')
    fireEvent.change(container.querySelector('#login-mail')!, { target: { value: 'wer@example.org' } })
    fireEvent.click(knopf(container, t.pwVergessen)!)
    await waitFor(() =>
      expect(dispatch).toHaveBeenCalledWith({ type: 'showToast', text: t.authFalsch }),
    )
  })
})

describe('Ohne Supabase: Demo-Modus', () => {
  beforeEach(() => {
    konfiguriert.wert = false
  })

  it('sagt es unten deutlich', () => {
    const { container } = zeige('login')
    expect(container.querySelector('.login-note')?.textContent).toBe(t.demoHinweis)
  })

  it('mit Supabase steht dort dagegen der Hinweis auf die Mitgliedschaft', () => {
    konfiguriert.wert = true
    const { container } = zeige('login')
    expect(container.querySelector('.login-note')?.textContent).toBe(t.nurMitglieder)
  })

  it('bietet kein Konto an — dort gibt es keine', () => {
    const { container } = zeige('login')
    expect(knopf(container, t.kontoErstellen)).toBeUndefined()
  })

  it('jede Eingabe meldet an, ohne Netzaufruf', async () => {
    const { container, dispatch } = zeige('login')
    absenden(container)
    expect(signIn).not.toHaveBeenCalled()
    expect(dispatch).toHaveBeenCalledWith({ type: 'login', welcome: true })
  })

  it('„Passwort vergessen" verspricht keine Mail, die niemand schickt', () => {
    const { container, dispatch } = zeige('login')
    fireEvent.click(knopf(container, t.pwVergessen)!)
    expect(requestPasswordReset).not.toHaveBeenCalled()
    expect(dispatch).toHaveBeenCalledWith({ type: 'showToast', text: t.demoHinweis })
  })
})

describe('Die Sprache lässt sich schon vor dem Anmelden wählen', () => {
  it('die Auswahl steht da und trägt die aktuelle Sprache', () => {
    const { container } = zeige('login', { lang: 'de' })
    const wahl = container.querySelector<HTMLSelectElement>('.login-lang-select')!
    expect(wahl.value).toBe('de')
    expect(wahl.querySelectorAll('option').length).toBeGreaterThan(30)
  })

  it('ein Wechsel schlägt sofort durch — man muss sich nicht erst anmelden', () => {
    const { container, dispatch } = zeige('login')
    fireEvent.change(container.querySelector('.login-lang-select')!, { target: { value: 'en' } })
    expect(dispatch).toHaveBeenCalledWith({ type: 'setLang', lang: 'en' })
  })
})

describe('Neues Passwort setzen (aus dem Mail-Link)', () => {
  const felder = (c: HTMLElement, pw: string, wdh: string) => {
    fireEvent.change(c.querySelector('#rec-pass')!, { target: { value: pw } })
    fireEvent.change(c.querySelector('#rec-pass2')!, { target: { value: wdh } })
  }

  it('verlangt das Passwort zweimal', () => {
    const { container } = zeige('recovery')
    expect(container.querySelector('#rec-pass')).toBeTruthy()
    expect(container.querySelector('#rec-pass2')).toBeTruthy()
    expect(container.querySelector('.login-sub')?.textContent).toBe(t.recoveryTitle)
  })

  it('stimmen die beiden nicht überein, wird nichts gesetzt', () => {
    const { container, dispatch } = zeige('recovery')
    felder(container, 'geheim123', 'tippfehler')
    fireEvent.submit(container.querySelector('.login-form')!)
    expect(updatePassword).not.toHaveBeenCalled()
    expect(dispatch).toHaveBeenCalledWith({ type: 'showToast', text: t.toastPwMismatch })
  })

  it('stimmen sie überein, wird es gesetzt und die Ansicht verlassen', async () => {
    const { container, dispatch } = zeige('recovery')
    felder(container, 'geheim123', 'geheim123')
    fireEvent.submit(container.querySelector('.login-form')!)
    await waitFor(() => expect(updatePassword).toHaveBeenCalledWith('geheim123'))
    await waitFor(() => expect(dispatch).toHaveBeenCalledWith({ type: 'setRecovery', on: false }))
    expect(dispatch).toHaveBeenCalledWith({ type: 'showToast', text: t.toastPwGeaendert })
  })

  it('ein zu kurzes Passwort bleibt in der Ansicht — man soll es gleich korrigieren', async () => {
    updatePassword.mockResolvedValue({ key: 'authPwKurz' })
    const { container, dispatch } = zeige('recovery')
    felder(container, 'kurz', 'kurz')
    fireEvent.submit(container.querySelector('.login-form')!)
    await waitFor(() => expect(dispatch.mock.calls.some((c) => c[0].type === 'showToast')).toBe(true))
    expect(dispatch.mock.calls.some((c) => c[0].type === 'setRecovery')).toBe(false)
  })
})
