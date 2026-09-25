/**
 * Daten-Zugriff auf Supabase (Persistenz). Lädt die Daten einer Versammlung
 * für den eingeloggten Nutzer und schreibt Änderungen zurück. Alle Funktionen
 * setzen einen konfigurierten Client voraus (siehe supabase.ts) — im Demo-Modus
 * werden sie nicht aufgerufen.
 *
 * Persistiert: Versammlung (Stammdaten + Einstellungen), Mitgliedschaft
 * (Rolle), Personen, Dienste, Wochen (als JSONB), eigene Abwesenheiten,
 * Mitteilungen und Aufgaben-Bestätigungen. Nicht persistiert (bewusst,
 * geräteweise in localStorage): App-Sprache und Darstellung.
 */

import { ROLE_ORDER } from '../data/constants'
import { STANDARD_ERINNERUNGEN } from '../data/vorgaben'
import { kurzeZeit, zeitenAus } from '../../supabase/functions/_shared/planung.ts'
import { fsLeiterBinden, regenFsWeeks } from '../data/fs'
import { sentKey, taskKeyVorbei } from '../data/planning'
import type { EntzogeneZusage } from '../data/plan-versand'
import { normalizePriv, pidsNachtragen } from '../data/namensbindung'
import { normalizeChairKeys } from '../data/helpers'
import type {
  Absence,
  Congregation,
  ConfirmationMap,
  FsInstance,
  FsRule,
  Group,
  Invite,
  MeetingTimes,
  Member,
  Notification,
  NotificationType,
  Person,
  Qualifications,
  Reminders,
  Role,
  SentLog,
  Service,
  TaskStatus,
  Week,
} from '../data/types'
import { supabase } from './supabase'

/* ---- Row-Typen (Spalten aus supabase/schema.sql) ------------------------ */

interface PersonRow {
  id: string
  fn: string
  ln: string
  planner_vorgemerkt: boolean
  role: string
  female: boolean
  tel: string
  mail: string
  priv: Qualifications
  grp: string | null
  fam: string | null
}

interface ServiceRow {
  key: string
  name: string
  count: number
  groups: boolean
  position: number
}

interface GroupRow {
  id: string
  name: string
  overseer_id: string | null
  assistant_id: string | null
  position: number
}

/** Eine Grundplan-Regel der Treffpunkte — seit T105 eine Zeile statt JSONB. */
interface FsRuleRow {
  id: string
  grp: string | null
  wd: number
  time: string
  place: string
  monthly: number
  skip_cong: boolean
}

/**
 * Stammdaten und Einstellungen der Versammlung — je eine Spalte, kein
 * `settings`-Beutel und kein Anzeigetext mehr (siehe schema.sql).
 */
/**
 * Die Spalten, die `loadCongregationData` von `congregations` holt — aus dem
 * Typ abgeleitet, damit Abfrage und Zusicherung nicht auseinanderlaufen.
 *
 * **Ausgeschrieben statt `select('*')`**, und das ist der Punkt: Eine Abfrage
 * nach einer Spalte, die es nicht gibt, beantwortet PostgREST mit 400. Der
 * Ladevorgang meldet dann `{ ok: false, reason: 'error' }`, und `hydrate` zeigt
 * den letzten Stand oder eine Fehlermeldung. Mit `*` käme die Zeile dagegen
 * **ohne** die fehlenden Felder zurück, und der erste Zugriff darauf risse den
 * Ladevorgang mit einem TypeError ab — an `void loadAndHydrate(…)` vorbei, das
 * keinen `catch` hat. Die App bliebe auf „lädt…" stehen, ohne Fehler und ohne
 * Offline-Stand.
 */
const CONG_SPALTEN = [
  'name', 'hall',
  'mid_wd', 'mid_time', 'we_wd', 'we_time',
  'reminder_first', 'reminder_last', 'reminder_repeat',
  'cong_lang', 'prog_langs', 'aux_class',
] as const satisfies ReadonlyArray<keyof CongregationRow>

interface CongregationRow {
  name: string
  hall: string
  mid_wd: number
  mid_time: string
  we_wd: number
  we_time: string
  reminder_first: number
  reminder_last: number
  reminder_repeat: boolean
  cong_lang: string
  prog_langs: string[]
  aux_class: boolean
}

interface WeekRow {
  /** Kennung der Woche (T66): ihr Montag. Eigene Spalte, nicht aus `data`. */
  start: string
  data: Week
  /** Stand der Zeile — Grundlage der Konfliktprüfung beim Speichern (T39). */
  updated_at: string
}

interface AbsenceRow {
  id: string
  person_id: string | null
  user_id: string | null // NULL = importiert (kein Konto dahinter)
  from_date: string
  to_date: string
  reason: string
}

interface NotificationRow {
  id: string
  type: string
  title: string
  body: string
  read: boolean
  created_at: string
  /** Aufgabe, um die es geht; null bei Mitteilungen ohne Aufgabenbezug. */
  task_key?: string | null
}

export interface ConfirmationRow {
  task_key: string
  status: string
}

/**
 * Bestätigungs-Zeilen zur Karte `task_key → Status`.
 *
 * Ein Platz kann **zwei** Zeilen haben: Sagt A ab und springt B ein, steht unter
 * demselben `task_key` A mit „verhindert" und B mit „bestätigt". Die Abfrage
 * kommt ungeordnet zurück — wer zuletzt gelesen wurde, gewann. Beim Einspringen
 * hieß das: Nach dem Neuladen stand der Platz mal als besetzt, mal als abgesagt
 * da, und das längst erledigte Ersatzgesuch tauchte wieder auf.
 *
 * **„Bestätigt" gewinnt.** Ein Platz hat genau einen Bearbeiter; hat einer
 * bestätigt, ist er besetzt — gleich wer vorher abgesagt hat. Wer selbst erst
 * zusagt und dann absagt, hat nur **eine** Zeile (dieselbe wird überschrieben);
 * dieser Fall wird also nicht verdeckt.
 */
export function confirmationMap(rows: readonly ConfirmationRow[]): ConfirmationMap {
  const out: ConfirmationMap = {}
  for (const row of rows) {
    if (row.status !== 'bestätigt' && row.status !== 'verhindert') continue
    if (out[row.task_key] === 'bestätigt') continue
    out[row.task_key] = row.status
  }
  return out
}

interface MemberRow {
  user_id: string
  person_id: string | null
  planner: boolean
  email: string
}

interface InviteRow {
  id: string
  code: string
  person_id: string | null
  planner: boolean
}

const asRole = (r: string): Role => (ROLE_ORDER.includes(r as Role) ? (r as Role) : 'verkuendiger')

const NOTIF_TYPES: NotificationType[] = ['zuteilung', 'erinnerung', 'gesendet', 'import', 'verhindert']
const asNotifType = (t: string): NotificationType =>
  NOTIF_TYPES.includes(t as NotificationType) ? (t as NotificationType) : 'gesendet'

/* ---- Mapper Row ↔ App ---------------------------------------------------- */

function personFromRow(r: PersonRow): Person {
  return {
    id: r.id,
    fn: r.fn,
    ln: r.ln,
    plannerVorgemerkt: r.planner_vorgemerkt || undefined,
    role: asRole(r.role),
    female: r.female || undefined,
    tel: r.tel,
    mail: r.mail,
    priv: normalizePriv(r.priv),
    grp: r.grp ?? null,
    fam: r.fam ?? null,
  }
}

