/**
 * Supabase-Anbindung (Auth + später Persistenz, siehe README "Hosting").
 *
 * Die App läuft ohne konfigurierte Env-Variablen im **Demo-Modus** (In-Memory,
 * Login simuliert) — mit `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`
 * übernimmt Supabase Auth das Login. Schema: supabase/schema.sql.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { AppAction } from '../app/context'
import type { Dispatch } from 'react'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/** null = Demo-Modus (keine Env-Konfiguration vorhanden). */
export const supabase: SupabaseClient | null =
  url && anonKey ? createClient(url, anonKey) : null

export const isSupabaseConfigured = supabase !== null

/**
 * Adresse, auf die Auth-Mail-Links (Bestätigung, Passwort-Reset) zurückführen:
 * die App selbst (ohne Hash/Query). Muss in Supabase unter Authentication →
 * URL Configuration als Redirect-URL erlaubt sein, sonst greift die Site-URL.
 */
function appRedirectUrl(): string {
  return window.location.origin + window.location.pathname
}

/**
 * Anzeigbarer Anmeldefehler: entweder ein UI-Schlüssel (dann übersetzt die
 * Oberfläche) oder ein unveränderter Text von Supabase.
 *
 * Diese Schicht kennt die App-Sprache nicht — sie läuft, bevor überhaupt
 * jemand angemeldet ist. Deshalb hier nur die Einordnung; die Worte kommen aus
 * `authFehlerText` (login/auth-text.ts). Vorher standen die Meldungen fest auf
 * Deutsch, unabhängig von der gewählten Sprache.
 */
export type AuthFehler =
  | { key: 'authFalsch' | 'authUnbestaetigt' | 'authSchonRegistriert' | 'authPwKurz' | 'authZuVieleVersuche' }
  | { text: string }

/** Supabase-Meldung einordnen; Unbekanntes bleibt unverändert. */
function authFehler(message: string): AuthFehler {
  if (message.includes('Invalid login credentials')) return { key: 'authFalsch' }
  if (message.includes('Email not confirmed')) return { key: 'authUnbestaetigt' }
  if (message.includes('already registered')) return { key: 'authSchonRegistriert' }
  if (message.includes('Password should be at least')) return { key: 'authPwKurz' }
  if (message.includes('rate limit')) return { key: 'authZuVieleVersuche' }
  return { text: message }
}

/** Anmelden; liefert null bei Erfolg, sonst eine anzeigbare Fehlermeldung. */
export async function signIn(email: string, password: string): Promise<AuthFehler | null> {
  if (!supabase) return null // Demo-Modus: immer "erfolgreich"
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  return error ? authFehler(error.message) : null
}

export type SignUpResult = { ok: true; needsConfirm: boolean } | { ok: false; error: AuthFehler }

/**
 * Konto erstellen. Bei aktivierter E-Mail-Bestätigung (`needsConfirm`) muss
 * der Nutzer erst den Mail-Link öffnen und sich dann anmelden; sonst ist er
 * direkt eingeloggt (SIGNED_IN-Event übernimmt).
 */
export async function signUp(email: string, password: string): Promise<SignUpResult> {
  if (!supabase) return { ok: true, needsConfirm: false }
  // emailRedirectTo: Bestätigungslink führt zurück in die App (nicht auf die
  // Supabase-Standard-Site-URL http://localhost:3000).
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: appRedirectUrl() },
  })
  if (error) return { ok: false, error: authFehler(error.message) }
  return { ok: true, needsConfirm: !data.session }
}

/** Passwort-Reset-Mail anstoßen; liefert null bei Erfolg, sonst Fehlertext. */
export async function requestPasswordReset(email: string): Promise<AuthFehler | null> {
  if (!supabase) return null
  // Der Mail-Link führt zurück in die App; das PASSWORD_RECOVERY-Event
  // öffnet dort die "Neues Passwort setzen"-Ansicht (RecoveryScreen).
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: appRedirectUrl(),
  })
  return error ? authFehler(error.message) : null
}

/** Neues Passwort setzen (Recovery-Session); null bei Erfolg, sonst Fehlertext. */
export async function updatePassword(password: string): Promise<AuthFehler | null> {
  if (!supabase) return null
  const { error } = await supabase.auth.updateUser({ password })
  return error ? authFehler(error.message) : null
}

/** Abmelden: State sofort zurücksetzen, Supabase-Session beenden (falls aktiv). */
export function performLogout(dispatch: Dispatch<AppAction>): void {
  dispatch({ type: 'logout' })
  void supabase?.auth.signOut()
}
