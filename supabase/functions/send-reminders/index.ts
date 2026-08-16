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
//  - Personen mit fälliger letzter Erinnerung, die nicht per Push erreichbar
//    sind (kein App-Konto ODER kein aktiviertes Push-Abo), werden den Planern
//    als Sammel-Push gemeldet, damit sie persönlich erinnern können.
//  - Empfangen kann nur, wer in der App (Profil) Push aktiviert hat
//    (Tabelle push_subscriptions, migration-005). Abgelaufene Abos (404/410)
//    werden automatisch gelöscht.
//  - Wartung: Glocken-Mitteilungen älter als 30 Tage werden im selben Lauf
//    gelöscht (nur im Scharfbetrieb — der Dry-Run schreibt/löscht nichts).
//  - Doppel-Versand-Sperre: pro Empfänger, Art und Tag höchstens eine Sendung
//    (Tabelle reminder_log, migration-011). Ein zweiter Cron-Lauf am selben Tag
//    schickt nichts erneut; ein Neulauf nach Teilfehler holt nur Ausstehende.
//
// SICHERHEIT / STATUS:
//  - **Dry-Run standardmäßig**: ohne Secret `SEND_PUSH=true` wird nichts
//    versendet und nichts geschrieben — die Antwort listet die Vorschau.
//  - Zugriff nur mit korrektem `CRON_SECRET` (Authorization: Bearer <secret>).
//    Fehlt das Secret, antwortet die Function mit 500 statt jeden durchzulassen.
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
import {
  type Abweichungen,
  istAusgefallenFuer,
  meetingDayOffsets,
  personDisplayName,
  SKIP_ROLE,
  taskDateText,
  versatzMitAbweichung,
  zeitMitAbweichung,
  zuteilungsLabel,
} from '../_shared/planung.ts'
import { pushTexte } from './texte.ts'

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

/** Heutige Versand-Einträge als Menge "userId|kind" (Doppel-Versand-Sperre). */
async function loadSentToday(todayISO: string): Promise<Set<string>> {
  try {
    const rows = await rest<{ user_id: string; kind: string }[]>(
      `reminder_log?select=user_id,kind&sent_on=eq.${todayISO}`,
    )
    return new Set(rows.map((r) => `${r.user_id}|${r.kind}`))
  } catch (err) {
    // Fehlt die Tabelle (Migration nicht eingespielt), lieber senden als crashen.
    console.error(`reminder_log nicht lesbar: ${(err as Error).message}`)
    return new Set()
  }
}

/** Abgelaufenes Push-Abo entfernen (Push-Service meldete 404/410). */
async function restDeleteSubscription(id: string): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?id=eq.${id}`, {
    method: 'DELETE',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  })
  if (!res.ok) console.error(`REST DELETE push_subscriptions ${res.status}`)
}

/** Aufbewahrungsfrist der Glocken-Mitteilungen (Tage). */
const NOTIFICATION_RETENTION_DAYS = 30

/**
 * Mitteilungen älter als die Frist löschen — läuft im täglichen Cron mit,
 * damit die Tabelle (und die Glocken-Liste) nicht unbegrenzt wächst.
 */
async function pruneNotifications(): Promise<void> {
  const cutoff = new Date(Date.now() - NOTIFICATION_RETENTION_DAYS * 864e5).toISOString()
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/notifications?created_at=lt.${encodeURIComponent(cutoff)}`,
    {
      method: 'DELETE',
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    },
  )
  if (!res.ok) console.error(`REST DELETE notifications ${res.status}: ${await res.text()}`)
}

/* ---- Datenmodell (Teilmengen der Client-Typen aus src/data/types.ts) ---- */

