// =============================================================================
// Supabase Edge Function: substitute — Ersatz für Hilfsdienste
// =============================================================================
// Zwei Aktionen (Aufruf mit Nutzer-JWT, supabase.functions.invoke):
//
//   { action: 'seek', congregationId, taskKey }
//     Nach „Ich kann nicht" bei einem Hilfsdienst: benachrichtigt alle
//     qualifizierten Personen (gleicher Dienst, in der Woche nicht abwesend)
//     per In-App-Mitteilung + Web-Push, dass ein Ersatz gesucht wird.
//     Auslösen darf nur, wer in dem Slot steht oder für ihn abgesagt hat.
//
//   { action: 'take', congregationId, taskKey }
//     Jemand springt ein: trägt den Aufrufer in den Hilfsdienst-Slot ein
//     (Woche wird aktualisiert), setzt seine Bestätigung, entfernt die alte
//     Bestätigung und informiert Ursprungsperson + Planer (In-App + Push).
//     Läuft mit Service-Role, weil Wochen/Bestätigungen nur der Planer schreibt.
//     Der Slot wird bedingt geschrieben (409, wenn jemand schneller war).
//
// Beide Aktionen weisen eine **ausgefallene** Zusammenkunft ab (T30, 409
// 'meeting-cancelled'): dort ist nichts zu vertreten. Die App zeigt solche
// Aufgaben gar nicht erst an — hier landet nur, wer den Ausfall noch nicht
// gesehen hat.
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
import {
  type Abweichungen,
  istAusgefallenFuer,
  meetingDayOffsets,
  personDisplayName,
  versatzMitAbweichung,
} from '../_shared/planung.ts'
import { substituteTexte, TITEL_GEFUNDEN, TITEL_GESUCHT } from './texte.ts'

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

/**
 * Bedingtes PATCH: schreibt nur, wenn der Filter im Pfad noch zutrifft, und
 * meldet zurück, ob dabei eine Zeile getroffen wurde.
 *
 * Das ist ein Vergleiche-und-Tausche in einer einzigen Anweisung — genau das
 * fehlte beim Einspringen. Zwischen Lesen und Schreiben lag nichts: zwei
 * gleichzeitige Übernahmen überschrieben sich, und der zweite Aufruf löschte
 * anschließend per `DELETE confirmations?task_key=…` sogar die Bestätigung des
 * ersten. Der stand danach nirgends mehr, hatte aber „Übernommen" gesehen.
 *
 * `return=representation` ist der Weg, die Trefferzahl zu erfahren: PostgREST
 * liefert die tatsächlich geänderten Zeilen zurück, bei verfehltem Filter ein
 * leeres Array.
 */
async function restPatchIf(path: string, body: unknown): Promise<boolean> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'PATCH',
    headers: { ...AUTH, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    console.error(`PATCH ${path} ${res.status}: ${await res.text()}`)
    return false
  }
  const rows = (await res.json().catch(() => [])) as unknown[]
  return Array.isArray(rows) && rows.length > 0
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
  /**
   * Abweichungen dieser Woche — verlegter Tag, andere Uhrzeit, Ausfall (T30).
   * Ohne sie rechnete die Ersatzsuche am regulären Wochentag und prüfte die
   * Abwesenheit am falschen Datum; `send-reminders` liest sie längst.
   */
  dev?: Abweichungen
}
interface Person {
  id: string
  fn: string
  ln: string
  dn: string
  priv: Record<string, boolean>
}
interface Absence {
  person_id: string | null
  from_date: string
  to_date: string
}

/* `meetingDayOffsets`, `WEEKDAY_OFFSET` und `displayName` stehen jetzt in
   `_shared/planung.ts` — dieselbe Rechnung wie in send-reminders und im
   Client. Getrennte Kopien hatten schon einmal auseinandergefunden (B8/T40). */

/*
 * Der Wochentag-Versatz stand hier als eigene Fassung — und kannte als einzige
 * der drei die Abweichungen nicht (T30). Verlegte der Planer eine
 * Zusammenkunft, prüfte die Ersatzsuche die Abwesenheit am regulären Tag und
 * bot jemanden an, der am echten fehlt. Jetzt gilt `versatzMitAbweichung` aus
 * `_shared/planung.ts`, dieselbe Rangfolge wie im Client und in
 * send-reminders: Abweichung → eigener Termin im `date`-Feld → Rhythmus.
 */

/** ISO-Tag der Zusammenkunft aus dem Wochenstart; null ohne Startdatum. */
function meetingISO(startISO: string | undefined, offset: number): string | null {
  if (!startISO) return null
  const ms = Date.parse(startISO)
  if (Number.isNaN(ms)) return null
  return new Date(ms + offset * 864e5).toISOString().slice(0, 10)
}

