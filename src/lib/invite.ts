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

export async function sendInviteMails(
  invites: Array<{ personId: string; code: string }>,
): Promise<InviteMailResult> {
  if (!supabase) return { ok: false, notConfigured: true, error: 'demo' }
  const { data, error } = await supabase.functions.invoke('send-invite', { body: { invites } })
  if (error) return { ok: false, notConfigured: false, error: error.message }
  const payload = data as { sent?: number; skipped?: number; error?: string } | null
  if (payload?.error === 'not-configured') {
    return { ok: false, notConfigured: true, error: payload.error }
  }
  if (payload?.error) return { ok: false, notConfigured: false, error: payload.error }
  return { ok: true, sent: payload?.sent ?? 0, skipped: payload?.skipped ?? 0 }
}
