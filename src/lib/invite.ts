/*
 * Einladungs-Mails: ruft die Edge Function `send-invite` auf (Resend mit
 * eigener Domain). Solange dort keine Absender-Domain konfiguriert ist
 * (Secret INVITE_FROM), antwortet sie mit `not-configured` — die Aufrufer
 * fallen dann auf mailto:/Teilen/Kopieren zurück.
 */

import { supabase } from './supabase'

export type InviteMailResult =
  | { ok: true; sent: number; skipped: number }
  | { ok: false; notConfigured: boolean; error: string }

/**
 * Einladungen verschicken — `lang` ist der App-Sprachcode der **Versammlung**.
 *
 * Warum der Client die Sprache mitschickt und die Function sie nicht selbst
 * ermittelt: Der Empfänger hat noch kein Konto, also auch keine eingestellte
 * Sprache. Maßgeblich ist die der Versammlung, und der Weg von ihrem deutschen
 * Namen zum Sprachcode (`congAppCode`) führt über zwei Tabellen mit zusammen
 * über 480 Einträgen — die gehören nicht in eine Function, die zwei Sätze
 * verschickt.
 *
 * Ohne `lang` (oder mit einem unbekannten Code) geht die Mail deutsch hinaus.
 */
export async function sendInviteMails(
  invites: Array<{ personId: string; code: string }>,
  lang?: string,
): Promise<InviteMailResult> {
  if (!supabase) return { ok: false, notConfigured: true, error: 'demo' }
  const { data, error } = await supabase.functions.invoke('send-invite', {
    body: { invites, ...(lang ? { lang } : {}) },
  })
  if (error) return { ok: false, notConfigured: false, error: error.message }
  const payload = data as { sent?: number; skipped?: number; error?: string } | null
  if (payload?.error === 'not-configured') {
    return { ok: false, notConfigured: true, error: payload.error }
  }
  if (payload?.error) return { ok: false, notConfigured: false, error: payload.error }
  return { ok: true, sent: payload?.sent ?? 0, skipped: payload?.skipped ?? 0 }
}