/** Fehlt die Person an diesem Tag? Ohne Tag (Vorlagenwoche) nie. */
function abwesendAm(absences: Absence[], personId: string, tagISO: string | null): boolean {
  if (!tagISO) return false
  return absences.some((a) => a.person_id === personId && a.from_date <= tagISO && tagISO <= a.to_date)
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
  /** App-Sprache dieses Geraets (migration-014); null = Deutsch. */
  lang: string | null
}

const displayName = (p: Person): string => personDisplayName(p.fn, p.ln, p.dn)

/**
 * Zerlegt einen Hilfsdienst-Schluessel.
 *
 * Vorn steht seit T66 der **Montag der Woche** ("2026-09-07"). Die frueheren
 * Positions-Schluessel wurden eine Zeit lang mitgelesen; seit Stufe 3 nicht
 * mehr -- migration-018 hat sie umgeschrieben und `weeks.position` geloescht,
 * die Spalte, ueber die sie ueberhaupt zu finden waren. Ein Schluessel ohne
 * Kennung bezeichnet damit keine Woche und wird abgewiesen.
 */
function parseKey(
  key: string,
): { woche: string; tab: 'mid' | 'we'; svc: string; pos: number } | null {
  const p = key.split('|')
  if (p.length !== 5 || p[2] !== 'helper' || (p[1] !== 'mid' && p[1] !== 'we')) return null
  const woche = p[0]
  if (!/^\d{4}-\d{2}-\d{2}$/.test(woche)) return null
  return { woche, tab: p[1], svc: p[3], pos: Number(p[4]) }
}

function meetingDate(meeting: Meeting | undefined): string {
  return (meeting?.date ?? '').split(' · ').slice(0, 2).join(' · ')
}

