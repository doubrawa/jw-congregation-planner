// =============================================================================
// Supabase Edge Function: send-reminders
// =============================================================================
// Schickt Erinnerungs-E-Mails an Mitglieder mit noch nicht bestätigten
// Zuteilungen und legt In-App-Mitteilungen (Glocke) an. Läuft serverseitig
// mit Service-Role, damit sie alle Versammlungen sieht; ausgelöst täglich per
// Cron (supabase/cron-reminders.sql).
//
// Logik (Einstellungen → ERINNERUNGEN, congregations.settings.reminders):
//  - `first` Tage vor der Zusammenkunft: erste Erinnerung (E-Mail + Glocke)
//  - `last` Tage vorher: letzte Erinnerung (E-Mail + Glocke; 0 = am Tag selbst)
//  - `repeat`: an allen Tagen dazwischen zusätzlich täglich per E-Mail
//  - bestätigte und verhinderte Zuteilungen lösen nichts aus; ebenso externe
//    Slots (Gastredner/Kreisaufseher) und Gruppen-Rotationen (Reinigung).
//  - Der Zusammenkunftstag wird aus congregations.meeting_times abgeleitet
//    ("Di 19:00 · So 10:00" → Di bzw. So der Programmwoche); ohne erkennbare
//    Wochentage gilt Di (mid) / So (we).
//  - Personen mit fälliger letzter Erinnerung, aber ohne App-Konto (keine
//    members-Verknüpfung) landen in einer Sammel-Mail an alle Planer.
//
// SICHERHEIT / STATUS:
//  - **Dry-Run standardmäßig**: ohne Secret `SEND_EMAILS=true` wird nichts
//    versendet und nichts in die DB geschrieben — die Antwort listet als
//    Vorschau auf, welche Mails rausgegangen wären.
//  - Zugriff nur mit korrektem `CRON_SECRET` (Authorization: Bearer <secret>).
//
// Benötigte Secrets (npx supabase secrets set NAME=wert --project-ref …):
//  - CRON_SECRET      eigenes Geheimnis; Cron schickt es im Authorization-Header
//  - RESEND_API_KEY   API-Key des Mail-Anbieters Resend
//  - REMINDER_FROM    optional; Standard "onboarding@resend.dev" (Resend-Testmodus:
//                     nur an die eigene Resend-Konto-Adresse zustellbar — für alle
//                     Mitglieder eigene Domain bei Resend verifizieren)
//  - SEND_EMAILS      "true" schaltet echten Versand + Glocken-Mitteilungen frei
// SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY stellt Supabase automatisch bereit.
//
// Deploy:  npx supabase functions deploy send-reminders --no-verify-jwt
// =============================================================================

declare const Deno: {
  serve: (handler: (req: Request) => Promise<Response> | Response) => void
  env: { get: (key: string) => string | undefined }
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const REMINDER_FROM =
  Deno.env.get('REMINDER_FROM') ?? 'JW Congregation Planner <onboarding@resend.dev>'
const APP_URL = Deno.env.get('APP_URL') ?? 'https://doubrawa.github.io/jw-congregation-planner/'
const SEND_EMAILS = Deno.env.get('SEND_EMAILS') === 'true'
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? ''

/** REST-Abfrage gegen PostgREST mit Service-Role (umgeht RLS). */
async function rest<T>(path: string): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  })
  if (!res.ok) throw new Error(`REST ${res.status}: ${await res.text()}`)
  return res.json() as Promise<T>
}

/** REST-Insert (In-App-Mitteilungen); Fehler nur loggen, Mails gehen vor. */
async function restInsert(path: string, rows: unknown[]): Promise<void> {
  if (rows.length === 0) return
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(rows),
  })
  if (!res.ok) console.error(`REST POST ${path} ${res.status}: ${await res.text()}`)
}

/* ---- Datenmodell (Teilmengen der Client-Typen aus src/data/types.ts) ---- */

interface Slot {
  name?: string
  rolle?: string
}
interface Item {
  song?: string
  title?: string
  names?: Slot[]
}
interface Section {
  items?: Item[]
}
interface Meeting {
  date?: string
  sections?: Section[]
  helpers?: Record<string, string[]>
}
interface Week {
  start?: string
  mid?: Meeting
  we?: Meeting
}
interface ServiceRow {
  key: string
  name: string
  count: number
  groups: boolean
}
interface Reminders {
  first: number
  last: number
  repeat: boolean
}

/** Rollen, die von außen kommen — kein Bestätigungs-Flow (wie planning.ts). */
const SKIP_ROLE = /Gastredner|Kreisaufseher/

/** Anzeigename wie im Client (helpers.ts): "M. Mustermann". */
function displayName(fn: string, ln: string): string {
  return `${(fn[0] ?? '') + '.'} ${ln}`.trim()
}

/** "Dienstag, 8. September · 19:00 · Saal" → "Dienstag, 8. September · 19:00". */
function taskDate(meeting: Meeting): string {
  return (meeting.date ?? '').split(' · ').slice(0, 2).join(' · ')
}

