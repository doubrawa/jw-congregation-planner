// =============================================================================
// Supabase Edge Function: substitute — Ersatz für Hilfsdienste
// =============================================================================
// Zwei Aktionen (Aufruf mit Nutzer-JWT, supabase.functions.invoke):
//
//   { action: 'seek', congregationId, taskKey }
//     Nach „Ich kann nicht" bei einem Hilfsdienst: benachrichtigt alle
//     qualifizierten Personen (gleicher Dienst, in der Woche nicht abwesend)
//     per In-App-Mitteilung + Web-Push, dass ein Ersatz gesucht wird.
//
//   { action: 'take', congregationId, taskKey }
//     Jemand springt ein: trägt den Aufrufer in den Hilfsdienst-Slot ein
//     (Woche wird aktualisiert), setzt seine Bestätigung, entfernt die alte
//     Bestätigung und informiert Ursprungsperson + Planer (In-App + Push).
//     Läuft mit Service-Role, weil Wochen/Bestätigungen nur der Planer schreibt.
//
// Sicherheit: Aufrufer muss per JWT eingeloggtes Mitglied DIESER Versammlung
// sein; für 'take' zusätzlich für den Dienst qualifiziert. Alle DB-Zugriffe sind
// auf die Versammlung des Aufrufers gescoped.
//
// Secrets: VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT (wie
//   send-reminders), APP_URL optional. SUPABASE_URL / SERVICE_ROLE_KEY automatisch.
//
// Deploy:  npx supabase functions deploy substitute
// (OHNE --no-verify-jwt — der Aufruf braucht ein gültiges Nutzer-Login.)
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

const AUTH = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }

async function restGet<T>(path: string): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: AUTH })
  if (!res.ok) throw new Error(`GET ${path} ${res.status}: ${await res.text()}`)
  return res.json() as Promise<T>
}

async function restSend(method: string, path: string, body?: unknown): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: { ...AUTH, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!res.ok) console.error(`${method} ${path} ${res.status}: ${await res.text()}`)
}

/** Eingeloggten Nutzer aus dem JWT auflösen. */
async function userIdFromRequest(req: Request): Promise<string | null> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SERVICE_KEY, Authorization: req.headers.get('Authorization') ?? '' },
  })
  if (!res.ok) return null
  const user = (await res.json()) as { id?: string }
  return user.id ?? null
}

/* ---- Datenmodell (Teilmengen) ---- */
interface Slot {
  name?: string
  pid?: string
}
interface Meeting {
  date?: string
  helpers?: Record<string, Slot[]>
}
interface Week {
  start?: string
  mid?: Meeting
  we?: Meeting
}
interface Person {
  id: string
  fn: string
  ln: string
  dn: string
  priv: Record<string, boolean>
  absent: number[]
}
interface Member {
  user_id: string
  person_id: string | null
  planner: boolean
}
interface Sub {
  user_id: string
  endpoint: string
  p256dh: string
  auth: string
}

function displayName(p: Person): string {
  return p.dn || `${p.fn} ${p.ln}`.trim()
}

function parseKey(key: string): { wi: number; tab: 'mid' | 'we'; svc: string; pos: number } | null {
  const p = key.split('|')
  if (p.length !== 5 || p[2] !== 'helper' || (p[1] !== 'mid' && p[1] !== 'we')) return null
  return { wi: Number(p[0]), tab: p[1], svc: p[3], pos: Number(p[4]) }
}

function meetingDate(meeting: Meeting | undefined): string {
  return (meeting?.date ?? '').split(' · ').slice(0, 2).join(' · ')
}

async function pushTo(subs: Sub[], title: string, body: string): Promise<void> {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
  const payload = JSON.stringify({ title, body, url: APP_URL })
  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload,
        { TTL: 24 * 3600 },
      )
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode
      if (status === 404 || status === 410) {
        await restSend('DELETE', `push_subscriptions?endpoint=eq.${encodeURIComponent(s.endpoint)}`)
      } else {
        console.error(`web-push ${status}: ${(err as Error).message}`)
      }
    }
  }
}