async function pushTo(
  subs: Sub[],
  titel: (lang: string | null) => string,
  body: string,
  url: string,
): Promise<void> {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
  for (const s of subs) {
    // Titel je Geraet: die Sprache haengt am Abo, nicht am Nutzer.
    const payload = JSON.stringify({ title: titel(s.lang), body, url })
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

/** In-App-Mitteilung + Push (mit Deep-Link-Ziel) an eine Menge von Nutzern. */
async function notifyUsers(
  cong: string,
  userIds: string[],
  subsByUser: Map<string, Sub[]>,
  /** Kanonisch deutscher Titel — Schluessel, unter dem die Glocke uebersetzt. */
  titel: string,
  /** Titel je Geraetesprache fuer den Push. */
  pushTitel: (lang: string | null) => string,
  body: string,
  url: string,
): Promise<void> {
  const ids = [...new Set(userIds)]
  if (ids.length === 0) return
  // In der Glocke steht der kanonisch deutsche Titel; NOTIF_TITLE_KEY bringt
  // ihn beim Anzeigen in die Sprache des Lesers. Der Rumpf besteht aus
  // ' · '-Atomen (Dienst, Termin, Name), die der Fragment-Uebersetzer erledigt.
  await restSend(
    'POST',
    'notifications',
    ids.map((user_id) => ({ congregation_id: cong, user_id, type: 'zuteilung', title: titel, body })),
  )
  await pushTo(ids.flatMap((u) => subsByUser.get(u) ?? []), pushTitel, body, url)
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

    const [weekRows, services, persons, subsRows, congRows, absences] = await Promise.all([
      // `start` aus der **Spalte**, nicht aus dem Blob (T66): die Kennung steht
      // dort, `data.start` ist nur noch Beifang und könnte jederzeit wegfallen.
      restGet<{ start: string; data: Week }[]>(
        `weeks?select=start,data&congregation_id=eq.${cong}&start=eq.${parts.woche}`,
      ),
      restGet<{ key: string; name: string }[]>(`services?select=key,name&congregation_id=eq.${cong}`),
      restGet<Person[]>(`persons?select=id,fn,ln,dn,priv&congregation_id=eq.${cong}`),
      restGet<Sub[]>(
        `push_subscriptions?select=user_id,endpoint,p256dh,auth,lang&congregation_id=eq.${cong}`,
      ),
      restGet<{ meeting_times: string }[]>(`congregations?select=meeting_times&id=eq.${cong}`),
      restGet<Absence[]>(
        `absences?select=person_id,from_date,to_date&congregation_id=eq.${cong}`,
      ),
    ])
    const week = weekRows[0]?.data
    const meeting = week?.[parts.tab]
    const slot = meeting?.helpers?.[parts.svc]?.[parts.pos]
    if (!week || !meeting || !slot) return json({ error: 'slot-not-found' }, 404)
    // Entfällt die Zusammenkunft, gibt es nichts zu vertreten (T30): weder
    // jemanden zu suchen noch einzutragen. Die App zeigt solche Aufgaben gar
    // nicht erst an (`istAusgefallen` in deriveMyTasks) — hier landet also nur,
    // wer den Ausfall noch nicht gesehen hat. Genau dafür ist der Server da.
    if (istAusgefallenFuer(week.dev, parts.tab)) {
      return json({ error: 'meeting-cancelled' }, 409)
    }

    const svcName = services.find((s) => s.key === parts.svc)?.name ?? parts.svc
    const date = meetingDate(meeting)
    // Kalendertag dieser Zusammenkunft — Grundlage der Abwesenheitsprüfung.
    // Ohne ISO-Startdatum (Vorlagenwochen) bleibt sie aus, statt zu raten.
    const tagISO = meetingISO(
      weekRows[0]?.start,
      versatzMitAbweichung(
        week.dev,
        parts.tab,
        meeting.date,
        meetingDayOffsets(congRows[0]?.meeting_times ?? '')[parts.tab],
      ),
    )
    const qualKey = `svc:${parts.svc}`
    const personById = new Map(persons.map((p) => [p.id, p]))
    const userByPerson = new Map<string, string>()
    for (const m of members) if (m.person_id) userByPerson.set(m.person_id, m.user_id)
    const subsByUser = new Map<string, Sub[]>()
    for (const s of subsRows) subsByUser.set(s.user_id, [...(subsByUser.get(s.user_id) ?? []), s])

    const callerPerson = caller.person_id ? personById.get(caller.person_id) : undefined
    const taskKeyEnc = encodeURIComponent(payload.taskKey!)

    if (payload.action === 'seek') {
      // Eine Ersatzsuche verschickt an alle Qualifizierten die Aussage
      // „<Name> kann nicht". Bisher genügte dafür die blosse Mitgliedschaft —
      // jedes Konto konnte das für jeden beliebigen Slot auslösen. Erlaubt ist
      // es dem, der eingeteilt ist, oder wer für genau diesen Slot bereits
      // abgesagt hat (der Slot behält den Namen, kann aber inzwischen neu
      // besetzt sein).
      const istEingeteilt =
        callerPerson !== undefined &&
        (slot.pid === callerPerson.id || slot.name === displayName(callerPerson))
      if (!istEingeteilt) {
        const eigeneAbsage = await restGet<{ user_id: string }[]>(
          `confirmations?select=user_id&congregation_id=eq.${cong}` +
            `&task_key=eq.${taskKeyEnc}&status=eq.verhindert&user_id=eq.${userId}`,
        )
        if (eigeneAbsage.length === 0) return json({ error: 'forbidden' }, 403)
      }

      const declinedBy = slot.name ?? ''
      const peers = persons
        .filter(
          (p) => p.priv?.[qualKey] && !abwesendAm(absences, p.id, tagISO) && displayName(p) !== declinedBy,
        )
        .map((p) => userByPerson.get(p.id))
        .filter((u): u is string => Boolean(u) && u !== userId)
      await notifyUsers(
        cong,
        peers,
        subsByUser,
        TITEL_GESUCHT,
        (lang) => substituteTexte(lang).gesucht,
        // Nur Atome: Dienst, Termin, Name. Der feste Satz („… kann nicht. Wer
        // springt ein?") steckte früher im Rumpf und stand deshalb in allen
        // 33 Sprachen deutsch da — dynamischer Text kommt durch keinen
        // Wörterbuch-Schlüssel.
        [svcName, date, declinedBy].filter(Boolean).join(' · '),
        `${APP_URL}#go=aufgaben`,
      )
      return json({ ok: true, notified: [...new Set(peers)].length })
    }

    // action === 'take'
    if (!callerPerson || !callerPerson.priv?.[qualKey]) return json({ error: 'not-qualified' }, 403)
    const callerName = displayName(callerPerson)
    const originalName = slot.name ?? ''
    if (originalName === callerName) return json({ ok: true, already: true }) // idempotent

    // Slot auf den Aufrufer umschreiben — aber nur, solange dort noch der
    // Name steht, den wir gelesen haben. Sonst war jemand schneller; ohne
    // diese Bedingung überschrieben sich zwei Übernahmen gegenseitig und der
    // Zweite löschte danach die Bestätigung des Ersten.
    slot.name = callerName
    slot.pid = callerPerson.id
    const nameFilter = `data->${parts.tab}->helpers->${encodeURIComponent(parts.svc)}->${parts.pos}->>name`
    const bedingung = originalName
      ? `${nameFilter}=eq.${encodeURIComponent(`"${originalName}"`)}`
      : `${nameFilter}=is.null`
    const geschrieben = await restPatchIf(
      `weeks?congregation_id=eq.${cong}&start=eq.${parts.woche}&${bedingung}`,
      { data: week },
    )
    if (!geschrieben) return json({ error: 'slot-taken' }, 409)

    // Alte Bestätigung(en) dieses Slots weg, eigene „bestätigt" setzen.
    // Ungefährlich, weil oben nur ein einziger Aufruf durchkommt.
    await restSend('DELETE', `confirmations?congregation_id=eq.${cong}&task_key=eq.${taskKeyEnc}`)
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
      TITEL_GEFUNDEN,
      (lang) => substituteTexte(lang).gefunden,
      [svcName, date, callerName].filter(Boolean).join(' · '),
      `${APP_URL}#go=aufgaben`,
    )
    return json({ ok: true, taken: true })
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
})
