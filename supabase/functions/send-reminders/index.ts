// =============================================================================
// Supabase Edge Function: send-reminders (Web-Push)
// =============================================================================
// Erinnert Mitglieder mit unbestätigten Zuteilungen per Web-Push (Browser-
// Benachrichtigung, Ende-zu-Ende verschlüsselt — kein E-Mail-Versand) und legt
// In-App-Mitteilungen (Glocke) an. Läuft serverseitig mit Service-Role,
// ausgelöst täglich per Cron (supabase/cron-reminders.sql).
//
// Logik (Einstellungen → ERINNERUNGEN, congregations.settings.reminders):
//  - `first` Tage vor der Zusammenkunft: erste Erinnerung (Push + Glocke)
//  - `last` Tage vorher: letzte Erinnerung (Push + Glocke; 0 = am Tag selbst)
//  - `repeat`: an allen Tagen dazwischen zusätzlich täglich per Push
//  - bestätigte und verhinderte Zuteilungen lösen nichts aus; ebenso externe
//    Slots (Gastredner/Kreisaufseher) und Gruppen-Rotationen (Reinigung).
//  - Der Zusammenkunftstag wird aus congregations.meeting_times abgeleitet
//    ("Di 19:00 · So 10:00"); ohne erkennbare Wochentage gilt Di (mid)/So (we).
//  - Personen mit fälliger letzter Erinnerung, aber ohne App-Konto, werden den
//    Planern als Sammel-Push gemeldet.
//  - Empfangen kann nur, wer in der App (Profil) Push aktiviert hat
//    (Tabelle push_subscriptions, migration-005). Abgelaufene Abos (404/410)
//    werden automatisch gelöscht.
//
// SICHERHEIT / STATUS:
//  - **Dry-Run standardmäßig**: ohne Secret `SEND_PUSH=true` wird nichts
//    versendet und nichts geschrieben — die Antwort listet die Vorschau.
//  - Zugriff nur mit korrektem `CRON_SECRET` (Authorization: Bearer <secret>).
//
// Benötigte Secrets (npx supabase secrets set NAME=wert --project-ref …):
//  - CRON_SECRET        eigenes Geheimnis; Cron schickt es im Authorization-Header
//  - VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY   Web-Push-Schlüsselpaar (public =
//                       Konstante in src/lib/push.ts)
//  - VAPID_SUBJECT      Kontakt-URI, z. B. "mailto:…"
//  - SEND_PUSH          "true" schaltet echten Versand + Glocken-Mitteilungen frei
//  - APP_URL            optional; Link, den die Benachrichtigung öffnet
// SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY stellt Supabase automatisch bereit.
//
// Deploy:  npx supabase functions deploy send-reminders --no-verify-jwt
// =============================================================================

// @ts-expect-error npm-Import wird von der Deno-Edge-Runtime aufgelöst
import webpush from 'npm:web-push@3.6.7'

declare const Deno: {
  serve: (handler: (req: Request) => Promise<Response> | Response) => void
  env: { get: (key: string) => string | undefined }
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') ?? ''
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:noreply@example.org'
const APP_URL = Deno.env.get('APP_URL') ?? 'https://doubrawa.github.io/jw-congregation-planner/'
const SEND_PUSH = Deno.env.get('SEND_PUSH') === 'true'
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? ''

/** REST-Abfrage gegen PostgREST mit Service-Role (umgeht RLS). */
async function rest<T>(path: string): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  })
  if (!res.ok) throw new Error(`REST ${res.status}: ${await res.text()}`)
  return res.json() as Promise<T>
}

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

