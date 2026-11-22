/**
 * **Das Kalender-Abo** — die Profil-Seite der Function `kalender`: der Stand des
 * eigenen Abos, ein neuer Link, das Ende. Alles mit der Sitzung des Kontos; die
 * Function nimmt die Person allein aus ihr.
 *
 * **Ohne Datenbank** (Entwicklerseite, Tests) nachgestellt wie der Zugang
 * (`zugang.ts`): kein Abo, ein Link aus dem Zufall des Geräts, beendet ist
 * sofort.
 */

import { neuesToken } from '../../supabase/functions/_shared/anmeldung.ts'
import { supabase } from './supabase'

/** Was das Profil über das eigene Abo weiß. */
export interface KalenderAbo {
  /** Wann der Link ausgestellt wurde (ISO). */
  erstelltAt: string
  /** Wann die Kalender-App zuletzt geholt hat — `null`: noch nie. */
  abgerufenAt: string | null
}

/**
 * Die Adresse, die eine Kalender-App abonniert: `webcal://` statt `https://`.
 * So öffnet ein Tipp auf dem iPhone und am Mac gleich das Abonnieren.
 */
export function webcalAdresse(url: string): string {
  return url.replace(/^https?:\/\//, 'webcal://')
}

async function kalenderRufen(body: object): Promise<Record<string, unknown> | null> {
  const r = await supabase!.functions.invoke('kalender', { body })
  if (r.error) {
    console.error('[kalender]', r.error.message)
    return null
  }
  return (r.data ?? {}) as Record<string, unknown>
}

/**
 * Der Stand des eigenen Abos: `null` heißt „keins", `undefined` „nicht zu
 * erfahren" (offline, Fehler) — dann zeigt das Profil, was man tun kann, ohne
 * zu behaupten, es gebe keins.
 */
export async function kalenderStand(): Promise<KalenderAbo | null | undefined> {
  if (!supabase) return null
  const daten = await kalenderRufen({ aktion: 'stand' })
  if (!daten) return undefined
  const abo = daten.abo as { erstellt_at?: unknown; abgerufen_at?: unknown } | null | undefined
  if (!abo || typeof abo.erstellt_at !== 'string') return null
  return { erstelltAt: abo.erstellt_at, abgerufenAt: typeof abo.abgerufen_at === 'string' ? abo.abgerufen_at : null }
}

/** Einen neuen Link ausstellen — der alte gilt danach nicht mehr. `null`, wenn es nicht ging. */
export async function kalenderAusstellen(sprache: string): Promise<string | null> {
  if (!supabase) return `https://kalender.invalid/kalender?t=${neuesToken()}`
  const daten = await kalenderRufen({ aktion: 'ausstellen', sprache })
  return typeof daten?.url === 'string' ? daten.url : null
}

/** Das Abo beenden. `true`, wenn es ging. */
export async function kalenderBeenden(): Promise<boolean> {
  if (!supabase) return true
  return (await kalenderRufen({ aktion: 'beenden' }))?.ok === true
}