function personToRow(p: Person, congregationId: string) {
  return {
    id: p.id,
    congregation_id: congregationId,
    fn: p.fn,
    ln: p.ln,
    planner_vorgemerkt: Boolean(p.plannerVorgemerkt),
    role: p.role,
    female: Boolean(p.female),
    tel: p.tel,
    mail: p.mail,
    priv: p.priv,
    grp: p.grp ?? null,
    fam: p.fam ?? null,
  }
}

function groupFromRow(r: GroupRow): Group {
  return { id: r.id, name: r.name, overseerId: r.overseer_id, assistantId: r.assistant_id }
}

function groupToRow(g: Group, congregationId: string, position: number) {
  return {
    id: g.id,
    congregation_id: congregationId,
    name: g.name,
    overseer_id: g.overseerId,
    assistant_id: g.assistantId,
    position,
  }
}

/**
 * Eine Grundplan-Regel: `grp` ist in der Datenbank `null` für den
 * Versammlungstreffpunkt, und dieselbe Bedeutung trägt sie in der App — dort
 * stand dafür lange der leere String.
 */
function fsRuleFromRow(r: FsRuleRow): FsRule {
  return {
    id: r.id,
    grp: r.grp,
    wd: r.wd,
    time: kurzeZeit(r.time, '00:00'),
    place: r.place,
    monthly: r.monthly,
    skipCong: r.skip_cong,
  }
}

function fsRuleToRow(r: FsRule, congregationId: string) {
  return {
    id: r.id,
    congregation_id: congregationId,
    grp: r.grp,
    wd: r.wd,
    time: r.time,
    place: r.place,
    monthly: r.monthly,
    skip_cong: r.skipCong,
  }
}

function serviceFromRow(r: ServiceRow): Service {
  return {
    key: r.key,
    name: r.name,
    count: r.count,
    groups: r.groups,
  }
}

function serviceToRow(s: Service, congregationId: string, position: number) {
  return {
    congregation_id: congregationId,
    key: s.key,
    name: s.name,
    count: s.count,
    groups: Boolean(s.groups),
    position,
  }
}

function absenceFromRow(r: AbsenceRow): Absence {
  return {
    id: r.id,
    personId: r.person_id,
    userId: r.user_id,
    from: r.from_date,
    to: r.to_date,
    reason: r.reason,
  }
}

/*
 * Hier stand `relativeTime()` und baute aus dem Zeitstempel einen **deutschen
 * Satz** („vor 3 Std."), der als `Notification.time` mitgeführt wurde.
 * Übersetzen ließ er sich danach nur noch über eine feste Liste von
 * Zeichenketten — und die deckte, wie am 13.8.2026 nachgemessen, ausgerechnet
 * die Stundenzahl ab, die zufällig in den Testdaten stand. Jede andere blieb
 * deutsch, in allen 33 Sprachen.
 *
 * Die Zeile trägt jetzt ihren Zeitstempel (`at`), und die Form entsteht beim
 * Anzeigen — `relativeZeit` in i18n/zeit.ts, über `Intl.RelativeTimeFormat`.
 */

function notificationFromRow(r: NotificationRow): Notification {
  return {
    id: r.id,
    type: asNotifType(r.type),
    title: r.title,
    text: r.body,
    at: r.created_at,
    read: r.read,
    ...(r.task_key ? { taskId: r.task_key } : {}),
  }
}

/**
 * Wie viele Glocken-Zeilen ein Ladevorgang mitnimmt. Älteres räumt
 * `send-reminders` serverseitig ab (30 Tage).
 */
const NOTIF_LIMIT = 50

/**
 * Die Glocken-Abfrage — **eine** Fassung für den vollen Ladevorgang und für das
 * Nachladen beim Öffnen der Glocke. Liefe sie auseinander (andere Grenze,
 * andere Sortierung), zeigte die Glocke nach dem Nachladen etwas anderes als
 * nach einem Neustart, und niemand fände den Grund.
 *
 * Auf die eigene `user_id` filtert die Abfrage nicht: Der Feed ist seit
 * Mitteilungen sind personalisiert, und RLS lässt ohnehin nur die eigenen Zeilen
 * durch.
 */
function notifAbfrage(client: NonNullable<typeof supabase>, congregationId: string) {
  return client
    .from('notifications')
    .select('*')
    .eq('congregation_id', congregationId)
    .order('created_at', { ascending: false })
    .limit(NOTIF_LIMIT)
}

/**
 * Rohzeilen → Glocken-Zeilen.
 *
 * Abgelaufenes fällt heraus (T77): Eine Mitteilung über einen Platz, dessen Tag
 * vorbei ist, interessiert niemanden mehr — „Ersatz gesucht" für letzten
 * Dienstag am wenigsten. Möglich, weil die Zeile weiß, worum es geht; Zeilen
 * ohne Aufgabenbezug tragen keinen Schlüssel und bleiben stehen, sie laufen
 * ohnehin über die Grenze aus.
 */
function notificationsAus(
  rows: NotificationRow[],
  weeks: Week[],
  zeiten: MeetingTimes,
): Notification[] {
  return rows
    .map(notificationFromRow)
    .filter((n) => !n.taskId || !taskKeyVorbei(n.taskId, weeks, zeiten))
}

/**
 * Nur die Glocken-Zeilen nachladen — der leichte Teil eines Ladevorgangs.
 *
 * Beim Öffnen der Glocke lief bis hierher der **volle** Ladevorgang: dreizehn
 * Abfragen, darunter 52 Wochen als JSONB und das ganze Versand-Tagebuch, um
 * fünfzig Zeilen anzuzeigen. Wer die App als PWA offen liegen hat und
 * gelegentlich nachsieht, lud damit jedes Mal die ganze Versammlung neu.
 *
 * `null` heißt „nicht gelesen" (kein Client, Fehler) — dann bleibt der
 * bisherige Stand stehen, wie bei jedem stillen Nachladen.
 */
export async function loadNotifications(
  congregationId: string,
  weeks: Week[],
  zeiten: MeetingTimes,
): Promise<Notification[] | null> {
  if (!supabase) return null
  const { data, error } = await notifAbfrage(supabase, congregationId)
  if (error) {
    console.error('[notifications]', error.message)
    return null
  }
  return notificationsAus((data ?? []) as NotificationRow[], weeks, zeiten)
}

/* ---- Laden --------------------------------------------------------------- */

/**
 * Wie viele Wochen höchstens geladen werden. Ein Jahr reicht für alles, was die
 * App mit Wochen tut: die Auslastung schaut ±3 Wochen weit, die Wartezeit-
 * Reihenfolge braucht nur „länger her als die anderen", und weiter zurück
 * schaut niemand. Ältere Wochen bleiben in der Datenbank stehen.
 */
export const WEEK_LIMIT = 52

/**
 * Wie viele Tagebuch-Zeilen ein Ladevorgang mitnimmt.
 *
 * Reichlich bemessen auf das Ladefenster: Eine Woche hat gut 35 Plätze, und
 * jedes Umteilen legt eine weitere Zeile an. Sechzig je Woche lassen dafür Luft
 * und decken damit alles ab, was für die geladenen Wochen je gebraucht wird.
 */
