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
//   { invites: [{ personId: string, code: string }, …], lang?: string }  (max. 200)
//   lang = App-Sprachcode der Versammlung; fehlt er, geht die Mail deutsch
//   hinaus (siehe mailText / texte.ts).
// Response 200:
//   { sent: n, skipped: n }          skipped = Person ohne E-Mail/nicht gefunden
//   { error: 'not-configured' }      INVITE_FROM fehlt → Client nutzt mailto
//   { error: '…' }                   sonstige Fehler
//
// Benötigte Secrets:
//  - RESEND_API_KEY   Resend-API-Key (bereits gesetzt)
//  - INVITE_FROM      Absender mit VERIFIZIERTER Domain, z. B.
//                     "Congregation Planner <einladung@deine-domain.de>"
//                     → solange nicht gesetzt, antwortet die Function mit
//                     'not-configured' und die App fällt auf mailto zurück.
//  - APP_URL          optional; Link in der Mail
// SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY sind automatisch da.
//
// Deploy:  npx supabase functions deploy send-invite
// (OHNE --no-verify-jwt — der Aufruf braucht ein gültiges Nutzer-Login.)
// =============================================================================

import { CORS, json, restKlient, wert } from '../_shared/rest.ts'
import { fuellen, inviteTexte } from './texte.ts'

declare const Deno: {
  serve: (handler: (req: Request) => Promise<Response> | Response) => void
  env: { get: (key: string) => string | undefined }
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const INVITE_FROM = Deno.env.get('INVITE_FROM') ?? ''
const APP_URL = Deno.env.get('APP_URL') ?? 'https://doubrawa.github.io/jw-congregation-planner/'

const rest = restKlient(SUPABASE_URL, SERVICE_KEY)

/**
 * Betreff und Rumpf der Einladung — in der Sprache, die der Aufrufer nennt.
 *
 * Bis hierher stand hier ein fester deutscher Text. Für den Empfänger ist die
 * Einladung die **erste** Berührung mit dieser App; er hat noch kein Konto und
 * also auch keine eingestellte Sprache. Der Client schickt deshalb die Sprache
 * der **Versammlung** mit (`congAppCode(state.congLang)`) — dieselbe, in der
 * die Zusammenkünfte gehalten werden.
 *
 * Dass ein Aufrufer hier einen beliebigen Code hineinschreiben könnte, ist
 * ohne Folgen: Er wählt einen Text aus einer festen Tabelle aus, mehr nicht.
 * Unbekanntes fällt auf Deutsch zurück.
 */
function mailText(fn: string, code: string, lang: string | null): { subject: string; body: string } {
  const texte = inviteTexte(lang)
  return {
    subject: texte.subject,
    body: `${fuellen(texte.body, { name: fn, url: APP_URL, code })}\n`,
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    if (!INVITE_FROM) return json({ error: 'not-configured' })
    if (!RESEND_API_KEY) return json({ error: 'not-configured' })

    const userId = await rest.userId(req)
    if (!userId) return json({ error: 'unauthorized' }, 401)

    // Nur Admins; alles Weitere ist auf ihre Versammlung beschränkt.
    const membership = await rest.get<{ congregation_id: string; planner: boolean }[]>(
      `members?select=congregation_id,planner&user_id=eq.${wert(userId)}`,
    )
    const member = membership[0]
    if (!member?.planner) return json({ error: 'forbidden' }, 403)

    const payload = (await req.json().catch(() => null)) as {
      invites?: Array<{ personId?: string; code?: string }>
      /** Sprache der Versammlung (App-Code) — siehe `mailText`. */
      lang?: string
    } | null
    const lang = typeof payload?.lang === 'string' ? payload.lang : null
    const invites = (payload?.invites ?? []).slice(0, 200)
    if (invites.length === 0) return json({ error: 'keine Einladungen übergeben' }, 400)

    const persons = await rest.get<{ id: string; fn: string; mail: string }[]>(
      `persons?select=id,fn,mail&congregation_id=eq.${wert(member.congregation_id)}`,
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
      const { subject, body } = mailText(person.fn, code, lang)
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
    // Nur in die Logs, nicht in die Antwort — dieselbe Linie wie in
    // `substitute`, `send-plan` und `import-week`: Die REST-Fehler tragen Pfad
    // und rohen PostgREST-Rumpf, verraten also Tabellen, Spalten und die
    // Bedingung, an der ein Versuch scheiterte. Diese Function war als einzige
    // der vier noch bei der alten Fassung. Der Aufrufer sieht ohnehin nur, ob
    // der Versand geklappt hat: bei `ok: false` fällt der Client auf das
    // Mail-Programm zurück (`KontoCard`), der Text wird nirgends angezeigt.
    console.error('send-invite:', err instanceof Error ? err.message : String(err))
    return json({ error: 'server-error' }, 500)
  }
})
