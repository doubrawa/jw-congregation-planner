// =============================================================================
// Supabase Edge Function: send-invite — Anmelde-Links ausstellen
// =============================================================================
// Der Admin gibt Personen ihren Zugang (T121, Phase 8): je Person ein neuer
// Link — er ersetzt den alten sofort, auch dessen Zettel. Zurück kommen Link
// und Code im Klartext, für die Nachricht und den Zettel; in der Datenbank
// stehen nur ihre Prüfsummen. Bis zum 31.10.2026 schickte die Function den
// Link auch per E-Mail (Resend); seitdem speichert die App keine Adressen mehr.
//
// **Gehärtet gegenüber den Einladungscodes:** Den Link erzeugt die Function
// selbst; vom Client kommen nur Personen-Ids, und nur die der eigenen
// Versammlung zählen.
//
// Request (mit Nutzer-Sitzung, supabase.functions.invoke):
//   { personIds: string[] (höchstens 200) }
// Response 200:
//   { links: [{ personId, url, zettelUrl, code, gueltigBis }] }
// 401 { error: 'unauthorized' } · 403 { error: 'forbidden' } · 400 { error: 'bad-request' }
// =============================================================================

import { linksAusstellen } from '../_shared/anmelde-links.ts'
import { anmeldeUrl, codeAnzeige, codeUrl } from '../_shared/anmeldung.ts'
import { CORS, json, restKlient, wert } from '../_shared/rest.ts'

declare const Deno: {
  serve: (handler: (req: Request) => Promise<Response> | Response) => void
  env: { get: (key: string) => string | undefined }
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const APP_URL = Deno.env.get('APP_URL') ?? 'https://versammlung.app/'

const rest = restKlient(SUPABASE_URL, SERVICE_KEY)

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    // Erst wer fragt — vor allem anderen.
    const userId = await rest.userId(req)
    if (!userId) return json({ error: 'unauthorized' }, 401)

    // Nur Admins; alles Weitere ist auf ihre Versammlung beschränkt.
    const membership = await rest.get<{ congregation_id: string; planner: boolean }[]>(
      `members?select=congregation_id,planner&user_id=eq.${wert(userId)}`,
    )
    const member = membership[0]
    if (!member?.planner) return json({ error: 'forbidden' }, 403)

    const payload = (await req.json().catch(() => null)) as { personIds?: unknown } | null
    const ids = Array.isArray(payload?.personIds)
      ? [...new Set(payload.personIds.filter((id): id is string => typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id)))]
      : []
    if (ids.length === 0 || ids.length > 200) return json({ error: 'bad-request' }, 400)
    const cong = member.congregation_id

    const persons = await rest.get<{ id: string }[]>(
      `persons?select=id&congregation_id=eq.${wert(cong)}&id=in.(${ids.map(wert).join(',')})`,
    )
    // Nur Personen der eigenen Versammlung — eine fremde Id fällt still heraus.
    const eigene = new Set(persons.map((p) => p.id))
    const fuer = ids.filter((id) => eigene.has(id))
    const neu = fuer.length > 0 ? await linksAusstellen(rest, fuer, cong) : []
    // Lehnt die Datenbank ab, gilt keiner der neuen Links. Das muss die App
    // erfahren: Mit einem leeren `links` fehlten beim Druck vieler Zettel die
    // eines Teils ohne jede Meldung.
    if (!neu) return json({ error: 'server-error' }, 500)

    const links = neu.map(({ personId, link }) => ({
      personId,
      url: anmeldeUrl(APP_URL, link.token),
      zettelUrl: codeUrl(APP_URL, link.code),
      code: codeAnzeige(link.code),
      gueltigBis: link.gueltigBis,
    }))
    return json({ links })
  } catch (err) {
    // Nur in die Logs, nicht in die Antwort: Die REST-Fehler tragen Pfad und
    // rohen PostgREST-Rumpf, verraten also Tabellen und Spalten.
    console.error('send-invite:', err instanceof Error ? err.message : String(err))
    return json({ error: 'server-error' }, 500)
  }
})
