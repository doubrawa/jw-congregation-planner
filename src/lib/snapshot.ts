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
 *
 * ## Was sie **nicht** enthält, und wie lange sie lebt (S6)
 *
 * Sie liegt als Klartext im `localStorage` — wer an das Browser-Profil kommt,
 * kann sie lesen. Das ist für sich genommen kein großer Zugewinn für einen
 * Angreifer: Im selben Speicher liegt das Supabase-Sitzungstoken, und damit
 * bekäme er dieselben Daten live. **Einen Unterschied macht sie an genau einer
 * Stelle: Sie überlebt die Sitzung.** Ist das Token abgelaufen und hat sich
 * niemand abgemeldet, bleibt die Aufnahme lesbar — auf einem geteilten
 * Saal-Tablet Monate später.
 *
 * Deshalb zwei Grenzen:
 *
 *  - **Ein Verfallsdatum** (`HOECHSTALTER_TAGE`). Was älter ist, wird beim
 *    Lesen verworfen **und gelöscht**. Der Preis ist gering: Wer so lange ohne
 *    Netz war, dem nützt ein Stand von damals ohnehin nichts — er sieht dann
 *    den Fehlerbildschirm mit „Neu laden" statt eines Programms, das nicht mehr
 *    gilt.
 *  - **Der Abwesenheitsgrund bleibt draußen.** Er ist der einzige Freitext im
 *    ganzen Bestand, der Gesundheitsangaben enthalten kann („Reha",
 *    „Krankenhaus") — also das, was am wenigsten hier liegen sollte, und
 *    zugleich das, was offline niemand braucht. Telefon und E-Mail bleiben
 *    dagegen drin: Offline ist die Nummer oft genau das, wofür man die App
 *    aufmacht.
 *
 * Verschlüsselung löst das ausdrücklich **nicht** — der Schlüssel müsste auf
 * demselben Gerät liegen und wäre genauso lesbar.
 */

import type { HydratePayload } from '../app/context'
import type { Absence } from '../data/types'

const KEY = 'snapshot'
const VERSION = 1

/**
 * Wie lange eine Aufnahme gilt.
 *
 * Vierzehn Tage: länger als jede Reise ohne Netz, kürzer als „irgendwann". Ein
 * Programm von vor drei Wochen ist ohnehin keine Auskunft mehr.
 */
const HOECHSTALTER_TAGE = 14

interface Envelope {
  v: number
  at: number // Zeitpunkt der Aufnahme (ms)
  userId: string
  payload: HydratePayload
}

/**
 * Die Aufnahme ohne die Abwesenheitsgründe (S6).
 *
 * Kopiert, statt zu ändern: Dieselbe Nutzlast geht gleich danach in den
 * Zustand (`hydrate` in hydrate.ts) — dort **mit** Grund, denn dort ist sie
 * frisch aus der Datenbank und die Ansicht zeigt ihn. Nur was liegen bleibt,
 * wird beschnitten.
 *
 * Beide Anzeigestellen kommen ohne aus: die Abwesenheitskarte schreibt
 * „ohne Angabe", die Zeitleiste nur „abwesend".
 */
function ohneGruende(payload: HydratePayload): HydratePayload {
  if (!payload.absences.some((a) => a.reason)) return payload
  const absences: Absence[] = payload.absences.map((a) => (a.reason ? { ...a, reason: '' } : a))
  return { ...payload, absences }
}

/** Momentaufnahme sichern. Fehler (privater Modus, Speicher voll) sind egal. */
export function saveSnapshot(payload: HydratePayload): void {
  const envelope: Envelope = {
    v: VERSION,
    at: Date.now(),
    userId: payload.userId,
    payload: ohneGruende(payload),
  }
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
 * Momentaufnahme dieses Nutzers lesen (oder null).
 *
 * **Was hier nicht gilt, wird nicht nur verworfen, sondern gelöscht** (S6) —
 * eine Aufnahme eines anderen Kontos, eine aus einer älteren Fassung, eine
 * beschädigte, eine abgelaufene. Sie zu verwerfen genügte für die Anzeige, und
 * genau darum geht es hier nicht: Die Aufnahme trägt Namen und Zuteilungen im
 * Klartext, und sie überlebt die Sitzung, in der sie entstanden ist.
 *
 * Der Fall, um den es geht, steht im Kopf dieser Datei: das geteilte
 * Saal-Tablet. Wer sich nicht abmeldet (`clearSnapshot` läuft dann nicht),
 * hinterlässt seine Aufnahme; meldet sich danach jemand anders an und geht ein
 * Ladevorgang schief, liest die App hier — und darf die fremde Aufnahme bei
 * dieser Gelegenheit gleich wegräumen, statt sie bis zum Verfallsdatum liegen
 * zu lassen.
 */
export function readSnapshot(userId: string): { at: number; payload: HydratePayload } | null {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(KEY)
  } catch {
    return null
  }
  if (!raw) return null
  const env = gelesen(raw)
  const gueltig =
    env !== null &&
    env.v === VERSION &&
    env.userId === userId &&
    Boolean(env.payload) &&
    Date.now() - env.at <= HOECHSTALTER_TAGE * 864e5
  if (!env || !gueltig) {
    clearSnapshot()
    return null
  }
  return { at: env.at, payload: env.payload }
}

/** Beschädigtes bleibt `null` — die Aufnahme wird dann verworfen. */
function gelesen(raw: string): Envelope | null {
  try {
    return JSON.parse(raw) as Envelope
  } catch {
    return null
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