interface Slot {
  name?: string
  /** Person-Id der Zuteilung — stabile Identität statt Name-Match. */
  pid?: string
  rolle?: string
}
/** Ein Treffpunkt einer Woche (FsInstance im Client). */
interface FsInstance {
  id: string
  grp?: string
  wd: number
  time?: string
  place?: string
  leader?: string
  /** Person-Id des Leiters. */
  lpid?: string
}
interface Item {
  song?: string
  title?: string
  /** Stabile Kennung des Programmpunkts (T37) — Grundlage des Aufgaben-Schluessels. */
  iid?: string
  names?: Slot[]
  /** Zweite Platzreihe der Zusaetzlichen Klasse (jw.org S-38, Absatz 26). */
  aux?: Slot[]
}
interface Section {
  /**
   * Kanonisch deutsche Überschrift („ERÖFFNUNG", „ABSCHLUSS", …). Sie
   * entscheidet mit, wie eine Zuteilung benannt wird (`zuteilungsLabel`).
   */
  label?: string
  items?: Item[]
}
/**
 * Hilfsdienst-Platz. Aktuell ein Objekt { name, pid? }; Bestandsdaten in der DB
 * können noch reine Namens-Strings sein (siehe normalizeWeekHelpers in
 * src/lib/data.ts — der Client hebt sie beim Laden an, die DB behält das
 * Alt-Format aber, bis die Woche neu gespeichert wird). Beides muss hier
 * gelesen werden können.
 */
type HelperEntry = string | { name?: string; pid?: string } | null
interface Meeting {
  date?: string
  sections?: Section[]
  helpers?: Record<string, HelperEntry[]>
  /** Ratgeber der Zusaetzlichen Klasse (eine Zuteilung je Zusammenkunft). */
  auxRatgeber?: Slot
}
interface Week {
  start?: string
  mid?: Meeting
  we?: Meeting
  /** Abweichungen dieser Woche — verlegter Tag, andere Uhrzeit, Ausfall (T30). */
  dev?: Abweichungen
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
  /** App-Sprache des Geraets; null bei Abos von vor migration-014 → Deutsch. */
  lang: string | null
}

/**
 * Abos eines Nutzers nach Sprache gruppieren — je Gruppe geht ein eigener
 * Versand hinaus, weil der Text beim Verschicken feststeht.
 *
 * Ohne Abos bleibt eine leere deutsche Gruppe übrig: dann wird nichts
 * verschickt (keine Empfänger), die Vorschau des Probelaufs zeigt den Eintrag
 * aber weiterhin an.
 */
function nachSprache(subs: SubscriptionRow[]): Array<[string, SubscriptionRow[]]> {
  if (subs.length === 0) return [['de', []]]
  const nach = new Map<string, SubscriptionRow[]>()
  for (const s of subs) {
    const lang = s.lang ?? 'de'
    nach.set(lang, [...(nach.get(lang) ?? []), s])
  }
  return [...nach]
}

/* `SKIP_ROLE`, `personDisplayName`, `taskDate`, `meetingDayOffsets` und
   `WEEKDAY_OFFSET` kommen aus `_shared/planung.ts` — dieselben Regeln wie im
   Client und in substitute. Getrennte Kopien hatten schon einmal
   auseinandergefunden (B8/T40). */

/** Name eines Hilfsdienst-Platzes; '' = unbesetzt (beide Datenformate). */
function helperName(entry: HelperEntry | undefined): string {
  if (!entry) return ''
  return typeof entry === 'string' ? entry : (entry.name ?? '')
}

/** Person-Id eines Hilfsdienst-Platzes; Alt-Format (reiner String) hat keine. */
function helperPid(entry: HelperEntry | undefined): string | undefined {
  return entry && typeof entry !== 'string' ? entry.pid : undefined
}

const taskDate = (meeting: Meeting): string => taskDateText(meeting.date)

/** Kanonisch deutsche Namen — das Format der Wochendaten (siehe Client). */
const WOCHENTAGE = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag']
const MONATE = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
]

/**
 * Termin im Erinnerungstext: „Dienstag, 8. September · 19:00".
 *
 * Importierte Wochen tragen im `date`-Feld nur die Wochenspanne — die
 * Erinnerung nannte deshalb eine Woche statt eines Tages. Rangfolge wie im
 * Client (`meetingDateText`): eigener Termin vor gerechnetem Datum.
 */
