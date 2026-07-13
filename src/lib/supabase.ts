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

/** Häufige Auth-Fehler auf Deutsch; Rest unverändert durchreichen. */
function authErrorText(message: string): string {
  if (message.includes('Invalid login credentials')) return 'E-Mail oder Passwort falsch'
  if (message.includes('Email not confirmed')) return 'E-Mail-Adresse noch nicht bestätigt'
  if (message.includes('already registered')) return 'E-Mail ist bereits registriert'
  if (message.includes('Password should be at least'))
    return 'Passwort zu kurz (mindestens 6 Zeichen)'
  if (message.includes('rate limit')) return 'Zu viele Versuche — bitte kurz warten'
  return message
}

/** Anmelden; liefert null bei Erfolg, sonst eine anzeigbare Fehlermeldung. */
export async function signIn(email: string, password: string): Promise<string | null> {
  if (!supabase) return null // Demo-Modus: immer "erfolgreich"
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  return error ? authErrorText(error.message) : null
}

export type SignUpResult = { ok: true; needsConfirm: boolean } | { ok: false; error: string }

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
  if (error) return { ok: false, error: authErrorText(error.message) }
  return { ok: true, needsConfirm: !data.session }
}

/** Passwort-Reset-Mail anstoßen; liefert null bei Erfolg, sonst Fehlertext. */
export async function requestPasswordReset(email: string): Promise<string | null> {
  if (!supabase) return null
  // Der Mail-Link führt zurück in die App; das PASSWORD_RECOVERY-Event
  // öffnet dort die "Neues Passwort setzen"-Ansicht (RecoveryScreen).
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: appRedirectUrl(),
  })
  return error ? authErrorText(error.message) : null
}

/** Neues Passwort setzen (Recovery-Session); null bei Erfolg, sonst Fehlertext. */
export async function updatePassword(password: string): Promise<string | null> {
  if (!supabase) return null
  const { error } = await supabase.auth.updateUser({ password })
  return error ? authErrorText(error.message) : null
}

/** Abmelden: State sofort zurücksetzen, Supabase-Session beenden (falls aktiv). */
export function performLogout(dispatch: Dispatch<AppAction>): void {
  dispatch({ type: 'logout' })
  void supabase?.auth.signOut()
}
