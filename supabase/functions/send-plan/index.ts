// =============================================================================
// Supabase Edge Function: send-plan — „Plan senden"
// =============================================================================
// Zwei Aktionen (Aufruf mit Nutzer-JWT, supabase.functions.invoke):
//
//   { action: 'plan', weekStart }
//     Der Planer hat eine Woche fertig und gibt sie frei. Jede eingeteilte
//     Person bekommt **eine** Nachricht mit allen ihren Aufgaben dieser Woche
//     (Glocke + Web-Push). Verschickt wird nur, was noch nicht verschickt war —
//     das Versand-Tagebuch `assignment_log` (migration-024) merkt sich das.
//
//   { action: 'entzug', taskKey, name }
//     Eine bereits **bestätigte** Zuteilung wurde zurückgezogen oder verlegt.
//     Die betroffene Person erfährt es sofort. Ohne diesen Weg bereitete
//     jemand weiter etwas vor, das ihm längst genommen war.
//
// WARUM ES DIESE FUNCTION GIBT. Bis hierher erfuhr die eingeteilte Person von
// ihrer Zuteilung überhaupt nichts: die Mitteilung „Zuteilung gesendet" ging an
// die **Planer**, nicht an sie (in T74 gemessen und vertagt). Sie erfuhr es
// frühestens über die zeitliche Erinnerung, also `first` Tage vor der
// Zusammenkunft. Wer drei Wochen im Voraus plante, dessen Leute wussten zwei
// Wochen lang nichts — außer sie öffneten die App von sich aus.
//
// WARUM AUF KNOPFDRUCK und nicht bei jedem Klick: Planen ist eine Sitzung, kein
// Einzelakt. Eine Woche hat gut 35 Plätze; bei sofortigem Versand ginge für
// jedes Umsortieren eine Nachricht hinaus. Der Planer entscheidet, wann der
// Plan steht.
//
// Sicherheit: Aufrufer muss per JWT eingeloggter **Planer** sein. Die
// Versammlung kommt aus seiner Mitgliedszeile, nie aus dem Rumpf; jeder Wert
// geht durch `wert()` in den Pfad (sonst beendet ein `#` die Abfrage still).
//
// Secrets: VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT (wie
//   send-reminders), APP_URL optional. SUPABASE_URL / SERVICE_ROLE_KEY automatisch.
//
// Deploy:  npx supabase functions deploy send-plan
// (OHNE --no-verify-jwt — der Aufruf braucht ein gültiges Nutzer-Login.)
// =============================================================================

// @ts-expect-error npm-Import wird von der Deno-Edge-Runtime aufgelöst
import webpush from 'npm:web-push@3.6.7'
import {
  istAusgefallenFuer,
  meetingDayOffsets,
  meetingTimesOf,
  personDisplayName,
  versatzMitAbweichung,
  zeitMitAbweichung,
} from '../_shared/planung.ts'
import {
  type Eintrag,
  type FsInstance,
  kanonisch,
  nachSprache,
  type Pending,
  pendingOfFsWeek,
  pendingOfMeeting,
  type ServiceRow,
  type SubscriptionRow,
  tagebuchSchluessel,
  terminText,
  uebersetzerFuer,
  uebersetzt,
  type Week,
} from '../_shared/zuteilungen.ts'
import { bibelbuecherLaden } from '../_shared/i18n/translate.ts'
import { planTexte, TITEL_ENTZUG, TITEL_ZUTEILUNG } from './texte.ts'

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

/**
 * Wie viele Push-Zustellungen gleichzeitig unterwegs sein duerfen.
 *
 * Nicht unbegrenzt: die Push-Dienste drosseln, und ein ganzer Schwung offener
 * Verbindungen brachte der Edge Function nichts als Fehler. Gebuendelt zu
 * zehnt bleibt die Laufzeit im Rahmen, ohne dass jemand gedrosselt wird.
 */
const PUSH_PARALLEL = 10

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

/**
 * Wert für einen PostgREST-Filter im Pfad.
 *
 * Ungekodiert **beendet ein `#` die Abfrage**: Der URL-Parser macht alles
 * dahinter zum Fragment, und `fetch` sendet das nie mit — der eingrenzende
 * Filter fällt dann weg. Deshalb geht hier kein Wert roh in einen Pfad, auch
 * keiner, der aus der eigenen Datenbank kommt (Aufgaben-Schlüssel enthalten
 * `|`, Namen können alles enthalten).
 */