/** In-App-Mitteilung + Push an eine Menge von Nutzern. */
async function notifyUsers(
  cong: string,
  userIds: string[],
  subsByUser: Map<string, Sub[]>,
  title: string,
  body: string,
): Promise<void> {
  const ids = [...new Set(userIds)]
  if (ids.length === 0) return
  await restSend(
    'POST',
    'notifications',
    ids.map((user_id) => ({ congregation_id: cong, user_id, type: 'zuteilung', title, body })),
  )
  await pushTo(ids.flatMap((u) => subsByUser.get(u) ?? []), title, body)
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const userId = await userIdFromRequest(req)
    if (!userId) return json({ error: 'unauthorized' }, 401)

    const payload = (await req.json().catch(() => null)) as {
      action?: string
      congregationId?: string
      taskKey?: string
    } | null
    const cong = payload?.congregationId ?? ''
    const parts = parseKey(payload?.taskKey ?? '')
    if (!cong || !parts || (payload?.action !== 'seek' && payload?.action !== 'take')) {
      return json({ error: 'bad-request' }, 400)
    }

    const members = await restGet<Member[]>(
      `members?select=user_id,person_id,planner&congregation_id=eq.${cong}`,
    )
    const caller = members.find((m) => m.user_id === userId)
    if (!caller) return json({ error: 'forbidden' }, 403)

    const [weekRows, services, persons, subsRows] = await Promise.all([
      restGet<{ data: Week }[]>(
        `weeks?select=data&congregation_id=eq.${cong}&position=eq.${parts.wi}`,
      ),
      restGet<{ key: string; name: string }[]>(`services?select=key,name&congregation_id=eq.${cong}`),
      restGet<Person[]>(`persons?select=id,fn,ln,dn,priv,absent&congregation_id=eq.${cong}`),
      restGet<Sub[]>(
        `push_subscriptions?select=user_id,endpoint,p256dh,auth&congregation_id=eq.${cong}`,
      ),
    ])
    const week = weekRows[0]?.data
    const meeting = week?.[parts.tab]
    const slot = meeting?.helpers?.[parts.svc]?.[parts.pos]
    if (!week || !meeting || !slot) return json({ error: 'slot-not-found' }, 404)

    const svcName = services.find((s) => s.key === parts.svc)?.name ?? parts.svc
    const date = meetingDate(meeting)
    const qualKey = `svc:${parts.svc}`
    const personById = new Map(persons.map((p) => [p.id, p]))
    const userByPerson = new Map<string, string>()
    for (const m of members) if (m.person_id) userByPerson.set(m.person_id, m.user_id)
    const subsByUser = new Map<string, Sub[]>()
    for (const s of subsRows) subsByUser.set(s.user_id, [...(subsByUser.get(s.user_id) ?? []), s])

    if (payload.action === 'seek') {
      const declinedBy = slot.name ?? ''
      const peers = persons
        .filter(
          (p) => p.priv?.[qualKey] && !p.absent?.includes(parts.wi) && displayName(p) !== declinedBy,
        )
        .map((p) => userByPerson.get(p.id))
        .filter((u): u is string => Boolean(u) && u !== userId)
      await notifyUsers(
        cong,
        peers,
        subsByUser,
        `Ersatz gesucht: ${svcName}`,
        `${date} — ${declinedBy} kann nicht. Wer springt ein?`,
      )
      return json({ ok: true, notified: [...new Set(peers)].length })
    }

    // action === 'take'
    const callerPerson = caller.person_id ? personById.get(caller.person_id) : undefined
    if (!callerPerson || !callerPerson.priv?.[qualKey]) return json({ error: 'not-qualified' }, 403)
    const callerName = displayName(callerPerson)
    const originalName = slot.name ?? ''
    if (originalName === callerName) return json({ ok: true, already: true }) // idempotent

    // Slot auf den Aufrufer umschreiben und die Woche speichern.
    slot.name = callerName
    slot.pid = callerPerson.id
    await restSend('PATCH', `weeks?congregation_id=eq.${cong}&position=eq.${parts.wi}`, { data: week })

    // Alte Bestätigung(en) dieses Slots weg, eigene „bestätigt" setzen.
    await restSend('DELETE', `confirmations?congregation_id=eq.${cong}&task_key=eq.${encodeURIComponent(payload.taskKey!)}`)
    await restSend('POST', 'confirmations', [
      { congregation_id: cong, user_id: userId, task_key: payload.taskKey, status: 'bestätigt' },
    ])

    // Ursprungsperson + Planer informieren.
    const originalPerson = persons.find((p) => displayName(p) === originalName)
    const recipients = [
      ...(originalPerson ? [userByPerson.get(originalPerson.id)].filter(Boolean) as string[] : []),
      ...members.filter((m) => m.planner).map((m) => m.user_id),
    ]
    await notifyUsers(
      cong,
      recipients,
      subsByUser,
      `Ersatz gefunden: ${svcName}`,
      `${date}: ${callerName} übernimmt${originalName ? ` für ${originalName}` : ''}.`,
    )
    return json({ ok: true, taken: true })
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
})