function reminderDate(
  startISO: string,
  offset: number,
  meeting: Meeting,
  zeit: string,
  dev?: Abweichungen,
  tab?: 'mid' | 'we',
): string {
  // Eine Abweichung schlägt auch den eigenen Termin im `date`-Feld: der Planer
  // hat den Tag ausdrücklich verlegt, das `date`-Feld nennt noch den alten
  // (gleiche Regel wie `meetingDateText` im Client).
  const abw = tab ? dev?.[tab] : undefined
  const verlegt = Boolean(abw?.day || abw?.time)
  if (
    !verlegt &&
    /\b(Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonnabend|Sonntag)\b/.test(meeting.date ?? '')
  ) {
    return taskDate(meeting)
  }
  const ms = Date.parse(startISO)
  if (Number.isNaN(ms)) return taskDate(meeting)
  const d = new Date(ms + offset * 864e5)
  const text = `${WOCHENTAGE[(d.getUTCDay() + 6) % 7]}, ${d.getUTCDate()}. ${MONATE[d.getUTCMonth()]}`
  return zeit ? `${text} · ${zeit}` : text
}

/** "Di 19:00 · So 10:00" → Uhrzeiten je Zusammenkunft. */
function meetingTimesOf(meetingTimes: string): { mid: string; we: string } {
  const found = [...meetingTimes.matchAll(/\b(\d{1,2})[:.](\d{2})\b/g)].map(
    (m) => `${m[1].padStart(2, '0')}:${m[2]}`,
  )
  return { mid: found[0] ?? '', we: found[1] ?? '' }
}

/* ---- Terminberechnung ---------------------------------------------------- */

/*
 * Der Wochentag-Versatz stand hier als eigene Fassung. Er wohnt jetzt in
 * `_shared/planung.ts` (`versatzMitAbweichung`) — dieselbe Rangfolge wie
 * `meetingOffset` im Client, und seit T30 mit der Abweichung davor. Zwei
 * Fassungen einer Terminregel waren schon einmal die Ursache von B8.
 */

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
  /**
   * Person-Id, wo die Zuteilung eine trägt. Zugeordnet wird darüber und erst
   * ersatzweise über den Anzeigenamen: zwei Personen desselben Namens bekamen
   * sonst gegenseitig die Erinnerungen des anderen.
   */
  pid?: string
  label: string
}

/**
 * Kennung eines Treffpunkts ohne führende Wochennummer (T87).
 *
 * Der Client hebt beim Laden beides — die Kennungen im Blob und die
 * `task_key` der Bestätigungen. Der Versand liest den Blob aber **direkt aus
 * der Datenbank**, und der bleibt so lange auf dem alten Stand, bis ein Planer
 * die Woche das nächste Mal anfasst. Ohne diesen Griff rechnete er in der
 * Zwischenzeit mit `fs|<Montag>|3|r1`, während die Bestätigung längst
 * `fs|<Montag>|r1` heißt: Der Leiter hätte bestätigt und würde trotzdem weiter
 * erinnert.
 *
 * Regel-Kennungen sind `r<uuid>`, von Hand angelegte `x<uuid>` — eine Zahl
 * vorn hat nur der Altbestand.
 */
function stabileKennung(instId: string): string {
  const treffer = /^\d+\|(.+)$/.exec(instId)
  return treffer?.[1] ?? instId
}

/**
 * Unbestätigte Treffpunkt-Leitungen einer Woche.
 *
 * Zweite Datenquelle (`fs_weeks`), die hier lange gar nicht gelesen wurde: ein
 * zugeteilter Treffpunkt-Leiter bekam nie eine Erinnerung und konnte nichts
 * bestätigen — er erfuhr von seiner Einteilung nur beim Nachschauen.
 *
 * Der Wochentag steht am Treffpunkt selbst (`wd`, 0=So … 6=Sa), nicht in den
 * Zusammenkunftszeiten; als Versatz ab Montag gerechnet wie im Client
 * (`fsDate`). task_key `fs|<Montag>|<instId>` — dieselbe Form wie dort (T66:
 * vorn steht die **Kennung** der Woche, nicht mehr ihre Position).
 */