/** Abgelaufenes Push-Abo entfernen (Push-Service meldete 404/410). */
async function restDeleteSubscription(id: string): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?id=eq.${id}`, {
    method: 'DELETE',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  })
  if (!res.ok) console.error(`REST DELETE push_subscriptions ${res.status}`)
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
interface SubscriptionRow {
  id: string
  user_id: string
  endpoint: string
  p256dh: string
  auth: string
}

/** Rollen, die von außen kommen — kein Bestätigungs-Flow (wie planning.ts). */
const SKIP_ROLE = /Gastredner|Kreisaufseher/

/** Anzeigename wie im Client (helpers.ts): dn oder voller Name. */
function personDisplayName(fn: string, ln: string, dn: string): string {
  return dn || `${fn} ${ln}`.trim()
}

/** "Dienstag, 8. September · 19:00 · Saal" → "Dienstag, 8. September · 19:00". */
function taskDate(meeting: Meeting): string {
  return (meeting.date ?? '').split(' · ').slice(0, 2).join(' · ')
}

/* ---- Terminberechnung ---------------------------------------------------- */

const DAY_OFFSET: Record<string, number> = { Mo: 0, Di: 1, Mi: 2, Do: 3, Fr: 4, Sa: 5, So: 6 }

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
  name: string
  label: string
}

/** Unbestätigte Zuteilungen; task_key-Schema wie partTaskKey/helperTaskKey. */
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
          label: rolle && !rolle.startsWith('mit') ? `${title} · ${rolle}` : title,
        })
      }
    }
  }
  for (const svc of services) {
    if (svc.groups) continue
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

interface Push {
  userId: string
  title: string
  body: string
}

Deno.serve(async (req: Request) => {
  if (CRON_SECRET && req.headers.get('Authorization') !== `Bearer ${CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }
  try {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

    const now = new Date()
    const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())

    const congs = await rest<
      {
        id: string
        meeting_times: string
        settings: { reminders?: Partial<Reminders> } | null
      }[]
    >('congregations?select=id,meeting_times,settings')

    let sent = 0
    let expired = 0
    const preview: Push[] = []
    const notifRows: unknown[] = []
    const sendQueue: Array<{ push: Push; subs: SubscriptionRow[] }> = []

    for (const cong of congs) {
      const rem: Reminders = {
        first: cong.settings?.reminders?.first ?? 7,
        last: cong.settings?.reminders?.last ?? 1,
        repeat: cong.settings?.reminders?.repeat ?? true,
      }
      const offsets = meetingDayOffsets(cong.meeting_times)

      const [weeks, confs, members, persons, services, subs] = await Promise.all([
        rest<{ data: Week }[]>(
          `weeks?select=position,data&congregation_id=eq.${cong.id}&order=position.asc`,
        ),
        rest<{ task_key: string; status: string }[]>(
          `confirmations?select=task_key,status&congregation_id=eq.${cong.id}`,
        ),
        rest<{ user_id: string; person_id: string | null; planner: boolean }[]>(
          `members?select=user_id,person_id,planner&congregation_id=eq.${cong.id}`,
        ),
        rest<{ id: string; fn: string; ln: string; dn: string }[]>(
          `persons?select=id,fn,ln,dn&congregation_id=eq.${cong.id}`,
        ),
        rest<ServiceRow[]>(
          `services?select=key,name,count,groups&congregation_id=eq.${cong.id}&order=position.asc`,
        ),
        rest<SubscriptionRow[]>(
          `push_subscriptions?select=id,user_id,endpoint,p256dh,auth&congregation_id=eq.${cong.id}`,
        ),
      ])

      const conf = new Map(confs.map((c) => [c.task_key, c.status]))
      const personById = new Map(persons.map((p) => [p.id, p]))
      const userByName = new Map<string, string>()
      for (const m of members) {
        const p = m.person_id ? personById.get(m.person_id) : undefined
        if (p) userByName.set(personDisplayName(p.fn, p.ln, p.dn), m.user_id)
      }
      const subsByUser = new Map<string, SubscriptionRow[]>()
      for (const s of subs) {
        subsByUser.set(s.user_id, [...(subsByUser.get(s.user_id) ?? []), s])
      }

      const entriesByUser = new Map<string, string[]>()
      const mainByUser = new Map<string, string[]>() // Glocke nur an first/last-Tagen
      const unreachable: string[] = []

      weeks.forEach((row, wi) => {
        const week = row.data
        if (!week?.start) return
        for (const tab of ['mid', 'we'] as const) {
          const meeting = week[tab]
          if (!meeting) continue
          const days = daysUntil(week.start, offsets[tab], todayUTC)
          if (days === null) continue
          const kind = dueKind(rem, days)
          if (!kind) continue
          for (const pend of pendingOfMeeting(wi, tab, meeting, services, conf)) {
            const entry = `${taskDate(meeting)}: ${pend.label}`
            const userId = userByName.get(pend.name)
            if (userId) {
              entriesByUser.set(userId, [...(entriesByUser.get(userId) ?? []), entry])
              if (kind === 'main') {
                mainByUser.set(userId, [...(mainByUser.get(userId) ?? []), entry])
              }
            } else if (days === rem.last) {
              unreachable.push(`${pend.name} — ${entry}`)
            }
          }
        }
      })

      for (const [userId, entries] of entriesByUser) {
        const push: Push = {
          userId,
          title: 'Erinnerung: Zuteilung bestätigen',
          body: entries.join(' · '),
        }
        preview.push(push)
        sendQueue.push({ push, subs: subsByUser.get(userId) ?? [] })
      }
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
        const push = {
          title: 'Unbestätigte Zuteilungen (nicht erreichbar)',
          body: unreachable.join(' · '),
        }
        for (const m of members) {
          if (!m.planner) continue
          const p: Push = { userId: m.user_id, ...push }
          preview.push(p)
          sendQueue.push({ push: p, subs: subsByUser.get(m.user_id) ?? [] })
        }
      }
    }

    if (SEND_PUSH) {
      for (const { push, subs } of sendQueue) {
        const payload = JSON.stringify({ title: push.title, body: push.body, url: APP_URL })
        for (const sub of subs) {
          try {
            await webpush.sendNotification(
              { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
              payload,
              { TTL: 24 * 3600 },
            )
            sent++
          } catch (err) {
            const status = (err as { statusCode?: number }).statusCode
            if (status === 404 || status === 410) {
              await restDeleteSubscription(sub.id)
              expired++
            } else {
              console.error(`web-push ${status}: ${(err as Error).message}`)
            }
          }
        }
      }
      await restInsert('notifications', notifRows)
    }

    return new Response(
      JSON.stringify({
        ok: true,
        dryRun: !SEND_PUSH,
        pushes: SEND_PUSH ? sent : preview.length,
        expired,
        notifications: notifRows.length,
        // Vorschau nur im Dry-Run — zum gefahrlosen Testen per curl
        preview: SEND_PUSH ? undefined : preview,
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