/* ---- Terminberechnung ---------------------------------------------------- */

/** Wochentag-Offsets ab Wochenstart (Montag). */
const DAY_OFFSET: Record<string, number> = { Mo: 0, Di: 1, Mi: 2, Do: 3, Fr: 4, Sa: 5, So: 6 }

/**
 * Zusammenkunftstage aus congregations.meeting_times ("Di 19:00 · So 10:00"):
 * erster erkannter Wochentag = unter der Woche, zweiter = Wochenende.
 */
function meetingDayOffsets(meetingTimes: string): { mid: number; we: number } {
  const found = [...meetingTimes.matchAll(/\b(Mo|Di|Mi|Do|Fr|Sa|So)\b/g)].map(
    (m) => DAY_OFFSET[m[1]],
  )
  return { mid: found[0] ?? 1, we: found[1] ?? 6 }
}

/** Ganze Tage bis zur Zusammenkunft (UTC-Datumsarithmetik; negativ = vorbei). */
function daysUntil(startISO: string, dayOffset: number, todayUTC: number): number | null {
  const start = Date.parse(startISO)
  if (Number.isNaN(start)) return null
  return Math.round((start + dayOffset * 864e5 - todayUTC) / 864e5)
}

/** Fälligkeit laut Einstellungen: Haupttermin (first/last) oder Wiederholung. */
function dueKind(rem: Reminders, days: number): 'main' | 'repeat' | null {
  if (days < 0) return null
  if (days === rem.first || days === rem.last) return 'main'
  if (rem.repeat && days < rem.first) return 'repeat'
  return null
}

/* ---- Offene Zuteilungen -------------------------------------------------- */

interface Pending {
  name: string // Anzeigename der Person
  label: string // Aufgabe, z. B. "Nach Schätzen graben · Leser" oder "Ton"
}

/**
 * Unbestätigte Zuteilungen einer Zusammenkunft. task_key-Schema identisch zu
 * partTaskKey/helperTaskKey (src/data/planning.ts); wi = Wochenindex in der
 * nach position sortierten Wochenliste (wie der Client lädt).
 */
function pendingOfMeeting(
  wi: number,
  tab: 'mid' | 'we',
  meeting: Meeting,
  services: ServiceRow[],
  conf: Map<string, string>,
): Pending[] {
  const out: Pending[] = []
  const sections = meeting.sections ?? []
  for (let si = 0; si < sections.length; si++) {
    const items = sections[si].items ?? []
    for (let ii = 0; ii < items.length; ii++) {
      const item = items[ii]
      if ('song' in item) continue
      const names = item.names ?? []
      for (let ni = 0; ni < names.length; ni++) {
        const slot = names[ni]
        if (!slot.name || SKIP_ROLE.test(slot.rolle ?? '')) continue
        if (conf.has(`${wi}|${tab}|part|${si}|${ii}|${ni}`)) continue
        const rolle = slot.rolle ?? ''
        const title = item.title ?? 'Zuteilung'
        out.push({
          name: slot.name,
          label: rolle && !rolle.startsWith('mit ') ? `${title} · ${rolle}` : title,
        })
      }
    }
  }
  for (const svc of services) {
    if (svc.groups) continue // Gruppen-Rotation hat keine persönliche Aufgabe
    const arr = meeting.helpers?.[svc.key] ?? []
    for (let pos = 0; pos < svc.count; pos++) {
      if (!arr[pos]) continue
      if (conf.has(`${wi}|${tab}|helper|${svc.key}|${pos}`)) continue
      out.push({ name: arr[pos], label: svc.name })
    }
  }
  return out
}

/* ---- Versand ------------------------------------------------------------- */

interface Mail {
  to: string
  subject: string
  body: string
}

async function sendEmail(mail: Mail): Promise<boolean> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: REMINDER_FROM, to: mail.to, subject: mail.subject, text: mail.body }),
  })
  if (!res.ok) console.error(`Resend ${res.status}: ${await res.text()}`)
  return res.ok
}

function memberMail(to: string, entries: string[]): Mail {
  return {
    to,
    subject: 'Erinnerung: Bitte Zuteilung bestätigen',
    body:
      'Hallo,\n\ndu hast noch unbestätigte Zuteilungen:\n\n' +
      entries.map((e) => `• ${e}`).join('\n') +
      `\n\nBitte bestätige sie in der App:\n${APP_URL}\n\n` +
      'Diese Erinnerung wurde automatisch vom JW Congregation Planner verschickt.',
  }
}

function plannerMail(to: string, entries: string[]): Mail {
  return {
    to,
    subject: 'Unbestätigte Zuteilungen ohne App-Konto',
    body:
      'Hallo,\n\nfolgende Zuteilungen stehen kurz bevor, sind unbestätigt und die\n' +
      'Person ist per App nicht erreichbar (kein verknüpftes Konto):\n\n' +
      entries.map((e) => `• ${e}`).join('\n') +
      '\n\nBitte persönlich nachfragen oder in der App neu zuteilen.\n' +
      `${APP_URL}\n\n` +
      'Diese Nachricht wurde automatisch vom JW Congregation Planner verschickt.',
  }
}