function pendingOfFsWeek(
  woche: string,
  insts: FsInstance[],
  conf: Map<string, string>,
): Array<Pending & { offset: number; zeit: string }> {
  const out: Array<Pending & { offset: number; zeit: string }> = []
  for (const inst of insts) {
    if (!inst?.leader) continue
    if (conf.has(`fs|${woche}|${stabileKennung(inst.id)}`)) continue
    const ort = inst.place ? ` · ${inst.place}` : ''
    out.push({
      name: inst.leader,
      pid: inst.lpid,
      label: `Treffpunkt-Leiter${ort}`,
      offset: ((inst.wd ?? 1) + 6) % 7,
      zeit: inst.time ?? '',
    })
  }
  return out
}

/**
 * Unbestätigte Zuteilungen; task_key-Schema wie partTaskKey/helperTaskKey.
 *
 * Vorn steht seit T66 der **Montag der Woche** statt ihrer Position. Der
 * Positions-Schlüssel wurde eine Zeit lang mitgeprüft; seit Stufe 3 nicht mehr
 * — migration-018 hat den Rest umgeschrieben und die Spalte gelöscht, an der er
 * hing. Was jetzt noch positionsförmig wäre, zeigt auf eine Woche, die es nicht
 * gibt.
 */
function pendingOfMeeting(
  woche: string,
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
      // Hauptsaal ("part") und Zusätzliche Klasse ("aux") — gleichwertige
      // Zuteilungen mit eigenen Schlüsseln; ohne die zweite Runde bliebe die
      // halbe Klasse ohne Erinnerung. Ob es eine Klasse gibt, sagt der
      // Ratgeber-Platz (wie hatAuxKlasse im Client): die Namen der Klasse
      // bleiben beim Ausschalten stehen, erinnert wird dann aber nicht mehr.
      const raeume: Array<['part' | 'aux', Slot[]]> = [['part', item.names ?? []]]
      if (meeting.auxRatgeber) raeume.push(['aux', item.aux ?? []])
      for (const [abschnitt, names] of raeume) {
        for (let ni = 0; ni < names.length; ni++) {
          const slot = names[ni]
          if (!slot.name || SKIP_ROLE.test(slot.rolle ?? '')) continue
          // Schlüssel über die stabile Kennung des Punkts, sonst über seine
          // Position **innerhalb** der Zusammenkunft (T37) — dieselbe Regel wie
          // `slotTaskKey` im Client. Beide Formen werden geprüft, weil Punkte
          // ohne `iid` erst beim nächsten Laden eine bekommen.
          const posKey = `${woche}|${tab}|${abschnitt}|${si}|${ii}|${ni}`
          const idKey = item.iid ? `${woche}|${tab}|${abschnitt}|${item.iid}|${ni}` : null
          if (conf.has(posKey) || (idKey !== null && conf.has(idKey))) continue
          out.push({
            name: slot.name,
            pid: slot.pid,
            // Dieselbe Regel wie in der Aufgabenliste des Clients: in
            // ERÖFFNUNG/ABSCHLUSS trägt die Rolle allein, sonst Titel · Rolle.
            label: zuteilungsLabel(sections[si].label ?? '', item.title ?? 'Zuteilung', slot.rolle),
          })
        }
      }
    }
  }
  // Ratgeber der Zusätzlichen Klasse: eine Zuteilung je Zusammenkunft.
  const ratgeber = meeting.auxRatgeber
  if (ratgeber?.name && !conf.has(`${woche}|${tab}|ratgeber`)) {
    out.push({ name: ratgeber.name, pid: ratgeber.pid, label: ratgeber.rolle ?? 'Ratgeber' })
  }
  for (const svc of services) {
    if (svc.groups) continue
    const arr = meeting.helpers?.[svc.key] ?? []
    for (let pos = 0; pos < svc.count; pos++) {
      const name = helperName(arr[pos])
      if (!name) continue // unbesetzter Platz
      if (conf.has(`${woche}|${tab}|helper|${svc.key}|${pos}`)) continue
      out.push({ name, pid: helperPid(arr[pos]), label: svc.name })
    }
  }
  return out
}