const wert = (v: string | number): string => encodeURIComponent(String(v))

async function restGet<T>(path: string): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: AUTH })
  if (!res.ok) throw new Error(`GET ${path} ${res.status}: ${await res.text()}`)
  return res.json() as Promise<T>
}

async function restInsert(path: string, rows: unknown[]): Promise<void> {
  if (rows.length === 0) return
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'POST',
    headers: { ...AUTH, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify(rows),
  })
  if (!res.ok) console.error(`POST ${path} ${res.status}: ${await res.text()}`)
}

async function userIdFromRequest(req: Request): Promise<string | null> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SERVICE_KEY, Authorization: req.headers.get('Authorization') ?? '' },
  })
  if (!res.ok) return null
  const user = (await res.json()) as { id?: string }
  return user.id ?? null
}

interface MemberRow {
  user_id: string
  person_id: string | null
  planner: boolean
}
interface PersonRow {
  id: string
  fn: string
  ln: string
  dn: string
}

/* ---- Versand ------------------------------------------------------------- */

interface Empfaenger {
  userId: string
  subs: SubscriptionRow[]
}

/**
 * Eine Nachricht an einen Empfänger: Glocke (kanonisch deutsch) und Push (je
 * Gerätesprache eigens gebaut).
 *
 * `taskKey` wird nur gesetzt, wenn die Nachricht **genau eine** Aufgabe
 * betrifft — dann macht die Glocke daraus eine, auf der man gleich bestätigen
 * kann (`notif.taskId` in NotificationsPanel). Bei mehreren Aufgaben zeigte ein
 * einzelner Knopf auf eine willkürliche davon.
 */
interface Nachricht {
  empfaenger: Empfaenger
  titelDe: string
  titelFuer: (lang: string | null) => string
  eintraege: Eintrag[]
  taskKey?: string
  ziel: string
}

