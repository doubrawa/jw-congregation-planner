/**
 * **Anmelden ohne Kennwort** (T121, Phase 8) — die App-Seite der Function
 * `anmelden`: mit dem Link aus der Nachricht oder mit dem Code vom Zettel. Einen
 * Link per E-Mail anfordern ging bis zum 31.10.2026; seitdem speichert die App
 * keine Adressen mehr, einen neuen Link geben die Ältesten.
 *
 * Die Function prüft Link oder Code, legt beim ersten Mal das Konto an und
 * gibt eine Sitzung zurück; hier wird sie übernommen (`setSession`). Danach
 * meldet Supabase `SIGNED_IN`, und die App lädt wie nach jeder Anmeldung
 * (`store.tsx`).
 *
 * **Ohne Datenbank** (Entwicklerseite, Tests) ist Anmelden nur nachgestellt:
 * Jeder Weg gilt als gelungen, und der Aufrufer meldet selbst an.
 */

import { fehlerAntwort } from './function-antwort'
import { supabase } from './supabase'

/** Warum es nicht ging. `netz`: keine Antwort; `fehler`: der Server konnte nicht. */
export type AnmeldeFehler = 'ungueltig' | 'abgelaufen' | 'zu-viele' | 'netz' | 'fehler'

type Antwort = Record<string, unknown>

/** Die Function rufen. Den Grund einer Abweisung liest `fehlerAntwort`. */
async function rufen(body: object): Promise<{ ok: true; daten: Antwort } | { ok: false; fehler: AnmeldeFehler }> {
  if (!supabase) return { ok: true, daten: {} }
  const { data, error } = await supabase.functions.invoke('anmelden', { body })
  if (!error) return { ok: true, daten: (data ?? {}) as Antwort }
  const grund = (await fehlerAntwort(error))?.error
  if (grund === 'ungueltig' || grund === 'abgelaufen' || grund === 'zu-viele') return { ok: false, fehler: grund }
  console.error('[anmelden]', error.message)
  return { ok: false, fehler: grund ? 'fehler' : 'netz' }
}

/** Die Sitzung aus der Antwort übernehmen. */
async function sitzungUebernehmen(daten: Antwort): Promise<AnmeldeFehler | null> {
  if (!supabase) return null
  const sitzung = daten.sitzung as { access_token?: unknown; refresh_token?: unknown } | undefined
  if (typeof sitzung?.access_token !== 'string' || typeof sitzung.refresh_token !== 'string') return 'fehler'
  const { error } = await supabase.auth.setSession({ access_token: sitzung.access_token, refresh_token: sitzung.refresh_token })
  if (error) console.error('[anmelden] setSession', error.message)
  return error ? 'fehler' : null
}

/** Mit dem Link aus der Nachricht anmelden (`#anmelden=<token>`). `null` heißt: angemeldet. */
export async function mitLinkAnmelden(token: string): Promise<AnmeldeFehler | null> {
  const r = await rufen({ aktion: 'link', token })
  return r.ok ? sitzungUebernehmen(r.daten) : r.fehler
}

/** Wem ein Code gehört — bevor man sich damit anmeldet. */
export type CodeGeprueft = { ok: true; name: string; versammlung: string } | { ok: false; fehler: AnmeldeFehler }

export async function codePruefen(code: string): Promise<CodeGeprueft> {
  const r = await rufen({ aktion: 'code', code, pruefen: true })
  if (!r.ok) return r
  return { ok: true, name: String(r.daten.name ?? ''), versammlung: String(r.daten.versammlung ?? '') }
}

/** Mit dem Code vom Zettel anmelden. `null` heißt: angemeldet. */
export async function mitCodeAnmelden(code: string): Promise<AnmeldeFehler | null> {
  const r = await rufen({ aktion: 'code', code })
  return r.ok ? sitzungUebernehmen(r.daten) : r.fehler
}
