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

/** Häufige Auth-Fehler auf Deutsch; Rest unverändert durchreichen. */
function authErrorText(message: string): string {
  if (message.includes('Invalid login credentials')) return 'E-Mail oder Passwort falsch'
  if (message.includes('Email not confirmed')) return 'E-Mail-Adresse noch nicht bestätigt'
  if (message.includes('rate limit')) return 'Zu viele Versuche — bitte kurz warten'
  return message
}

/** Anmelden; liefert null bei Erfolg, sonst eine anzeigbare Fehlermeldung. */
export async function signIn(email: string, password: string): Promise<string | null> {
  if (!supabase) return null // Demo-Modus: immer "erfolgreich"
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  return error ? authErrorText(error.message) : null
}

/** Passwort-Reset-Mail anstoßen; liefert null bei Erfolg, sonst Fehlertext. */
export async function requestPasswordReset(email: string): Promise<string | null> {
  if (!supabase) return null
  // TODO: eigene Recovery-Seite (PASSWORD_RECOVERY-Event + updateUser),
  // sobald Persistenz steht; bis dahin führt der Mail-Link zurück in die App.
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + window.location.pathname,
  })
  return error ? authErrorText(error.message) : null
}

/** Abmelden: State sofort zurücksetzen, Supabase-Session beenden (falls aktiv). */
export function performLogout(dispatch: Dispatch<AppAction>): void {
  dispatch({ type: 'logout' })
  void supabase?.auth.signOut()
}