/* ---- Versand ------------------------------------------------------------- */

interface Push {
  userId: string
  title: string
  body: string
  url?: string // Deep-Link-Ziel (#go=…); Klick öffnet den passenden Screen
}

Deno.serve(async (req: Request) => {
  // Ohne Secret gar nicht erst arbeiten. Die Function ist mit --no-verify-jwt
  // deployt, die Plattform prüft also nichts — `if (CRON_SECRET && …)` hätte
  // bei fehlendem Secret jeden durchgelassen, und der Dry-Run gibt die
  // Vorschau ALLER Versammlungen zurück. Fehlt die Konfiguration, ist das ein
  // Fehler des Betreibers und keine Erlaubnis.
  if (!CRON_SECRET) {
    console.error('[send-reminders] CRON_SECRET ist nicht gesetzt — Abbruch')
    return new Response('Server misconfigured', { status: 500 })
  }
  if (req.headers.get('Authorization') !== `Bearer ${CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }
  try {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

    const now = new Date()
    const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    const todayISO = new Date(todayUTC).toISOString().slice(0, 10)
    // Wer heute schon benachrichtigt wurde ("userId|kind") → nicht erneut senden.
    const sentToday = await loadSentToday(todayISO)

    const congs = await rest<
      {
        id: string
        meeting_times: string
        settings: { reminders?: Partial<Reminders> } | null
      }[]
    >('congregations?select=id,meeting_times,settings')

    let sent = 0
    let expired = 0
    let skipped = 0 // heute bereits benachrichtigt (Doppel-Versand-Sperre)
    const preview: Push[] = []
    const notifRows: unknown[] = []
    const sendQueue: Array<{ push: Push; subs: SubscriptionRow[] }> = []
    // Was in diesem Lauf gesendet wird → nach echtem Versand ins reminder_log.
    const logRows: { congregation_id: string; user_id: string; kind: string }[] = []

    for (const cong of congs) {
      const rem: Reminders = {
        first: cong.settings?.reminders?.first ?? 7,
        last: cong.settings?.reminders?.last ?? 1,
        repeat: cong.settings?.reminders?.repeat ?? true,
      }
      const offsets = meetingDayOffsets(cong.meeting_times)
      const zeiten = meetingTimesOf(cong.meeting_times)

      const [weeks, fsWeeks, confs, members, persons, services, subs] = await Promise.all([
        // Die Kennung kommt aus der Spalte, nicht aus dem Blob: `data->>'start'`
        // fehlt bei Wochen, die vor migration-017 geschrieben wurden.
        rest<{ start: string; data: Week }[]>(
          `weeks?select=start,data&congregation_id=eq.${cong.id}&order=start.asc`,
        ),
        // Treffpunkte: eigene Tabelle, dieselbe Kennung wie `weeks`.
        rest<{ start: string; data: FsInstance[] }[]>(
          `fs_weeks?select=start,data&congregation_id=eq.${cong.id}&order=start.asc`,
        ).catch((err) => {
          // Fehlt die Tabelle (Migration nicht eingespielt), lieber die
          // Zusammenkünfte erinnern als den ganzen Lauf verlieren.
          console.error(`fs_weeks nicht lesbar: ${(err as Error).message}`)
          return [] as { start: string; data: FsInstance[] }[]
        }),
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
          `push_subscriptions?select=id,user_id,endpoint,p256dh,auth,lang&congregation_id=eq.${cong.id}`,
        ),
      ])

      const conf = new Map(confs.map((c) => [c.task_key, c.status]))
      const personById = new Map(persons.map((p) => [p.id, p]))
      const userByName = new Map<string, string>()
      // Zuordnung bevorzugt über die Person-Id: zwei Personen desselben Namens
      // bekamen über `userByName` gegenseitig die Erinnerungen des anderen.
      // Der Namensweg bleibt als Rückfall für Altdaten ohne Id.
      const userByPerson = new Map<string, string>()
      for (const m of members) {
        const p = m.person_id ? personById.get(m.person_id) : undefined
        if (!p) continue
        userByName.set(personDisplayName(p.fn, p.ln, p.dn), m.user_id)
        userByPerson.set(p.id, m.user_id)
      }
      const userOf = (pend: Pending): string | undefined =>
        (pend.pid ? userByPerson.get(pend.pid) : undefined) ?? userByName.get(pend.name)
      const subsByUser = new Map<string, SubscriptionRow[]>()
      for (const s of subs) {
        subsByUser.set(s.user_id, [...(subsByUser.get(s.user_id) ?? []), s])
      }

      const entriesByUser = new Map<string, string[]>()
      const mainByUser = new Map<string, string[]>() // Glocke nur an first/last-Tagen
      const unreachable: string[] = []

      weeks.forEach((row) => {
        const week = row.data
        const start = row.start
        if (!week || !start) return
        for (const tab of ['mid', 'we'] as const) {
          const meeting = week[tab]
          if (!meeting) continue
          // Entfällt die Zusammenkunft, gibt es nichts zu erinnern (T30). Ein
          // Ausfall ohne diese Zeile schickte Erinnerungen an einen Abend, an
          // dem niemand kommt — und die Planer-Meldung „nicht erreichbar"
          // gleich hinterher.
          if (istAusgefallenFuer(week.dev, tab)) continue
          // Verlegter Tag/Uhrzeit schlagen den Rhythmus aus den Einstellungen:
          // sonst erinnert der Versand am regulären Abend, während Anzeige und
          // Abwesenheitsprüfung den echten nennen.
          const offset = versatzMitAbweichung(week.dev, tab, meeting.date, offsets[tab])
          const zeit = zeitMitAbweichung(week.dev, tab, meeting.date, zeiten[tab])
          const days = daysUntil(start, offset, todayUTC)
          if (days === null) continue
          const kind = dueKind(rem, days)
          if (!kind) continue
          for (const pend of pendingOfMeeting(start, tab, meeting, services, conf)) {
            const entry = `${reminderDate(start, offset, meeting, zeit, week.dev, tab)}: ${pend.label}`
            const userId = userOf(pend)
            // „Wirklich erreichbar" = App-Konto UND mindestens ein aktives
            // Push-Abo. Wer ein Konto hat, bekommt trotzdem die persönliche
            // Erinnerung (Push an evtl. Abos + Glocke); ohne Abo bleibt das aber
            // faktisch ungesehen — daher zusätzlich die Planer-Meldung unten.
            const reachable = userId != null && (subsByUser.get(userId)?.length ?? 0) > 0
            if (userId) {
              entriesByUser.set(userId, [...(entriesByUser.get(userId) ?? []), entry])
              if (kind === 'main') {
                mainByUser.set(userId, [...(mainByUser.get(userId) ?? []), entry])
              }
            }
            // Nicht per Push erreichbar (kein Konto ODER kein Abo) → am letzten
            // Erinnerungstag den Planern melden, damit sie persönlich erinnern.
            if (!reachable && days === rem.last) {
              unreachable.push(`${pend.name} — ${entry}`)
            }
          }
        }
      })

      // Treffpunkte: eigene Tabelle, eigener Wochentag je Eintrag. Das Datum
      // steht seit T66 an der Zeile selbst — bis dahin musste es über die
      // gleiche Positionsnummer aus `weeks` geholt werden.
      for (const row of fsWeeks) {
        const start = row.start
        if (!start) continue
        for (const pend of pendingOfFsWeek(start, row.data ?? [], conf)) {
          const days = daysUntil(start, pend.offset, todayUTC)
          if (days === null) continue
          const kind = dueKind(rem, days)
          if (!kind) continue
          const tag = reminderDate(start, pend.offset, {}, pend.zeit)
          const entry = `${tag}: ${pend.label}`
          const userId = userOf(pend)
          const reachable = userId != null && (subsByUser.get(userId)?.length ?? 0) > 0
          if (userId) {
            entriesByUser.set(userId, [...(entriesByUser.get(userId) ?? []), entry])
            if (kind === 'main') {
              mainByUser.set(userId, [...(mainByUser.get(userId) ?? []), entry])
            }
          }
          if (!reachable && days === rem.last) {
            unreachable.push(`${pend.name} — ${entry}`)
          }
        }
      }

      for (const [userId, entries] of entriesByUser) {
        // Doppel-Versand-Sperre: heute schon persönlich erinnert → überspringen
        // (gilt auch für die Glocke, die untrennbar zur selben Erinnerung gehört).
        if (sentToday.has(`${userId}|self`)) {
          skipped++
          continue
        }
        // Je Sprache ein eigener Versand: der Text steht fest, sobald die
        // Nachricht das Gerät erreicht. Wer Geräte in zwei Sprachen hat,
        // bekommt auf jedem die passende.
        for (const [lang, subs] of nachSprache(subsByUser.get(userId) ?? [])) {
          const push: Push = {
            userId,
            title: pushTexte(lang).erinnerung,
            body: entries.join(' · '),
            url: `${APP_URL}#go=aufgaben`,
          }
          preview.push(push)
          sendQueue.push({ push, subs })
        }
        // Glocke nur an first/last-Tagen (mainByUser ⊆ entriesByUser). Sie wird
        // bewusst NICHT hier übersetzt: Mitteilungen stehen kanonisch deutsch
        // in der Datenbank und werden beim Anzeigen in die Sprache des Lesers
        // gebracht (NOTIF_TITLE_KEY in i18n/ui.ts).
        const mainEntries = mainByUser.get(userId)
        if (mainEntries) {
          notifRows.push({
            congregation_id: cong.id,
            user_id: userId,
            type: 'erinnerung',
            title: 'Erinnerung: Zuteilung bestätigen',
            body: mainEntries.join(' · '),
          })
        }
        logRows.push({ congregation_id: cong.id, user_id: userId, kind: 'self' })
      }
      if (unreachable.length > 0) {
        const body = unreachable.join(' · ')
        for (const m of members) {
          if (!m.planner) continue
          if (sentToday.has(`${m.user_id}|planner`)) {
            skipped++
            continue
          }
          for (const [lang, subs] of nachSprache(subsByUser.get(m.user_id) ?? [])) {
            const p: Push = {
              userId: m.user_id,
              title: pushTexte(lang).unerreichbar,
              body,
              url: `${APP_URL}#go=planen`,
            }
            preview.push(p)
            sendQueue.push({ push: p, subs })
          }
          logRows.push({ congregation_id: cong.id, user_id: m.user_id, kind: 'planner' })
        }
      }
    }

    if (SEND_PUSH) {
      for (const { push, subs } of sendQueue) {
        const payload = JSON.stringify({ title: push.title, body: push.body, url: push.url ?? APP_URL })
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
      // Versand-Tagebuch schreiben, damit ein zweiter Lauf heute nicht doppelt
      // sendet. Nach dem eigentlichen Versand — scheitert das Schreiben, wurde
      // immerhin gesendet (schlimmstenfalls eine Wiederholung, nie Verlust).
      await restInsert('reminder_log', logRows)
      // Wartung im selben Lauf: alte Mitteilungen nach Aufbewahrungsfrist löschen
      await pruneNotifications()
    }

    return new Response(
      JSON.stringify({
        ok: true,
        dryRun: !SEND_PUSH,
        pushes: SEND_PUSH ? sent : preview.length,
        skipped, // heute bereits benachrichtigt (Doppel-Versand-Sperre)
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
