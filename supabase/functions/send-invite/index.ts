// =============================================================================
// Supabase Edge Function: send-invite — Einladungs-E-Mails über Resend
// =============================================================================
// Verschickt die Einladungs-Mail (App-Link + Einladungscode) an Personen der
// eigenen Versammlung. Nur Admins (members.planner) dürfen aufrufen; die
// Empfängeradresse kommt IMMER aus der Personen-Tabelle der eigenen
// Versammlung — die Function kann nicht als offenes Mail-Relay missbraucht
// werden (frei wählbar ist nur der Code-String in der Vorlage).
//
// Request  (mit Nutzer-JWT, supabase.functions.invoke):
//   { invites: [{ personId: string, code: string }, …] }   (max. 200)
// Response 200:
//   { sent: n, skipped: n }          skipped = Person ohne E-Mail/nicht gefunden
//   { error: 'not-configured' }      INVITE_FROM fehlt → Client nutzt mailto
//   { error: '…' }                   sonstige Fehler
//
// Benötigte Secrets:
//  - RESEND_API_KEY   Resend-API-Key (bereits gesetzt)
//  - INVITE_FROM      Absender mit VERIFIZIERTER Domain, z. B.
//                     "JW Congregation Planner <einladung@deine-domain.de>"
//                     → solange nicht gesetzt, antwortet die Function mit
//                     'not-configured' und die App fällt auf mailto zurück.
//  - APP_URL          optional; Link in der Mail
// SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY sind automatisch da.
//
// Deploy:  npx supabase functions deploy send-invite
// (OHNE --no-verify-jwt — der Aufruf braucht ein gültiges Nutzer-Login.)
// =============================================================================

declare const Deno: {
  serve: (handler: (req: Request) => Promise<Response> | Response) => void
  env: { get: (key: string) => string | undefined }
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const INVITE_FROM = Deno.env.get('INVITE_FROM') ?? ''
const APP_URL = Deno.env.get('APP_URL') ?? 'https://doubrawa.github.io/jw-congregation-planner/'

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

/** REST mit Service-Role (umgeht RLS — Zugriffe sind unten explizit gescoped). */
async function rest<T>(path: string): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  })
  if (!res.ok) throw new Error(`REST ${res.status}: ${await res.text()}`)
  return res.json() as Promise<T>
}

/** Eingeloggten Nutzer aus dem mitgeschickten JWT auflösen. */
async function userIdFromRequest(req: Request): Promise<string | null> {
  const auth = req.headers.get('Authorization') ?? ''
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SERVICE_KEY, Authorization: auth },
  })
  if (!res.ok) return null
  const user = (await res.json()) as { id?: string }
  return user.id ?? null
}

function mailText(fn: string, code: string): { subject: string; body: string } {
  return {
    subject: 'Einladung: JW Congregation Planner',
    body:
      `Hallo ${fn},\n\n` +
      `bitte registriere dich in unserer Versammlungs-App:\n${APP_URL}\n\n` +
      `Löse nach der Registrierung diesen Einladungscode ein:\n${code}\n`,
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    if (!INVITE_FROM) return json({ error: 'not-configured' })
    if (!RESEND_API_KEY) return json({ error: 'not-configured' })

    const userId = await userIdFromRequest(req)
    if (!userId) return json({ error: 'unauthorized' }, 401)

    // Nur Admins; alles Weitere ist auf ihre Versammlung beschränkt.
    const membership = await rest<{ congregation_id: string; planner: boolean }[]>(
      `members?select=congregation_id,planner&user_id=eq.${userId}`,
    )
    const member = membership[0]
    if (!member?.planner) return json({ error: 'forbidden' }, 403)

    const payload = (await req.json().catch(() => null)) as {
      invites?: Array<{ personId?: string; code?: string }>
    } | null
    const invites = (payload?.invites ?? []).slice(0, 200)
    if (invites.length === 0) return json({ error: 'keine Einladungen übergeben' }, 400)

    const persons = await rest<{ id: string; fn: string; mail: string }[]>(
      `persons?select=id,fn,mail&congregation_id=eq.${member.congregation_id}`,
    )
    const personById = new Map(persons.map((p) => [p.id, p]))

    let sent = 0
    let skipped = 0
    for (const inv of invites) {
      const person = inv.personId ? personById.get(inv.personId) : undefined
      const code = (inv.code ?? '').trim()
      if (!person || !person.mail || !code) {
        skipped++
        continue
      }
      const { subject, body } = mailText(person.fn, code)
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: INVITE_FROM, to: person.mail, subject, text: body }),
      })
      if (res.ok) {
        sent++
      } else {
        console.error(`Resend ${res.status}: ${await res.text()}`)
        skipped++
      }
    }
    return json({ sent, skipped })
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
})
