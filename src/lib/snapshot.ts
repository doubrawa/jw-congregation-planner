/**
 * Offline-Momentaufnahme der Versammlungsdaten.
 *
 * Nach jedem erfolgreichen Laden wird die HydratePayload unverändert im
 * localStorage abgelegt; scheitert das Laden später (kein Netz), spielt
 * hydrate.ts sie über dieselbe `hydrate`-Aktion zurück und die App zeigt den
 * letzten Stand **nur lesend** an (siehe staleAt in AppState).
 *
 * Absichtlich die Payload und kein eigenes Format: kein zweites Mapping, das
 * mit dem Datenmodell auseinanderlaufen kann.
 *
 * Die Aufnahme enthält Namen und Zuteilungen der Versammlung. Sie ist an die
 * Benutzer-Id gebunden und wird beim Abmelden gelöscht (clearSnapshot).
 */

import type { HydratePayload } from '../app/context'

const KEY = 'snapshot'
const VERSION = 1

interface Envelope {
  v: number
  at: number // Zeitpunkt der Aufnahme (ms)
  userId: string
  payload: HydratePayload
}

/** Momentaufnahme sichern. Fehler (privater Modus, Speicher voll) sind egal. */
export function saveSnapshot(payload: HydratePayload): void {
  const envelope: Envelope = { v: VERSION, at: Date.now(), userId: payload.userId, payload }
  try {
    localStorage.setItem(KEY, JSON.stringify(envelope))
  } catch {
    // localStorage nicht verfügbar oder Kontingent erschöpft → ohne Offline-Stand
    // weiterarbeiten. Ein halb geschriebener Eintrag wäre schlimmer:
    try {
      localStorage.removeItem(KEY)
    } catch {
      /* nichts zu tun */
    }
  }
}

/**
 * Momentaufnahme dieses Nutzers lesen (oder null). Eine Aufnahme eines anderen
 * Kontos oder einer älteren Fassung wird verworfen — nie fremde Daten zeigen.
 */
export function readSnapshot(userId: string): { at: number; payload: HydratePayload } | null {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(KEY)
  } catch {
    return null
  }
  if (!raw) return null
  try {
    const env = JSON.parse(raw) as Envelope
    if (env.v !== VERSION || env.userId !== userId || !env.payload) return null
    return { at: env.at, payload: env.payload }
  } catch {
    return null // beschädigt
  }
}

/** Beim Abmelden und bei verlorener Mitgliedschaft aufräumen. */
export function clearSnapshot(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* nichts zu tun */
  }
}