/* ---- Hauptlauf ------------------------------------------------------------ */

Deno.serve(async (req: Request) => {
  if (CRON_SECRET && req.headers.get('Authorization') !== `Bearer ${CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }
  try {
    const now = new Date()
    const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())

    const congs = await rest<
      {
        id: string
        meeting_times: string
        settings: { reminders?: Partial<Reminders> } | null
      }[]
    >('congregations?select=id,meeting_times,settings')

    const mails: Mail[] = []
    const notifRows: unknown[] = []

    for (const cong of congs) {
      const rem: Reminders = {
        first: cong.settings?.reminders?.first ?? 7,
        last: cong.settings?.reminders?.last ?? 1,
        repeat: cong.settings?.reminders?.repeat ?? true,
      }
      const offsets = meetingDayOffsets(cong.meeting_times)

      const [weeks, confs, members, persons, services] = await Promise.all([
        rest<{ data: Week }[]>(
          `weeks?select=position,data&congregation_id=eq.${cong.id}&order=position.asc`,
        ),
        rest<{ task_key: string; status: string }[]>(
          `confirmations?select=task_key,status&congregation_id=eq.${cong.id}`,
        ),
        rest<{ user_id: string; person_id: string | null; planner: boolean; email: string }[]>(
          `members?select=user_id,person_id,planner,email&congregation_id=eq.${cong.id}`,
        ),
        rest<{ id: string; fn: string; ln: string }[]>(
          `persons?select=id,fn,ln&congregation_id=eq.${cong.id}`,
        ),
        rest<ServiceRow[]>(
          `services?select=key,name,count,groups&congregation_id=eq.${cong.id}&order=position.asc`,
        ),
      ])

      // bestätigt wie verhindert beendet Erinnerungen (Planer sieht verhindert in der App)
      const conf = new Map(confs.map((c) => [c.task_key, c.status]))
      const personById = new Map(persons.map((p) => [p.id, p]))
      const memberByName = new Map<string, { userId: string; email: string }>()
      for (const m of members) {
        const p = m.person_id ? personById.get(m.person_id) : undefined
        if (p && m.email) memberByName.set(displayName(p.fn, p.ln), { userId: m.user_id, email: m.email })
      }

      const entriesByEmail = new Map<string, string[]>()
      const mainByUser = new Map<string, string[]>() // Glocke nur an first/last-Tagen
      const unreachable: string[] = []

      weeks.forEach((row, wi) => {
        const week = row.data
        if (!week?.start) return // ohne ISO-Startdatum kein Termin bestimmbar
        for (const tab of ['mid', 'we'] as const) {
          const meeting = week[tab]
          if (!meeting) continue
          const days = daysUntil(week.start, offsets[tab], todayUTC)
          if (days === null) continue
          const kind = dueKind(rem, days)
          if (!kind) continue
          for (const pend of pendingOfMeeting(wi, tab, meeting, services, conf)) {
            const entry = `${taskDate(meeting)}: ${pend.label}`
            const member = memberByName.get(pend.name)
            if (member) {
              entriesByEmail.set(member.email, [...(entriesByEmail.get(member.email) ?? []), entry])
              if (kind === 'main') {
                mainByUser.set(member.userId, [...(mainByUser.get(member.userId) ?? []), entry])
              }
            } else if (days === rem.last) {
              unreachable.push(`${pend.name} — ${entry}`)
            }
          }
        }
      })

      for (const [email, entries] of entriesByEmail) mails.push(memberMail(email, entries))
      for (const [userId, entries] of mainByUser) {
        notifRows.push({
          congregation_id: cong.id,
          user_id: userId,
          type: 'erinnerung',
          title: 'Erinnerung: Zuteilung bestätigen',
          body: entries.join(' · '),
        })
      }
      if (unreachable.length > 0) {
        for (const m of members) {
          if (m.planner && m.email) mails.push(plannerMail(m.email, unreachable))
        }
      }
    }

    let sent = 0
    if (SEND_EMAILS) {
      for (const mail of mails) if (await sendEmail(mail)) sent++
      await restInsert('notifications', notifRows)
    } else {
      for (const mail of mails) console.log(`[DRY-RUN] E-Mail an ${mail.to}: ${mail.subject}`)
    }

    return new Response(
      JSON.stringify({
        ok: true,
        dryRun: !SEND_EMAILS,
        emails: SEND_EMAILS ? sent : mails.length,
        notifications: notifRows.length,
        // Vorschau nur im Dry-Run — zum gefahrlosen Testen per curl
        preview: SEND_EMAILS ? undefined : mails,
      }),
      { headers: { 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
})