async function pushZustellen(
  subs: SubscriptionRow[],
  titel: string,
  body: string,
  url: string,
): Promise<number> {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return 0
  let sent = 0
  for (let i = 0; i < subs.length; i += PUSH_PARALLEL) {
    const ergebnisse = await Promise.all(
      subs.slice(i, i + PUSH_PARALLEL).map(async (s) => {
        const payload = JSON.stringify({ title: titel, body, url })
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            payload,
            { TTL: 24 * 3600 },
          )
          return true
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode
          if (status === 404 || status === 410) {
            await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?id=eq.${wert(s.id)}`, {
              method: 'DELETE',
              headers: AUTH,
            })
          } else {
            console.error(`web-push ${status}: ${(err as Error).message}`)
          }
          return false
        }
      }),
    )
    sent += ergebnisse.filter(Boolean).length
  }
  return sent
}

/**
 * Glocken-Zeilen und Push-Nachrichten hinausschicken.
 *
 * Die Glocke geht **gesammelt** in einem Insert hinaus, der Push je Empfänger
 * und Sprache. Reihenfolge mit Absicht: erst die Glocke, dann der Push. Wer auf
 * die Benachrichtigung tippt, landet in einer App, in der die Zeile schon
 * steht — andersherum käme er auf einen leeren Stand.
 */
async function verschicken(
  cong: string,
  nachrichten: Nachricht[],
): Promise<{ personen: number; push: number }> {
  const notifRows = nachrichten.map((n) => ({
    congregation_id: cong,
    user_id: n.empfaenger.userId,
    type: 'zuteilung',
    title: n.titelDe,
    body: n.eintraege.map(kanonisch).join(' · '),
    ...(n.taskKey ? { task_key: n.taskKey } : {}),
  }))
  await restInsert('notifications', notifRows)

  if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
  }
  const uebersetzer = uebersetzerFuer()
  let push = 0
  for (const n of nachrichten) {
    // Je Sprache ein eigener Versand: der Text steht fest, sobald die Nachricht
    // das Gerät erreicht. Wer Geräte in zwei Sprachen hat, bekommt auf jedem
    // die passende.
    for (const [lang, subs] of nachSprache(n.empfaenger.subs)) {
      if (subs.length === 0) continue
      const tr = uebersetzer(lang)
      push += await pushZustellen(
        subs,
        n.titelFuer(lang),
        n.eintraege.map((e) => uebersetzt(e, tr)).join(' · '),
        n.ziel,
      )
    }
  }
  return { personen: notifRows.length, push }
}

/* ---- Handler ------------------------------------------------------------- */

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const userId = await userIdFromRequest(req)
    if (!userId) return json({ error: 'unauthorized' }, 401)

    const payload = (await req.json().catch(() => null)) as {
      action?: string
      weekStart?: string
      taskKey?: string
      name?: string
      /** Nur bei 'entzug': Bezeichnung und Termin des Platzes, kanonisch deutsch. */
      label?: string
      datum?: string
    } | null
    if (payload?.action !== 'plan' && payload?.action !== 'entzug') {
      return json({ error: 'bad-request' }, 400)
    }

    // Die Versammlung stammt aus der Mitgliedszeile des Aufrufers, nie aus dem
    // Rumpf — sonst schickte ein beliebiges Konto Nachrichten in fremde
    // Versammlungen. Und schreiben darf hier nur ein Planer.
    const eigene = await restGet<MemberRow[]>(
      `members?select=user_id,person_id,planner,congregation_id&user_id=eq.${wert(userId)}`,
    )
    const mich = eigene[0] as (MemberRow & { congregation_id?: string }) | undefined
    const cong = mich?.congregation_id
    if (!cong) return json({ error: 'no-congregation' }, 403)
    if (!mich?.planner) return json({ error: 'forbidden' }, 403)

    const [members, persons, subs] = await Promise.all([
      restGet<MemberRow[]>(`members?select=user_id,person_id,planner&congregation_id=eq.${wert(cong)}`),
      restGet<PersonRow[]>(`persons?select=id,fn,ln,dn&congregation_id=eq.${wert(cong)}`),
      restGet<SubscriptionRow[]>(
        `push_subscriptions?select=id,user_id,endpoint,p256dh,auth,lang&congregation_id=eq.${wert(cong)}`,
      ),
    ])

    const personById = new Map(persons.map((p) => [p.id, p]))
    // Zuordnung bevorzugt über die Person-Id; der Namensweg bleibt als Rückfall
    // für Plätze ohne `pid` (Altdaten, Hilfsdienste als reine Zeichenkette).
    // Zwei Personen desselben Namens bekämen sonst gegenseitig die Nachrichten
    // des anderen — dagegen warnt die App den Planer eigens (T-Dubletten).
    const userByPerson = new Map<string, string>()
    const userByName = new Map<string, string>()
    const personByName = new Map<string, string>()
    for (const m of members) {
      const p = m.person_id ? personById.get(m.person_id) : undefined
      if (!p) continue
      userByPerson.set(p.id, m.user_id)
      userByName.set(personDisplayName(p.fn, p.ln, p.dn), m.user_id)
    }
    for (const p of persons) personByName.set(personDisplayName(p.fn, p.ln, p.dn), p.id)
    const subsByUser = new Map<string, SubscriptionRow[]>()
    for (const s of subs) subsByUser.set(s.user_id, [...(subsByUser.get(s.user_id) ?? []), s])
    const empfaengerFuer = (uid: string): Empfaenger => ({
      userId: uid,
      subs: subsByUser.get(uid) ?? [],
    })

    /* ---- Aktion: eine bestätigte Zuteilung wurde zurückgezogen ---- */
    if (payload.action === 'entzug') {
      const name = payload.name ?? ''
      const key = payload.taskKey ?? ''
      if (!name || !key) return json({ error: 'bad-request' }, 400)

      /*
       * Der Eintrag im Tagebuch muss weg, **bevor** irgendetwas anderes
       * passiert. Er sagt „diese Person weiß von diesem Platz"; das gilt nicht
       * mehr. Bliebe er stehen, bekäme sie bei einer erneuten Zuteilung auf
       * denselben Platz keine Nachricht mehr — der Platz zählte als gemeldet.
       */
      await fetch(
        `${SUPABASE_URL}/rest/v1/assignment_log?congregation_id=eq.${wert(cong)}` +
          `&task_key=eq.${wert(key)}&name=eq.${wert(name)}`,
        { method: 'DELETE', headers: AUTH },
      )

      const uid = userByName.get(name)
      // Kein Konto → nichts zuzustellen. Kein Fehler: der Planer sagt es
      // persönlich, und die Antwort nennt ihm den Namen.
      if (!uid) return json({ ok: true, personen: 0, ohneKonto: [name] })

      await bibelbuecherLaden()
      // Termin und Bezeichnung kommen vom Client — er hat den Platz gerade in
      // der Hand, samt Datum der Zusammenkunft. Beides kanonisch deutsch, wie
      // jeder Mitteilungsrumpf; übersetzt wird beim Anzeigen bzw. je Gerät.
      const eintrag: Eintrag = { datum: payload.datum ?? '', label: payload.label ?? '' }
      const { personen, push } = await verschicken(cong, [
        {
          empfaenger: empfaengerFuer(uid),
          titelDe: TITEL_ENTZUG,
          titelFuer: (lang) => planTexte(lang).entzug,
          eintraege: [eintrag],
          ziel: `${APP_URL}#go=aufgaben`,
        },
      ])
      return json({ ok: true, personen, push, ohneKonto: [] })
    }

    /* ---- Aktion: Plan einer Woche senden ---- */
    const weekStart = payload.weekStart ?? ''
    if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) return json({ error: 'bad-request' }, 400)

    const [congRows, weekRows, fsRows, confs, services, log] = await Promise.all([
      restGet<{ meeting_times: string }[]>(
        `congregations?select=meeting_times&id=eq.${wert(cong)}`,
      ),
      restGet<{ start: string; data: Week }[]>(
        `weeks?select=start,data&congregation_id=eq.${wert(cong)}&start=eq.${wert(weekStart)}`,
      ),
      restGet<{ start: string; data: FsInstance[] }[]>(
        `fs_weeks?select=start,data&congregation_id=eq.${wert(cong)}&start=eq.${wert(weekStart)}`,
      ).catch((err) => {
        // Fehlt die Tabelle, lieber die Zusammenkünfte melden als gar nichts.
        console.error(`fs_weeks nicht lesbar: ${(err as Error).message}`)
        return [] as { start: string; data: FsInstance[] }[]
      }),
      restGet<{ task_key: string; status: string }[]>(
        `confirmations?select=task_key,status&congregation_id=eq.${wert(cong)}`,
      ),
      restGet<ServiceRow[]>(
        `services?select=key,name,count,groups&congregation_id=eq.${wert(cong)}&order=position.asc`,
      ),
      restGet<{ task_key: string; name: string }[]>(
        `assignment_log?select=task_key,name&congregation_id=eq.${wert(cong)}`,
      ).catch((err) => {
        // Fehlt das Tagebuch (Migration nicht eingespielt), würde ohne diesen
        // Fang gar nichts hinausgehen. Lieber senden — schlimmstenfalls eine
        // Wiederholung, nie ein Ausfall.
        console.error(`assignment_log nicht lesbar: ${(err as Error).message}`)
        return [] as { task_key: string; name: string }[]
      }),
    ])

    const week = weekRows[0]?.data
    if (!week) return json({ error: 'no-week' }, 404)
    const offsets = meetingDayOffsets(congRows[0]?.meeting_times ?? '')
    const zeiten = meetingTimesOf(congRows[0]?.meeting_times ?? '')
    const conf = new Map(confs.map((c) => [c.task_key, c.status]))
    const schonGemeldet = new Set(log.map((r) => tagebuchSchluessel(r.task_key, r.name)))

    // Alle offenen Plätze der Woche einsammeln — dieselbe Aufzählung, die auch
    // die Erinnerungen benutzt (`_shared/zuteilungen.ts`).
    const offen: Array<Pending & { eintrag: Eintrag }> = []
    for (const tab of ['mid', 'we'] as const) {
      const meeting = week[tab]
      if (!meeting) continue
      // Entfällt die Zusammenkunft, gibt es nichts mitzuteilen (T30).
      if (istAusgefallenFuer(week.dev, tab)) continue
      const offset = versatzMitAbweichung(week.dev, tab, meeting.date, offsets[tab])
      const zeit = zeitMitAbweichung(week.dev, tab, meeting.date, zeiten[tab])
      // Der Termin trägt die Verlegung bereits in sich: steht sie zur Planzeit
      // fest, nennt die Nachricht von vornherein den richtigen Tag.
      const datum = terminText(weekStart, offset, meeting, zeit, week.dev, tab)
      for (const pend of pendingOfMeeting(weekStart, tab, meeting, services, conf)) {
        offen.push({ ...pend, eintrag: { datum, label: pend.label } })
      }
    }
    for (const pend of pendingOfFsWeek(weekStart, fsRows[0]?.data ?? [], conf)) {
      offen.push({
        ...pend,
        eintrag: { datum: terminText(weekStart, pend.offset, {}, pend.zeit), label: pend.label },
      })
    }

    // Was schon gemeldet wurde, bleibt liegen. Sonst schickte ein zweiter Druck
    // nach einer kleinen Nachbesserung allen dieselbe Nachricht erneut.
    const neu = offen.filter((p) => !schonGemeldet.has(tagebuchSchluessel(p.key, p.name)))
    if (neu.length === 0) return json({ ok: true, personen: 0, aufgaben: 0, ohneKonto: [] })

    await bibelbuecherLaden()

    // Je Person **eine** Nachricht mit allen ihren Aufgaben — nicht je Aufgabe
    // eine. Wer an einem Wochenende drei Plätze hat, soll einmal hinsehen.
    const jePerson = new Map<string, Array<Pending & { eintrag: Eintrag }>>()
    for (const p of neu) {
      const uid = (p.pid ? userByPerson.get(p.pid) : undefined) ?? userByName.get(p.name)
      // Ohne Konto ist niemand zu erreichen; der Schlüssel bleibt der Name,
      // damit der Planer unten erfährt, wen er persönlich ansprechen muss.
      const schluessel = uid ?? ` ohne:${p.name}`
      jePerson.set(schluessel, [...(jePerson.get(schluessel) ?? []), p])
    }

    const nachrichten: Nachricht[] = []
    const ohneKonto: string[] = []
    for (const [schluessel, eintraege] of jePerson) {
      if (schluessel.startsWith(' ohne:')) {
        ohneKonto.push(schluessel.slice(' ohne:'.length))
        continue
      }
      nachrichten.push({
        empfaenger: empfaengerFuer(schluessel),
        titelDe: TITEL_ZUTEILUNG,
        titelFuer: (lang) => planTexte(lang).zuteilung,
        eintraege: eintraege.map((e) => e.eintrag),
        // Nur bei genau einer Aufgabe: dann trägt die Glocke den
        // Bestätigen-Knopf. Bei mehreren zeigte er auf eine willkürliche davon.
        ...(eintraege.length === 1 ? { taskKey: eintraege[0].key } : {}),
        ziel: `${APP_URL}#go=aufgaben`,
      })
    }

    const { push } = await verschicken(cong, nachrichten)

    // Tagebuch **nach** dem Versand — scheitert das Schreiben, wurde immerhin
    // gesendet (schlimmstenfalls eine Wiederholung, nie ein Ausfall). Auch die
    // ohne Konto werden eingetragen: sonst zeigte der Knopf für sie auf ewig
    // „noch nicht benachrichtigt", obwohl niemand sie erreichen kann.
    await restInsert(
      'assignment_log',
      neu.map((p) => ({
        congregation_id: cong,
        task_key: p.key,
        name: p.name,
        person_id: p.pid ?? personByName.get(p.name) ?? null,
        user_id: (p.pid ? userByPerson.get(p.pid) : undefined) ?? userByName.get(p.name) ?? null,
      })),
    )

    return json({
      ok: true,
      personen: nachrichten.length,
      aufgaben: neu.length,
      push,
      ohneKonto: [...new Set(ohneKonto)],
    })
  } catch (err) {
    // Nur in die Logs, nicht in die Antwort: die REST-Fehler tragen Pfad und
    // rohen PostgREST-Rumpf — beim Suchen nützlich und beim Angreifen genauso.
    console.error('send-plan:', err instanceof Error ? err.message : String(err))
    return json({ error: 'server-error' }, 500)
  }
})
