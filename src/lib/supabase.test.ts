/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vitest'

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

describe('signIn (Fehlertexte auf Deutsch)', () => {
  it('Erfolg → null', async () => {
    auth.signInWithPassword.mockResolvedValue({ error: null })
    expect(await signIn('a@b', 'pw')).toBeNull()
  })
  it('übersetzt bekannte Auth-Fehler', async () => {
    const cases: [string, string][] = [
      ['Invalid login credentials', 'E-Mail oder Passwort falsch'],
      ['Email not confirmed', 'E-Mail-Adresse noch nicht bestätigt'],
      ['rate limit reached', 'Zu viele Versuche — bitte kurz warten'],
    ]
    for (const [msg, expected] of cases) {
      auth.signInWithPassword.mockResolvedValue({ error: { message: msg } })
      expect(await signIn('a', 'b')).toBe(expected)
    }
  })
  it('unbekannter Fehler wird unverändert durchgereicht', async () => {
    auth.signInWithPassword.mockResolvedValue({ error: { message: 'Server explodiert' } })
    expect(await signIn('a', 'b')).toBe('Server explodiert')
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
  it('Fehler → ok:false mit übersetztem Text', async () => {
    auth.signUp.mockResolvedValue({ data: {}, error: { message: 'User already registered' } })
    expect(await signUp('a', 'b')).toEqual({ ok: false, error: 'E-Mail ist bereits registriert' })
  })
})

describe('Passwort-Flows', () => {
  it('requestPasswordReset: Erfolg → null, Fehler → Text', async () => {
    auth.resetPasswordForEmail.mockResolvedValue({ error: null })
    expect(await requestPasswordReset('a@b')).toBeNull()
    auth.resetPasswordForEmail.mockResolvedValue({ error: { message: 'rate limit' } })
    expect(await requestPasswordReset('a@b')).toBe('Zu viele Versuche — bitte kurz warten')
  })
  it('updatePassword: Erfolg → null, zu kurz → Text', async () => {
    auth.updateUser.mockResolvedValue({ error: null })
    expect(await updatePassword('lang genug')).toBeNull()
    auth.updateUser.mockResolvedValue({ error: { message: 'Password should be at least 6 characters' } })
    expect(await updatePassword('x')).toBe('Passwort zu kurz (mindestens 6 Zeichen)')
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
