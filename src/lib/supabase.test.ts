/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Ob supabase.ts einen Client baut, hängt an den Env-Variablen. Ohne eigene
// Werte liefe dieser Test lokal (mit .env.local) gegen den konfigurierten und
// in der CI (ohne .env.local) gegen den Demo-Zustand — also nur lokal grün.
// Deshalb hier feste Attrappen-Werte, gesetzt vor dem Import des Moduls.
vi.hoisted(() => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://test.example.invalid')
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key')
})

// createClient durch einen Fake-Auth-Client ersetzen (kein Netz).
const auth = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(),
}))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ auth }) }))

import {
  isSupabaseConfigured,
  performLogout,
  requestPasswordReset,
  signIn,
  signUp,
  updatePassword,
} from './supabase'

beforeEach(() => vi.clearAllMocks())

describe('signIn (Fehler-Einordnung)', () => {
  it('Erfolg → null', async () => {
    auth.signInWithPassword.mockResolvedValue({ error: null })
    expect(await signIn('a@b', 'pw')).toBeNull()
  })
  it('ordnet bekannte Auth-Fehler einem UI-Schlüssel zu', async () => {
    // Kein fertiger Text: diese Schicht läuft vor der Anmeldung und kennt die
    // App-Sprache nicht. Die Worte macht authFehlerText (login/auth-text.ts).
    const cases: [string, string][] = [
      ['Invalid login credentials', 'authFalsch'],
      ['Email not confirmed', 'authUnbestaetigt'],
      ['rate limit reached', 'authZuVieleVersuche'],
    ]
    for (const [msg, key] of cases) {
      auth.signInWithPassword.mockResolvedValue({ error: { message: msg } })
      expect(await signIn('a', 'b')).toEqual({ key })
    }
  })
  it('unbekannter Fehler wird unverändert durchgereicht', async () => {
    auth.signInWithPassword.mockResolvedValue({ error: { message: 'Server explodiert' } })
    expect(await signIn('a', 'b')).toEqual({ text: 'Server explodiert' })
  })
})

describe('signUp', () => {
  it('mit Session → sofort eingeloggt (needsConfirm false)', async () => {
    auth.signUp.mockResolvedValue({ data: { session: {} }, error: null })
    expect(await signUp('a', 'b')).toEqual({ ok: true, needsConfirm: false })
  })
  it('ohne Session → E-Mail-Bestätigung nötig', async () => {
    auth.signUp.mockResolvedValue({ data: { session: null }, error: null })
    expect(await signUp('a', 'b')).toEqual({ ok: true, needsConfirm: true })
  })
  it('Fehler → ok:false mit eingeordnetem Fehler', async () => {
    auth.signUp.mockResolvedValue({ data: {}, error: { message: 'User already registered' } })
    expect(await signUp('a', 'b')).toEqual({ ok: false, error: { key: 'authSchonRegistriert' } })
  })
})

describe('Passwort-Flows', () => {
  it('requestPasswordReset: Erfolg → null, sonst eingeordneter Fehler', async () => {
    auth.resetPasswordForEmail.mockResolvedValue({ error: null })
    expect(await requestPasswordReset('a@b')).toBeNull()
    auth.resetPasswordForEmail.mockResolvedValue({ error: { message: 'rate limit' } })
    expect(await requestPasswordReset('a@b')).toEqual({ key: 'authZuVieleVersuche' })
  })
  it('updatePassword: Erfolg → null, zu kurz → eingeordneter Fehler', async () => {
    auth.updateUser.mockResolvedValue({ error: null })
    expect(await updatePassword('lang genug')).toBeNull()
    auth.updateUser.mockResolvedValue({ error: { message: 'Password should be at least 6 characters' } })
    expect(await updatePassword('x')).toEqual({ key: 'authPwKurz' })
  })
})

describe('performLogout / Konfiguration', () => {
  it('dispatcht logout und beendet die Supabase-Session', () => {
    const dispatch = vi.fn()
    performLogout(dispatch)
    expect(dispatch).toHaveBeenCalledWith({ type: 'logout' })
    expect(auth.signOut).toHaveBeenCalled()
  })
  it('isSupabaseConfigured ist im (gemockten) konfigurierten Zustand true', () => {
    expect(isSupabaseConfigured).toBe(true)
  })
})