export const SENT_LOG_LIMIT = WEEK_LIMIT * 60

/**
 * Anfang des Ladefensters: der Montag `WEEK_LIMIT - 1` Wochen vor der jüngsten
 * Woche. Gerechnet wird in UTC, damit keine Zeitzone einen Tag verschiebt.
 *
 * Gibt es noch keine Woche, ist die Grenze gegenstandslos — dann liefert jede
 * Abfrage ohnehin nichts, und die Aufrufer lassen den Filter weg.
 */
function fensterAnfang(juengste: string | undefined): string {
  if (!juengste) return ''
  const d = new Date(`${juengste}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return ''
  d.setUTCDate(d.getUTCDate() - (WEEK_LIMIT - 1) * 7)
  return d.toISOString().slice(0, 10)
}

export interface CongregationData {
  congregation: Congregation
  planner: boolean
  personId: string | null
  persons: Person[]
  services: Service[]
  groups: Group[]
  /** Die geladenen Wochen, aufsteigend nach ihrer Kennung (`start`). */
  weeks: Week[]
  fsRules: FsRule[]
  fsWeeks: FsInstance[][]
  absences: Absence[]
  notifications: Notification[]
  confirmations: ConfirmationMap
  reminders: Reminders
  congLang: string
  progLangs: string[] // weitere Programmsprachen (jw.org-Codes)
  auxClass: boolean // Zusaetzliche Klasse eingerichtet
  members: Member[]
  invites: Invite[]
  /** Wer wurde wann über welchen Platz benachrichtigt (`assignment_log`). */
  sentLog: SentLog
}

export type LoadResult =
  | { ok: true; empty: boolean; data: CongregationData; congregationId: string; userId: string }
  | { ok: false; reason: 'no-membership' | 'error'; message?: string }

/**
 * Lädt alle Daten der Versammlung des eingeloggten Nutzers. Liefert
 * `no-membership`, wenn das Konto keiner Versammlung zugeordnet ist,
 * und `empty`, wenn die Versammlung noch keine Personen/Wochen hat.
 */
export async function loadCongregationData(userId: string): Promise<LoadResult> {
  if (!supabase) return { ok: false, reason: 'error', message: 'kein Client' }

  const { data: member, error: memberErr } = await supabase
    .from('members')
    .select('congregation_id, person_id, planner')
    .eq('user_id', userId)
    .maybeSingle()
  if (memberErr) return { ok: false, reason: 'error', message: memberErr.message }
  if (!member) return { ok: false, reason: 'no-membership' }

  const congregationId = member.congregation_id as string

  // Ladefenster: nur die jüngsten WEEK_LIMIT Wochen. Gemessen wird seit T66 am
  // Datum, nicht an einer Ordnungszahl — eine Lücke im Bestand (T65: die Woche
  // des Gedächtnismahls fehlt im Arbeitsheft) verschiebt damit nichts mehr.
  //
  // Der Anker dafür (`max(start)`) stand bis hierher in einer **eigenen
  // Abfrage vor allen anderen**: eine volle Netzrunde auf dem kritischen Pfad
  // jeder Anmeldung, jedes SIGNED_IN und jedes Konflikt-Neuladens, nur um eine
  // Datumsgrenze zu erfahren. Die Grenze steckt aber im Ergebnis selbst — die
  // jüngste Woche ist die erste Zeile. Also absteigend holen und die Grenze
  // danach anlegen; beide Wochen-Tabellen fahren im selben Zug mit.
  const wochenAbfrage = supabase
    .from('weeks')
    .select('start, data, updated_at')
    .eq('congregation_id', congregationId)
    .order('start', { ascending: false })
    .limit(WEEK_LIMIT)
  const fsWochenAbfrage = supabase
    .from('fs_weeks')
    .select('start, data')
    .eq('congregation_id', congregationId)
    .order('start', { ascending: false })
    .limit(WEEK_LIMIT)

  const [cong, persons, services, groups, weeks, absences, notifs, confs, members, invites, fsRulesRows, fsWeeksRows, sentLogRows] = await Promise.all([
    supabase.from('congregations').select(CONG_SPALTEN.join(', ')).eq('id', congregationId).maybeSingle(),
    supabase.from('persons').select('*').eq('congregation_id', congregationId).order('created_at'),
    supabase.from('services').select('*').eq('congregation_id', congregationId).order('position'),
    supabase.from('groups').select('*').eq('congregation_id', congregationId).order('position'),
    wochenAbfrage,
    // Versammlungsweit, nicht nur die eigenen: die Planung muss wissen, wer
    // fehlt (RLS erlaubt der Versammlung ohnehin das Lesen). „Deine Einträge"
    // im persönlichen Bereich filtert selbst auf die eigene user_id.
    supabase.from('absences').select('*').eq('congregation_id', congregationId).order('from_date'),
    // Dieselbe Abfrage, die auch das Nachladen beim Öffnen der Glocke benutzt.
    notifAbfrage(supabase, congregationId),
    supabase.from('confirmations').select('task_key, status').eq('congregation_id', congregationId),
    // Nicht-Planer sehen per RLS nur die eigene Zeile bzw. keine Einladungen
    supabase.from('members').select('user_id, person_id, planner, email').eq('congregation_id', congregationId).order('created_at'),
    supabase.from('invites').select('id, code, person_id, planner').eq('congregation_id', congregationId).is('redeemed_by', null).order('created_at'),
    supabase.from('fs_rules').select('*').eq('congregation_id', congregationId).order('created_at'),
    fsWochenAbfrage,
    // Versand-Tagebuch: welcher Platz wurde wann gemeldet. Der
    // Planen-Screen zeigt es an, und der „Plan senden"-Knopf zählt daraus, was
    // noch aussteht.
    //
    // **Jüngste zuerst, und begrenzt.** Die Tabelle wächst und wird nie
    // aufgeräumt: rund 35 Plätze je Woche, ein Jahr sind gegen 1800 Zeilen, und
    // dabei bleibt es nicht. Ungebremst holte jeder Kaltstart nach ein paar
    // Jahren den ganzen Bestand — in den Zustand, von dort in die
    // Momentaufnahme im Browser-Speicher, und deren Platz ist knapp. Absteigend
    // sortiert kann die Grenze nichts Gebrauchtes abschneiden: Was für die
    // geladenen Wochen zählt, wurde zuletzt gemeldet und steht damit vorn.
    supabase
      .from('assignment_log')
      .select('task_key, name, sent_at')
      .eq('congregation_id', congregationId)
      .order('sent_at', { ascending: false })
      .limit(SENT_LOG_LIMIT),
  ])

  // Alle dreizehn Abfragen prüfen, nicht zehn: fehlten fs_rules/fs_weeks in der
  // Liste, blieb ein Ladefehler dort stumm und die Treffpunkte kamen einfach
  // leer an — genau der Fall bei einer Instanz ohne Migration 010.
  //
  // Das Versand-Tagebuch steht **nicht** in dieser Liste, und zwar mit Absicht:
  // Fehlt die Tabelle, bleibt die Anzeige „benachrichtigt am" leer — das ist
  // eine fehlende Auskunft, kein fehlender Datenbestand, und die App bleibt
  // benutzbar.
  const firstErr = [cong, persons, services, groups, weeks, absences, notifs, confs, members, invites, fsRulesRows, fsWeeksRows]
    .find((r) => r.error)?.error
  if (firstErr) return { ok: false, reason: 'error', message: firstErr.message }
  if (sentLogRows.error) console.error('[assignment_log]', sentLogRows.error.message)

  const serviceList = (services.data ?? []).map((r) => serviceFromRow(r as ServiceRow))
  const personList = (persons.data ?? []).map((r) => personFromRow(r as PersonRow))
  // Absteigend geholt, aufsteigend gebraucht (`CongregationData.weeks`).
  const wochenAbsteigend = (weeks.data ?? []) as WeekRow[]
  const ab = fensterAnfang(wochenAbsteigend[0]?.start)
  // Die Grenze bleibt dieselbe Rechnung wie zuvor. Sie schneidet hier nichts
  // mehr weg, was die Abfrage nicht ohnehin ausgelassen hätte: die Kennung ist
  // ein Montag (T66) und je Versammlung eindeutig, in ein Fenster von
  // WEEK_LIMIT Wochen passen also nie mehr als WEEK_LIMIT Wochen. Sie steht
  // trotzdem da — als das, was das Fenster ausmacht, und als Halt, falls je
  // eine Kennung auf einen anderen Wochentag fiele.
  const imFenster = <T extends { start: string }>(rows: T[]): T[] =>
    (ab ? rows.filter((r) => r.start >= ab) : rows).slice().reverse()
  const weekRows = imFenster(wochenAbsteigend)
  // Stände merken: jeder spätere Schreibvorgang nennt den Stand, auf dem er
  // beruht (T39). Vor dem Füllen leeren — ein zweiter Ladevorgang (Neuanmeldung,
  // Konflikt-Nachladen) darf keine Stände einer anderen Versammlung erben.
  staendeSetzen(weekRows.map((r) => [r.start, r.updated_at]))
  // Die Kennung kommt aus der **Spalte**, nicht aus dem Blob: sie ist der
  // Primärschlüssel der Woche, der Blob trägt nur das Programm. Damit trägt
  // jede geladene Woche ihr Datum, auch die älteste.
  //
  // Hier wurde bis T66 ein Array der Länge `höchstePosition + 1` aufgespannt
  // und jede Zeile an ihren Index gesetzt, mit Platzhaltern in den Lücken —
  // weil der Index die Position war und in jedem `task_key` steckte. Jetzt
  // reihen sich die Zeilen einfach nach Datum: eine fehlende Woche ist eine
  // fehlende Woche und verschiebt nichts.
  //
  // **Der Ladevorgang liest nur.** Er trug einmal Kennungen nach, hob
  // Alt-Formate und schrieb das Ergebnis zurück — mitten in die Arbeit des
  // Planers hinein. Seit jeder Punkt seine Kennung beim Entstehen bekommt
  // (`PartItem.iid`) und jede Zuteilung ihre `pid`, bleibt nur noch das
  // Binden loser Namen an ihre Person, und das geschieht rein im Speicher.
  const roh = weekRows.map((r) => ({ ...r.data, start: r.start }))
  const weekList = normalizeChairKeys(pidsNachtragen(roh, personList))
  const confirmations = confirmationMap((confs.data ?? []) as ConfirmationRow[])

  const gruppenListe = ((groups.data ?? []) as GroupRow[]).map(groupFromRow)

  // Fehlt die Zeile (nur denkbar, wenn jemand sie zwischen zwei Abfragen
  // löscht), gelten die Vorgaben einer frisch angelegten Versammlung.
  const c = cong.data as CongregationRow | null
  // **Dieselbe Umrechnung wie in den Edge Functions**, nicht eine zweite: Sie
  // steht im geteilten Modul und damit unter der Gegenprobe in
  // `edge-parity.test.ts`. Eine eigene Fassung hier liefe still auseinander —
  // und dann zeigte die App einen anderen Termin, als die Erinnerung nennt.
  const zeiten = zeitenAus(c ?? undefined)
  const reminders: Reminders = {
    first: c?.reminder_first ?? STANDARD_ERINNERUNGEN.first,
    last: c?.reminder_last ?? STANDARD_ERINNERUNGEN.last,
    repeat: c?.reminder_repeat ?? STANDARD_ERINNERUNGEN.repeat,
    // `onAssign` stand hier bis T99. Der Schalter steuerte die Mitteilung
    // „Zuteilung gesendet" an die Planer, und die gibt es nicht mehr — an ihre
    // Stelle ist „Plan senden" getreten.
  }

  // Treffpunkte: Grundplan-Blob + je Woche gespeicherte Instanzen (Kennung → Daten).
  // Die Wochen werden am Montag der Programmwoche (`week.start`) neu
  // ausgerichtet — Leiter und wochenspezifische Zeit/Ort bleiben erhalten, nur
  // die Regel→Woche-Zuordnung (z. B. „1. Samstag im Monat") wird anhand des
  // Datums neu bestimmt.
  const fsRules = ((fsRulesRows.data ?? []) as FsRuleRow[]).map(fsRuleFromRow)
  // Zugeordnet wird über das Datum, nicht über die Zeilenfolge: beide Tabellen
  // führen dieselbe Kennung, und nur so bleiben Treffpunkte an ihrer Woche,
  // wenn im Bestand eine fehlt.
  const fsNachWoche = new Map<string, FsInstance[]>()
  for (const row of imFenster((fsWeeksRows.data ?? []) as { start: string; data: FsInstance[] }[])) {
    fsNachWoche.set(row.start, row.data)
  }
  const storedFsWeeks: FsInstance[][] = weekList.map((w) => fsNachWoche.get(w.start) ?? [])
  const ausgerichtet = fsRules.length
    ? regenFsWeeks(weekList.map((w) => w.start), storedFsWeeks, fsRules, true)
    : storedFsWeeks
  // Leiter ohne `lpid` an ihre Person binden — dasselbe, was `pidsNachtragen`
  // eine Bildschirmhöhe weiter oben für die Zusammenkünfte tut. Ohne das bliebe
  // eine gelöschte und neu angelegte Person in ihren Treffpunkten für immer ein
  // bloßer Name.
  const fsWeeks = fsLeiterBinden(ausgerichtet, personList)

  const data: CongregationData = {
    congregation: { name: c?.name ?? '', hall: c?.hall ?? '', times: zeiten },
    planner: Boolean(member.planner),
    personId: (member.person_id as string | null) ?? null,
    persons: personList,
    services: serviceList,
    groups: gruppenListe,
    weeks: weekList,
    fsRules,
    fsWeeks,
    absences: (absences.data ?? []).map((r) => absenceFromRow(r as AbsenceRow)),
    notifications: notificationsAus((notifs.data ?? []) as NotificationRow[], weekList, zeiten),
    confirmations,
    reminders,
    auxClass: c?.aux_class ?? false,
    // **Eine Sprache ist ein Code**, in der Datenbank wie im Zustand (T105) —
    // an dieser Grenze wird nichts umgesetzt.
    congLang: c?.cong_lang ?? 'de',
    progLangs: c?.prog_langs ?? [],
    members: ((members.data ?? []) as MemberRow[]).map((r) => ({
      userId: r.user_id,
      email: r.email,
      personId: r.person_id,
      planner: r.planner,
    })),
    invites: ((invites.data ?? []) as InviteRow[]).map((r) => ({
      id: r.id,
      code: r.code,
      personId: r.person_id,
      planner: r.planner,
    })),
    sentLog: Object.fromEntries(
      ((sentLogRows.data ?? []) as { task_key: string; name: string; sent_at: string }[]).map(
        (r) => [sentKey(r.task_key, r.name), r.sent_at],
      ),
    ),
  }

  const empty = personList.length === 0 && weekList.length === 0
  return { ok: true, empty, data, congregationId, userId }
}

/* ---- Schreiben ----------------------------------------------------------- */

/**
 * Alle `save*`/`delete*`-Funktionen sind fire-and-forget: der Reducer zeigt
 * den Erfolg, **bevor** geschrieben wurde. Schlug das Schreiben fehl —
 * RLS-Verstoß, abgelaufenes Token, kein Netz, Timeout —, stand das bislang nur
 * in der Konsole. Der Nutzer sah „Zugeteilt", die Datenbank hatte nichts.
 *
 * Diese Schicht kennt weder Dispatch noch Sprache. Sie meldet deshalb nur,
 * *dass* etwas schiefging; wer das anzeigt, meldet sich hier an (store.tsx).
 * Die Fehlermeldung selbst bleibt in der Konsole: sie kommt aus der Datenbank
 * und gehört nicht ungefiltert vor den Nutzer.
 */
type Fehlermelder = () => void

let melder: Fehlermelder | null = null

export function setSchreibfehlerMelder(fn: Fehlermelder | null): void {
  melder = fn
}

/** Einen Schreib- oder Lesefehler melden: Konsole für die Ursache, Melder für den Nutzer. */
function schreibfehler(error: { message: string }): void {
  console.error('[persistenz]', error.message)
  melder?.()
}

async function run(promise: PromiseLike<{ error: { message: string } | null }>): Promise<void> {
  const { error } = await promise
  if (error) schreibfehler(error)
}

/* ---- Schreibkonflikte zwischen Planern (T39) ----------------------------- */

/**
 * Stand je Woche, wie ihn die Datenbank zuletzt bestätigt hat — geführt über
 * ihre Kennung (`start`), seit T66 nicht mehr über eine Ordnungszahl.
 *
 * `saveWeek` schrieb die **komplette Woche** als Upsert — ohne Sperre und ohne
 * Versionskennzeichen. Planen zwei Koordinatoren gleichzeitig, gewinnt der
 * Letzte: seine Fassung überschreibt die des anderen vollständig und lautlos.
 *
 * Die Werte werden nie selbst gebildet, sondern immer nur zurückgereicht — die
 * Zeichenkette kommt aus PostgREST und geht unverändert dorthin zurück. Damit
 * sind Genauigkeit und Zeitzone kein Thema.
 */
const wochenStand = new Map<string, string>()

/**
 * Schreibvorgänge je Woche hintereinander.
 *
 * Ohne das kämpfte man gegen sich selbst: zwei rasch aufeinanderfolgende
 * Änderungen derselben Woche gingen beide mit demselben Stand los, und die
 * zweite meldete einen Konflikt, den es nicht gab.
 */
const wochenKette = new Map<string, Promise<void>>()

function staendeSetzen(paare: Array<[string, string]>): void {
  wochenStand.clear()
  wochenKette.clear()
  for (const [woche, stand] of paare) wochenStand.set(woche, stand)
}

/**
 * Meldung „ein anderer Planer war schneller". Wie beim Schreibfehler kennt
 * diese Schicht weder Dispatch noch Sprache — sie meldet nur, *dass* es
 * passiert ist; wer neu lädt und es anzeigt, meldet sich hier an (store.tsx).
 */
type Konfliktmelder = () => void

let konfliktMelder: Konfliktmelder | null = null

export function setKonfliktMelder(fn: Konfliktmelder | null): void {
  konfliktMelder = fn
}

/**
 * Eine Woche schreiben und dabei den Stand prüfen.
 *
 * Ablauf:
 *  1. Kein Stand bekannt → die Zeile gibt es hier noch nicht: einfügen.
 *  2. Stand bekannt → Update **mit** Bedingung `updated_at = <Stand>`.
 *     Eine getroffene Zeile bringt den neuen Stand zurück; fertig.
 *  3. Keine Zeile getroffen → nachsehen, warum. Steht dort noch immer unser
 *     Stand, war es kein Konflikt, sondern eine Eigenheit des Vergleichs —
 *     dann ungeschützt schreiben. Steht ein anderer da, war jemand schneller.
 *
 * Schritt 3 ist der Grund, warum hier überhaupt nachgefragt wird: ein
 * **falscher** Konfliktalarm würde die Arbeit des Nutzers verwerfen. Der
 * zusätzliche Umlauf kostet nur in dem Fall etwas, in dem sonst etwas
 * verlorenginge.
 */
async function schreibeWoche(congregationId: string, woche: string, week: Week): Promise<void> {
  if (!supabase) return
  const stand = wochenStand.get(woche)

  if (stand === undefined) {
    const { data, error } = await supabase
      .from('weeks')
      .insert({ congregation_id: congregationId, start: woche, data: week })
      .select('updated_at')
      .maybeSingle()
    if (error) {
      // Verstoß gegen unique(congregation_id, start): die Zeile existiert
      // längst, wir kannten sie nur nicht — also hat sie ein anderer angelegt.
      if (error.code === '23505') konfliktMelder?.()
      else schreibfehler(error)
      return
    }
    if (data) wochenStand.set(woche, data.updated_at as string)
    return
  }

  const { data, error } = await supabase
    .from('weeks')
    .update({ data: week })
    .eq('congregation_id', congregationId)
    .eq('start', woche)
    .eq('updated_at', stand)
    .select('updated_at')
    .maybeSingle()
  if (error) {
    schreibfehler(error)
    return
  }
  if (data) {
    wochenStand.set(woche, data.updated_at as string)
    return
  }

  const { data: jetzt, error: leseFehler } = await supabase
    .from('weeks')
    .select('updated_at')
    .eq('congregation_id', congregationId)
    .eq('start', woche)
    .maybeSingle()
  if (leseFehler) {
    schreibfehler(leseFehler)
    return
  }
  if (jetzt && jetzt.updated_at === stand) {
    // Der Stand ist unverändert — niemand war schneller. Der Filter hat die
    // Zeile aus einem anderen Grund nicht getroffen; ohne diesen zweiten Anlauf
    // ginge die Änderung verloren, obwohl nichts kollidiert ist.
    const { data: erneut, error: schreibFehler } = await supabase
      .from('weeks')
      .update({ data: week })
      .eq('congregation_id', congregationId)
      .eq('start', woche)
      .select('updated_at')
      .maybeSingle()
    if (schreibFehler) {
      schreibfehler(schreibFehler)
      return
    }
    if (erneut) wochenStand.set(woche, erneut.updated_at as string)
    return
  }
  konfliktMelder?.()
}

/**
 * Eine Woche speichern. Welche Zeile gemeint ist, sagt ihre eigene Kennung —
 * kein Index von außen mehr (T66).
 */
export function saveWeek(congregationId: string, week: Week): void {
  if (!supabase) return
  // Ohne Kennung gibt es keine Zeile, die gemeint sein könnte. Hier stand bis
  // T66 die Platzhalter-Prüfung; sie hatte denselben Zweck — nichts schreiben,
  // was keine Woche bezeichnet.
  const woche = week.start
  if (!woche) return
  const vorher = wochenKette.get(woche) ?? Promise.resolve()
  // `catch` vor dem Anhängen: ein Fehlschlag darf die Kette nicht abreißen
  // lassen, sonst schriebe diese Woche nie wieder.
  const naechster = vorher.then(() => schreibeWoche(congregationId, woche, week).catch(() => {}))
  wochenKette.set(woche, naechster)
}

export function savePerson(congregationId: string, person: Person): void {
  if (!supabase) return
  void run(supabase.from('persons').upsert(personToRow(person, congregationId)))
}

/**
 * Grundplan der Treffpunkte — eine Zeile je Regel.
 *
 * Bis zum 18. September 2026 ging der ganze Grundplan als **ein JSONB-Blob** in
 * eine Zeile je Versammlung, samt einer Spalte `base`, die geschrieben und nie
 * gelesen wurde. Eine Regel ist aber eine gewöhnliche Zeile mit einem Verweis
 * auf eine Gruppe; im Blob konnte dieser Verweis kein Fremdschlüssel sein, und
 * deshalb musste die App beim Löschen einer Gruppe selbst darin aufräumen.
 *
 * **Gelöscht wird, was dieser Planer entfernt hat** (`entfernt`) — nicht alles,
 * was nicht in seiner Liste steht. Der Unterschied zählt, sobald zwei Planer
 * zugleich arbeiten: Hier stand `delete … where id not in (<meine Regeln>)`,
 * und damit räumte jedes Speichern die Regel weg, die der andere gerade
 * angelegt hatte — ohne Fehler, ohne Konflikt, auf beiden Bildschirmen
 * unbemerkt. Die Wochen sind gegen genau das durch Vergleiche-und-Tausche
 * geschützt (T39); der Grundplan hat keine solche Sperre, also darf er auch
 * nichts anfassen, wovon er nichts weiß.
 *
 * Nacheinander, nicht nebeneinander — sonst könnte das Löschen eine gerade
 * erst geschriebene Zeile treffen.
 */
export function saveFsRules(congregationId: string, rules: FsRule[], entfernt: string[] = []): void {
  if (!supabase) return
  const client = supabase
  void run(
    (async () => {
      if (entfernt.length) {
        const { error } = await client
          .from('fs_rules')
          .delete()
          .eq('congregation_id', congregationId)
          .in('id', entfernt)
        if (error) return { error }
      }
      if (!rules.length) return { error: null }
      return await client
        .from('fs_rules')
        .upsert(rules.map((r) => fsRuleToRow(r, congregationId)))
    })(),
  )
}

/** Materialisierte Treffpunkte einer Woche (Kennung → FsInstance[]). */
export function saveFsWeek(congregationId: string, woche: string, insts: FsInstance[]): void {
  if (!supabase || !woche) return
  void run(
    supabase
      .from('fs_weeks')
      .upsert(
        { congregation_id: congregationId, start: woche, data: insts },
        { onConflict: 'congregation_id,start' },
      ),
  )
}

export function deletePersonRow(id: string): void {
  if (!supabase) return
  void run(supabase.from('persons').delete().eq('id', id))
}

export function saveService(congregationId: string, service: Service, position: number): void {
  if (!supabase) return
  void run(
    supabase
      .from('services')
      .upsert(serviceToRow(service, congregationId, position), { onConflict: 'congregation_id,key' }),
  )
}

export function deleteServiceRow(congregationId: string, key: string): void {
  if (!supabase) return
  void run(supabase.from('services').delete().eq('congregation_id', congregationId).eq('key', key))
}

/**
 * Eine Predigtdienstgruppe speichern — **mit ihrer Position**.
 *
 * Hier stand eine feste `0`. Geladen werden die Gruppen aber `.order('position')`
 * (siehe unten), und bei lauter Nullen ist die Reihenfolge das, was die
 * Datenbank gerade zurückgibt: die Ablage im Heap. Ein `update` schreibt eine
 * neue Version der Zeile, meist ans Ende — wer den Aufseher von „Gruppe 2"
 * ändert, sah sie danach hinter „Gruppe 4" stehen.
 *
 * Es bleibt nicht bei der Liste: Die **Reinigung rotiert über die Gruppen**
 * (`groups[weekIndex % groups.length]` in `autoAssignMeeting`). Springt eine
 * Gruppe in der Reihenfolge, rotiert die Zuteilung ab da anders herum, als der
 * Planer sie kennt — für dieselbe Woche käme beim nächsten Lauf eine andere
 * Gruppe heraus.
 *
 * `position` ist der Index in `state.groups`, genau wie bei den Diensten
 * (`saveService`): Die Liste steht in Ladereihenfolge, und neue Gruppen hängen
 * sich hinten an.
 */
export function saveGroupRow(congregationId: string, group: Group, position: number): void {
  if (!supabase) return
  void run(supabase.from('groups').upsert(groupToRow(group, congregationId, position)))
}

export function deleteGroupRow(id: string): void {
  if (!supabase) return
  void run(supabase.from('groups').delete().eq('id', id))
}

/** Schreibt nur die Gruppen-Zuordnung (grp) einer Person zurück. */
export function savePersonGroup(person: Person): void {
  if (!supabase) return
  void run(supabase.from('persons').update({ grp: person.grp ?? null }).eq('id', person.id))
}

/**
 * Haushalt anlegen (falls neu) und die beteiligten Personen darauf setzen.
 *
 * **Nacheinander, und das ist der Grund für diese Funktion.** Der Haushalt ist
 * seit T105 eine eigene Zeile, auf die `persons.fam` per Fremdschlüssel zeigt;
 * ginge die Person vor ihm hinaus, wiese die Datenbank sie ab. Alle übrigen
 * Schreibwege hier sind bewusst „abschicken und weitergehen" — dieser eine hat
 * eine Reihenfolge, also steht sie an einer Stelle.
 */
export function saveFamily(congregationId: string, haushalt: string, personen: Person[]): void {
  if (!supabase) return
  const client = supabase
  void run(
    (async () => {
      const { error } = await client
        .from('households')
        .upsert({ id: haushalt, congregation_id: congregationId })
      if (error) return { error }
      return await client
        .from('persons')
        .upsert(personen.map((p) => personToRow(p, congregationId)))
    })(),
  )
}

/**
 * Haushalt löschen — die Personen darin verlieren ihre `fam` über den
 * Fremdschlüssel (`on delete set null`), ohne dass sie eigens geschrieben
 * werden müssten.
 */
export function deleteHouseholdRow(id: string): void {
  if (!supabase) return
  void run(supabase.from('households').delete().eq('id', id))
}

/**
 * Push-Abo dieses Geräts speichern (Endpoint ist eindeutig → Upsert).
 *
 * `lang` ist die App-Sprache dieses Geräts: der Text einer Push-Nachricht
 * entsteht beim Versand und lässt sich danach nicht mehr übersetzen.
 */
export function savePushSubscription(
  congregationId: string,
  userId: string,
  sub: { endpoint: string; p256dh: string; auth: string },
  lang: string,
): void {
  if (!supabase) return
  void run(
    supabase.from('push_subscriptions').upsert(
      {
        congregation_id: congregationId,
        user_id: userId,
        endpoint: sub.endpoint,
        p256dh: sub.p256dh,
        auth: sub.auth,
        lang,
      },
      { onConflict: 'endpoint' },
    ),
  )
}

/**
 * Sprache eines bestehenden Abos nachziehen. Ohne das bekäme jemand, der die
 * Sprache nach dem Aktivieren wechselt, weiter Erinnerungen in der alten.
 */
export function savePushLanguage(endpoint: string, lang: string): void {
  if (!supabase) return
  void run(supabase.from('push_subscriptions').update({ lang }).eq('endpoint', endpoint))
}

export function deletePushSubscription(endpoint: string): void {
  if (!supabase) return
  void run(supabase.from('push_subscriptions').delete().eq('endpoint', endpoint))
}

/**
 * Abwesenheit anlegen.
 *
 * Ersteller und betroffene Person kommen **aus dem Datensatz**, nicht von
 * außen. Sie standen bis August 2026 als eigene Parameter daneben, und der
 * einzige Aufrufer füllte sie aus dem angemeldeten Konto — was stimmte, solange
 * jeder nur seine eigenen erfassen konnte. Seit der Planer sie im Personen-
 * Detail für **andere** einträgt, wäre das falsch: Die Zeile landete auf seiner
 * Person statt auf der gemeinten, und niemand sähe es. Ein Datensatz, der beide
 * Angaben schon trägt, darf sie nicht ein zweites Mal übergeben bekommen.
 */
export function saveAbsence(congregationId: string, absence: Absence): void {
  if (!supabase) return
  void run(
    supabase.from('absences').insert({
      id: absence.id,
      congregation_id: congregationId,
      user_id: absence.userId,
      person_id: absence.personId,
      from_date: absence.from,
      to_date: absence.to,
      reason: absence.reason,
    }),
  )
}

export function deleteAbsenceRow(id: string): void {
  if (!supabase) return
  void run(supabase.from('absences').delete().eq('id', id))
}

/**
 * Mitteilung an die Planer der Versammlung (`notify_planners`, security
 * definer): je Planer eine eigene Zeile → eigener Gelesen-/Lösch-Status.
 * Erinnerungen erzeugt die Edge Function selbst; Client-Mitteilungen sind
 * Import, „Plan gesendet" und Verhinderung.
 *
 * Die Empfänger bestimmt die Datenbank, nicht der Client. Ein Verkündiger
 * sieht in `members` nur die eigene Zeile (`members_select`) — wer die Planer
 * aus `state.members` herausfilterte, bekam für jede Verhinderung eine leere
 * Liste und schrieb still nichts (so bis zum 24.9.2026).
 */
export function notifyPlanners(type: NotificationType, title: string, body: string): void {
  if (!supabase) return
  void run(supabase.rpc('notify_planners', { kind: type, subject: title, message: body }))
}

/**
 * Ersatzgesuch: qualifizierte Personen (gleicher Hilfsdienst) benachrichtigen
 * (Sofort-Push + In-App). Läuft serverseitig (Edge Function `substitute`), weil
 * Push nur mit dem privaten VAPID-Schlüssel geht. Fire-and-forget.
 */
/*
 * **Ohne `congregationId`.** Das Feld stand hier, seit es die Function gab, und
 * war der Angriffsweg aus S10: Der Server nahm die Versammlung aus dem Rumpf,
 * statt sie zu lesen. Seit dem Ausrollen am 24.8.2026 wertet er es nicht mehr
 * aus — und ein Feld, das niemand auswertet, ist genau die offene Fläche, die
 * bei `import-week` zu S12 geführt hat. Also weg damit.
 */
export function substituteSeek(taskKey: string): void {
  if (!supabase) return
  void run(supabase.functions.invoke('substitute', { body: { action: 'seek', taskKey } }))
}

/**
 * Hilfsdienst-Ersatz übernehmen: trägt den Aufrufer serverseitig in den Slot ein,
 * setzt die Bestätigung und informiert Ursprungsperson + Planer. Nötig, weil
 * Wochen/Bestätigungen nur der Planer schreiben darf (RLS). Fire-and-forget —
 * der Client aktualisiert seinen Stand optimistisch.
 */
export function substituteTake(taskKey: string): void {
  if (!supabase) return
  // Über run(): scheitert die Übernahme, hat der Aufrufer sonst „Übernommen"
  // gesehen, während der Slot serverseitig unverändert blieb.
  void run(supabase.functions.invoke('substitute', { body: { action: 'take', taskKey } }))
}

/**
 * Ersatzgesuch zurückziehen: „Doch bestätigen" nach einer Absage. Die Zeilen
 * „Ersatz gesucht" stehen in den Glocken der Angepingten — fremde Zeilen, die
 * nur der Server entfernen kann (RLS). Die eigene Bestätigung schreibt
 * `saveConfirmation` unabhängig davon. Fire-and-forget.
 */
export function substituteWithdraw(taskKey: string): void {
  if (!supabase) return
  void run(supabase.functions.invoke('substitute', { body: { action: 'withdraw', taskKey } }))
}

/** Ergebnis eines „Plan senden"-Laufs (Edge Function `send-plan`). */
export interface PlanVersand {
  /** Wie viele Personen eine Nachricht bekommen haben. */
  personen: number
  /** Namen ohne App-Konto — die muss der Planer persönlich ansprechen. */
  ohneKonto: string[]
}

/**
 * „Plan senden": jede eingeteilte Person bekommt **eine** Nachricht mit allen
 * ihren Aufgaben dieser Woche.
 *
 * Läuft serverseitig, weil Web-Push den privaten VAPID-Schlüssel braucht und
 * weil das Versand-Tagebuch (`assignment_log`) nur die Service-Role schreiben
 * darf — ein Client, der sich selbst als „informiert" einträgt, könnte damit
 * Nachrichten unterdrücken.
 *
 * **Nicht** fire-and-forget wie die übrigen Aufrufe: Der Planer hat den Knopf
 * bewusst gedrückt und muss erfahren, was daraus wurde — vor allem, wen er
 * mangels Konto selbst ansprechen muss.
 */
export async function sendPlan(weekStart: string, heute: string): Promise<PlanVersand | null> {
  if (!supabase) return null
  const { data, error } = await supabase.functions.invoke('send-plan', {
    // `heute`: der Kalendertag, mit dem die Vorschau am Knopf gerechnet hat —
    // die Function lässt Vergangenes weg und soll denselben Tag meinen.
    body: { action: 'plan', weekStart, heute },
  })
  if (error) {
    console.error('[send-plan]', error.message)
    return null
  }
  const res = data as Partial<PlanVersand> | null
  return {
    personen: res?.personen ?? 0,
    ohneKonto: res?.ohneKonto ?? [],
  }
}

/**
 * **Bestätigte** Zuteilungen wurden zurückgezogen oder verlegt — die
 * betroffenen Personen erfahren es sofort.
 *
 * Das ist der einzige Fall, in dem eine Zuteilungs-Nachricht nicht auf den
 * Knopf wartet: Wer zugesagt hat, bereitet vor. Bliebe es beim nächsten „Plan
 * senden", übte jemand tagelang für einen Platz, den er nicht mehr hat.
 *
 * **Ein Aufruf für alle Entzüge einer Änderung.** Hier ging je Entzug ein
 * eigener `invoke` hinaus, und die Function wiederholte für jeden davor
 * dieselben fünf REST-Runden über Mitglieder, Personen und Push-Abos. Eine
 * Auto-Zuteilung, die eine Zusammenkunft neu besetzt, löste damit ein Dutzend
 * voller Aufrufe aus — für Nachrichten, die ohnehin alle aus demselben Bestand
 * zugestellt werden. Als Liste sind es fünf Runden, einmal.
 *
 * Bezeichnung und Termin gehen kanonisch deutsch mit — der Client hat den Platz
 * gerade in der Hand, die Function könnte ihn nach dem Überschreiben nicht mehr
 * nachschlagen.
 *
 * **Reihenfolge beim Ausrollen:** Die Function muss die Listenform kennen,
 * bevor ein Client sie schickt (`npx supabase functions deploy send-plan`).
 * Umgekehrt ist es unkritisch — die alte Einzelform nimmt sie weiter an.
 */
export function sendPlanEntzug(entzuege: EntzogeneZusage[]): void {
  if (!supabase || entzuege.length === 0) return
  // **Kein `run()`**: Dessen Fehlerweg meldet „Änderung konnte nicht gespeichert
  // werden" — hier ist aber nichts zu speichern, sondern eine Nachricht zu
  // schicken. Der Planer bekäme eine Warnung über einen Verlust, den es nicht
  // gab, während seine Änderung längst in der Datenbank steht.
  void supabase.functions
    .invoke('send-plan', {
      body: {
        action: 'entzug',
        entzuege: entzuege.map((z) => ({
          taskKey: z.key,
          name: z.name,
          pid: z.pid,
          label: z.label,
          datum: z.datum,
        })),
      },
    })
    .then(({ error }) => {
      if (error) console.error('[send-plan/entzug]', error.message)
    })
}

export function markNotificationsRead(congregationId: string, userId: string): void {
  if (!supabase) return
  void run(
    supabase
      .from('notifications')
      .update({ read: true })
      .eq('congregation_id', congregationId)
      .eq('user_id', userId),
  )
}

export function deleteNotifications(congregationId: string, userId: string): void {
  if (!supabase) return
  void run(
    supabase
      .from('notifications')
      .delete()
      .eq('congregation_id', congregationId)
      .eq('user_id', userId),
  )
}

export function saveCongregationInfo(congregationId: string, info: Congregation): void {
  if (!supabase) return
  void run(
    supabase
      .from('congregations')
      .update({
        name: info.name,
        hall: info.hall,
        mid_wd: info.times.mid.wd,
        mid_time: info.times.mid.time,
        we_wd: info.times.we.wd,
        we_time: info.times.we.time,
      })
      .eq('id', congregationId),
  )
}

/**
 * Versammlungsweite Einstellungen (Erinnerungen, Sprachen, Zusätzliche Klasse).
 *
 * Bis zum 17. September 2026 gingen sie als ein JSONB-Objekt `settings` in eine
 * einzige Spalte. Jetzt sind es Spalten mit Typ und Grenzen — die Zusagen
 * „1..21 Tage" und „0..7 Tage" standen vorher nur im Eingabefeld.
 */
export function saveSettings(
  congregationId: string,
  settings: { reminders: Reminders; congLang: string; progLangs: string[]; auxClass: boolean },
): void {
  if (!supabase) return
  void run(
    supabase
      .from('congregations')
      .update({
        reminder_first: settings.reminders.first,
        reminder_last: settings.reminders.last,
        reminder_repeat: settings.reminders.repeat,
        cong_lang: settings.congLang,
        prog_langs: settings.progLangs,
        aux_class: settings.auxClass,
      })
      .eq('id', congregationId),
  )
}

/** Bestätigung/Verhinderung einer Aufgabe (eigene Zeile je Nutzer+Slot). */
export function saveConfirmation(
  congregationId: string,
  userId: string,
  taskKey: string,
  status: Exclude<TaskStatus, 'offen'>,
): void {
  if (!supabase) return
  void run(
    supabase.from('confirmations').upsert(
      { congregation_id: congregationId, user_id: userId, task_key: taskKey, status },
      { onConflict: 'congregation_id,task_key,user_id' },
    ),
  )
}

/**
 * Bestätigungs-Einträge (alle Nutzer) der angegebenen Slots löschen — beim
 * Neu-Zuteilen, damit kein fremder Status am Slot kleben bleibt
 * (RLS-Richtlinie `confirmations_delete_planner`).
 */
export function deleteConfirmationRows(congregationId: string, taskKeys: string[]): void {
  if (!supabase || taskKeys.length === 0) return
  void run(
    supabase
      .from('confirmations')
      .delete()
      .eq('congregation_id', congregationId)
      .in('task_key', taskKeys),
  )
}

/* ---- Mitglieder & Einladungen (nur Planer, RLS-geschützt) ---------------- */

export function saveMemberRow(member: Member): void {
  if (!supabase) return
  void run(
    supabase
      .from('members')
      .update({ person_id: member.personId, planner: member.planner })
      .eq('user_id', member.userId),
  )
}

export function deleteMemberRow(userId: string): void {
  if (!supabase) return
  void run(supabase.from('members').delete().eq('user_id', userId))
}

/** Planer-Flag eines offenen Codes nachziehen (Person-Recht geändert). */
export function saveInvitePlanner(id: string, planner: boolean): void {
  if (!supabase) return
  void run(supabase.from('invites').update({ planner }).eq('id', id))
}

export function saveInvite(congregationId: string, invite: Invite): void {
  if (!supabase) return
  void run(
    supabase.from('invites').insert({
      id: invite.id,
      congregation_id: congregationId,
      code: invite.code,
      person_id: invite.personId,
      planner: invite.planner,
    }),
  )
}

export function deleteInviteRow(id: string): void {
  if (!supabase) return
  void run(supabase.from('invites').delete().eq('id', id))
}

/**
 * Einladungscode einlösen (redeem_invite, security definer). Liefert null bei
 * Erfolg, sonst den Fehlercode 'already-member' | 'invalid-code' | Meldung.
 */
export async function redeemInvite(code: string): Promise<string | null> {
  if (!supabase) return 'invalid-code'
  // Leerer/nur-Leerzeichen-Code gar nicht erst an den Server schicken.
  if (!code.trim()) return 'invalid-code'
  const { data, error } = await supabase.rpc('redeem_invite', { invite_code: code })
  if (error) return error.message
  return (data as string | null) ?? null
}

/**
 * Gut lesbarer Einladungscode: 8 Zeichen ohne 0/O/1/I (32er-Alphabet). Da 32
 * die 256 möglichen Byte-Werte glatt teilt, ist die Verteilung ohne Modulo-Bias.
 */
export function generateInviteCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join('')
}
