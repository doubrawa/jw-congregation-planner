/**
 * Supabase-Anbindung (Auth + Persistenz, siehe README "Hosting").
 *
 * Mit `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` übernimmt Supabase Auth
 * das Login. Ohne sie gibt es keine Datenbank: Die Anmeldung wird nur
 * nachgestellt, und die App bleibt leer — erfundene Daten zeigt allein die
 * Entwicklerseite. Schema: supabase/schema.sql.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { SITZUNG_SCHLUESSEL } from './gespeicherte-sitzung'
import { verfolgterFetch } from './schreiben-unterwegs'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/** Nennt die Umgebung eine Datenbank? Steuert, wie die Anmeldemaske aussieht. */
export const isSupabaseConfigured = Boolean(url && anonKey)

/**
 * **Die Entwicklerseite bekommt keinen Client** — auch wenn `.env.local` eine
 * Datenbank nennt. Sie zeigt erfundene Daten, und mit Client liefe jeder Knopf
 * gegen die echte Versammlung dessen, der im selben Browser angemeldet ist:
 * „Plan senden" verschickte deren Woche, das Speichern schriebe hinein. Ohne
 * Client steigt jeder Weg vorher aus (`if (!supabase)`).
 *
 * Die Anmeldemaske folgt trotzdem `isSupabaseConfigured` und sieht damit aus
 * wie im Betrieb — die Handbuch-Aufnahme entsteht auf dieser Seite. Der Pfad
 * steht gleichlautend in `scripts/testdaten-grenze.mjs`, der die Seite
 * ausliefert; im Production-Build fällt die Abfrage mit `import.meta.env.DEV`
 * ganz weg.
 */
const aufEntwicklerseite =
  import.meta.env.DEV && globalThis.location?.pathname.endsWith('/demo.html') === true

/**
 * null = keine Datenbank (keine Env-Konfiguration, oder die Entwicklerseite).
 *
 * Der `fetch` zählt mit, was hinausgeht — das Nachladen wartet darauf
 * (`lib/schreiben-unterwegs.ts`). Den Schlüssel, unter dem die Sitzung liegt,
 * bekommt der Client ausdrücklich, und zwar denselben, den supabase-js ohnehin
 * wählt: Der Provider liest dort beim Start, ohne auf Supabase zu warten
 * (`lib/gespeicherte-sitzung.ts`).
 */
export const supabase: SupabaseClient | null =
  url && anonKey && !aufEntwicklerseite
    ? createClient(url, anonKey, { auth: { storageKey: SITZUNG_SCHLUESSEL }, global: { fetch: verfolgterFetch() } })
    : null

/*
 * Anmelden, Registrieren und das Kennwort zurücksetzen standen hier bis zum
 * 15.10.2026. Ein Kennwort gibt es seit dem Anmelden per Link nicht mehr (T121,
 * Phase 8): Konten legt die Function `anmelden` an, eine Sitzung gibt es für
 * einen gültigen Link oder Code (`lib/anmelden.ts`). Das Abmelden steht seit
 * dem 16.10.2026 in `lib/abmelden.ts`.
 */
