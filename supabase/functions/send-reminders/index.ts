// =============================================================================
// Supabase Edge Function: send-reminders  (GERÜST — vor Nutzung konfigurieren!)
// =============================================================================
// Schickt Erinnerungs-E-Mails an Mitglieder mit noch nicht bestätigten
// Zuteilungen in einer kommenden Woche. Läuft serverseitig mit Service-Role,
// damit es alle Versammlungen sehen kann; ausgelöst per Cron (siehe
// supabase/cron-reminders.sql).
//
// SICHERHEIT / STATUS:
//  - **Dry-Run standardmäßig**: ohne `SEND_EMAILS=true` wird NICHTS versendet,
//    sondern nur protokolliert (Vorschau, wer eine Erinnerung bekäme). So kann
//    nichts versehentlich an echte Mitglieder rausgehen.
//  - **Ungetestet E2E**: Der Versandpfad (Resend) wurde noch nicht mit echten
//    Zugangsdaten getestet. Bitte erst im Dry-Run prüfen, dann aktivieren.
//  - Zugriff nur mit korrektem `CRON_SECRET` (Authorization: Bearer <secret>).
//
// Benötigte Secrets (supabase secrets set …):
//  - CRON_SECRET               eigenes Geheimnis; Cron schickt es im Header
//  - RESEND_API_KEY            API-Key des Mail-Anbieters Resend
//  - REMINDER_FROM             Absender, z. B. "Versammlung <no-reply@deine-domain>"
//  - SEND_EMAILS               "true" schaltet den echten Versand frei
// SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY stellt Supabase automatisch bereit.
//
// Deploy:  supabase functions deploy send-reminders --no-verify-jwt
// =============================================================================

declare const Deno: {
  serve: (handler: (req: Request) => Promise<Response> | Response) => void
  env: { get: (key: string) => string | undefined }
}

const URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const REMINDER_FROM = Deno.env.get('REMINDER_FROM') ?? ''
const SEND_EMAILS = Deno.env.get('SEND_EMAILS') === 'true'
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? ''

/** REST-Abfrage gegen PostgREST mit Service-Role (umgeht RLS). */
async function rest<T>(path: string): Promise<T> {
  const res = await fetch(`${URL}/rest/v1/${path}`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  })
  if (!res.ok) throw new Error(`REST ${res.status}: ${await res.text()}`)
  return res.json() as Promise<T>
}

/** Anzeigename wie im Client (helpers.ts): "M. Mustermann". */
function displayName(fn: string, ln: string): string {
  return `${(fn[0] ?? '') + '.'} ${ln}`.trim()
}

interface Slot { name?: string; rolle?: string }
interface Item { title?: string; names?: Slot[] }
interface Section { items?: Item[] }
interface Meeting { sections?: Section[]; helpers?: Record<string, string[]> }
interface Week { start?: string; mid?: Meeting; we?: Meeting }

interface Pending { name: string; label: string }

/** Offene (unbestätigte) Zuteilungen einer Woche, je Anzeigename gesammelt. */
function pendingOfWeek(wi: number, week: Week, conf: Map<string, string>): Pending[] {
  const out: Pending[] = []
  for (const tab of ['mid', 'we'] as const) {
    const meeting = week[tab]
    if (!meeting) continue
    const sections = meeting.sections ?? []
    for (let si = 0; si < sections.length; si++) {
      const items = sections[si].items ?? []
      for (let ii = 0; ii < items.length; ii++) {
        const names = items[ii].names ?? []
        for (let ni = 0; ni < names.length; ni++) {
          const name = names[ni].name
          if (!name) continue
          const key = `${wi}|${tab}|part|${si}|${ii}|${ni}`
          if (conf.get(key) !== 'bestätigt' && conf.get(key) !== 'verhindert') {
            out.push({ name, label: items[ii].title ?? 'Zuteilung' })
          }
        }
      }
    }
    for (const [svc, arr] of Object.entries(meeting.helpers ?? {})) {
      for (let pos = 0; pos < arr.length; pos++) {
        if (!arr[pos]) continue
        const key = `${wi}|${tab}|helper|${svc}|${pos}`
        if (conf.get(key) !== 'bestätigt' && conf.get(key) !== 'verhindert') {
          out.push({ name: arr[pos], label: 'Hilfsdienst' })
        }
      }
    }
  }
  return out
}

async function sendEmail(to: string, subject: string, text: string): Promise<void> {
  if (!SEND_EMAILS) {
    console.log(`[DRY-RUN] E-Mail an ${to}: ${subject}\n${text}`)
    return
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: REMINDER_FROM, to, subject, text }),
  })
  if (!res.ok) console.error(`Resend ${res.status}: ${await res.text()}`)
}

Deno.serve(async (req: Request) => {
  if (CRON_SECRET && req.headers.get('Authorization') !== `Bearer ${CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }
  try {
    const now = Date.now()
    const congs = await rest<{ id: string; settings: { reminders?: { first?: number } } | null }[]>(
      'congregations?select=id,settings',
    )
    let reminded = 0
    for (const cong of congs) {
      const firstDays = cong.settings?.reminders?.first ?? 7
      const [weeks, confs, members, persons] = await Promise.all([
        rest<{ position: number; data: Week }[]>(`weeks?select=position,data&congregation_id=eq.${cong.id}`),
        rest<{ task_key: string; status: string }[]>(`confirmations?select=task_key,status&congregation_id=eq.${cong.id}`),
        rest<{ person_id: string | null; email: string | null }[]>(`members?select=person_id,email&congregation_id=eq.${cong.id}`),
        rest<{ id: string; fn: string; ln: string }[]>(`persons?select=id,fn,ln&congregation_id=eq.${cong.id}`),
      ])
      const conf = new Map(confs.map((c) => [c.task_key, c.status]))
      const emailByName = new Map<string, string>()
      const personById = new Map(persons.map((p) => [p.id, p]))
      for (const m of members) {
        if (!m.person_id || !m.email) continue
        const p = personById.get(m.person_id)
        if (p) emailByName.set(displayName(p.fn, p.ln), m.email)
      }

      const byEmail = new Map<string, Pending[]>()
      for (const w of weeks) {
        const start = w.data?.start ? Date.parse(w.data.start) : NaN
        if (Number.isNaN(start)) continue // ohne ISO-Datum kein Fenster bestimmbar
        const daysAway = (start - now) / 864e5
        if (daysAway < -1 || daysAway > firstDays) continue // nur kommende Woche im Fenster
        for (const pend of pendingOfWeek(w.position, w.data, conf)) {
          const email = emailByName.get(pend.name)
          if (!email) continue
          const list = byEmail.get(email) ?? []
          list.push(pend)
          byEmail.set(email, list)
        }
      }

      for (const [email, list] of byEmail) {
        const body =
          'Bitte bestätige deine Zuteilungen:\n\n' +
          list.map((p) => `• ${p.label}`).join('\n') +
          '\n\nÖffne dazu die App.'
        await sendEmail(email, 'Erinnerung: Zuteilungen bestätigen', body)
        reminded++
      }
    }
    return new Response(JSON.stringify({ ok: true, reminded, dryRun: !SEND_EMAILS }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
