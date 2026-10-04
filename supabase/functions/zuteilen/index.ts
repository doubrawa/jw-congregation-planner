// =============================================================================
// Edge Function: zuteilen — Schreibweg der Rechte-Stufe „Planer" (4.10.2026)
// =============================================================================
// Ein Planer teilt zu, ändert aber den Plan nicht. Wochen schreibt laut RLS nur
// der Admin; der Planer schreibt seine über diese Function, die prüft, dass er
// nur zugeteilt hat (`woche.ts`).
//
// Aufruf (POST, mit der Sitzung des Nutzers):
//   { action: 'woche', woche: '<Montag>', stand: '<updated_at>', data: <Week> }
//   → 200 { ok: true, stand: '<neuer Stand>' }
//   → 400 bad-request, 401 unauthorized, 403 forbidden | nur-zuteilen,
//     404 week-not-found, 409 conflict
//
// Die Treffpunkte brauchen diesen Weg nicht: Sie sind eine flache Liste, und
// der Trigger `fs_weeks_pruefen` (schema.sql) zieht dieselbe Grenze in der
// Datenbank.
// =============================================================================

import { CORS, json, restKlient } from '../_shared/rest.ts'
import { wocheZuteilen } from './woche.ts'

declare const Deno: {
  serve: (handler: (req: Request) => Promise<Response> | Response) => void
  env: { get: (key: string) => string | undefined }
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const rest = restKlient(SUPABASE_URL, SERVICE_KEY)

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const userId = await rest.userId(req)
    if (!userId) return json({ error: 'unauthorized' }, 401)
    const payload = (await req.json().catch(() => null)) as { action?: string } | null
    if (payload?.action === 'woche') return await wocheZuteilen(rest, userId, payload)
    return json({ error: 'bad-request' }, 400)
  } catch (err) {
    // Nur in die Logs, nicht in die Antwort — wie in den übrigen Functions:
    // Die Meldung trüge Pfade und rohe PostgREST-Antworten.
    console.error('zuteilen:', err instanceof Error ? err.message : String(err))
    return json({ error: 'server-error' }, 500)
  }
})
