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

import {
  buildDemoWeeks,
  DEMO_PERSONS,
  DEMO_REMINDERS,
  DEMO_SERVICES,
} from '../data/demo'
import type {
  Absence,
  ConfirmationMap,
  Notification,
  NotificationType,
  Person,
  Qualifications,
  Reminders,
  Role,
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
  role: string
  female: boolean
  tel: string
  mail: string
  absent: number[]
  priv: Qualifications
}

interface ServiceRow {
  key: string
  name: string
  count: number
  priv: string | null
  groups: boolean
  position: number
}

interface WeekRow {
  position: number
  data: Week
}

interface AbsenceRow {
  id: string
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
}

interface ConfirmationRow {
  task_key: string
  status: string
}

/** congregations.settings (JSONB) — versammlungsweite Einstellungen. */
interface CongregationSettings {
  reminders?: Partial<Reminders>
  congLang?: string
}

const ROLES: Role[] = ['aeltester', 'dienstamtgehilfe', 'verkuendiger']
const asRole = (r: string): Role => (ROLES.includes(r as Role) ? (r as Role) : 'verkuendiger')

const NOTIF_TYPES: NotificationType[] = ['zuteilung', 'erinnerung', 'gesendet', 'import', 'verhindert']
const asNotifType = (t: string): NotificationType =>
  NOTIF_TYPES.includes(t as NotificationType) ? (t as NotificationType) : 'gesendet'

/* ---- Mapper Row ↔ App ---------------------------------------------------- */

function personFromRow(r: PersonRow): Person {
  return {
    id: r.id,
    fn: r.fn,
    ln: r.ln,
    role: asRole(r.role),
    female: r.female || undefined,
    tel: r.tel,
    mail: r.mail,
    absent: r.absent ?? [],
    priv: r.priv,
  }
}

function personToRow(p: Person, congregationId: string) {
  return {
    id: p.id,
    congregation_id: congregationId,
    fn: p.fn,
    ln: p.ln,
    role: p.role,
    female: Boolean(p.female),
    tel: p.tel,
    mail: p.mail,
    absent: p.absent,
    priv: p.priv,
  }
}

function serviceFromRow(r: ServiceRow): Service {
  return {
    key: r.key,
    name: r.name,
    count: r.count,
    priv: (r.priv as Service['priv']) ?? null,
    groups: r.groups,
  }
}

function serviceToRow(s: Service, congregationId: string, position: number) {
  return {
    congregation_id: congregationId,
    key: s.key,
    name: s.name,
    count: s.count,
    priv: s.priv,
    groups: Boolean(s.groups),
    position,
  }
}

function absenceFromRow(r: AbsenceRow): Absence {
  return { id: r.id, from: r.from_date, to: r.to_date, reason: r.reason }
}

/** DB-Zeitstempel → grobe relative Zeitangabe (deutsch, wie im Demo-Stil). */
function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.round(diff / 60000)
  if (min < 1) return 'gerade eben'
  if (min < 60) return `vor ${min} Min.`
  const h = Math.round(min / 60)
  if (h < 24) return `vor ${h} Std.`
  const d = Math.round(h / 24)
  return d === 1 ? 'gestern' : `vor ${d} Tagen`
}

function notificationFromRow(r: NotificationRow): Notification {
  return {
    id: r.id,
    type: asNotifType(r.type),
    title: r.title,
    text: r.body,
    time: relativeTime(r.created_at),
    read: r.read,
  }
}

/* ---- Laden --------------------------------------------------------------- */

export interface CongregationData {
  congregation: { name: string; hall: string; meetings: string }
  planner: boolean
  personId: string | null
  persons: Person[]
  services: Service[]
  weeks: Week[]
  absences: Absence[]
  notifications: Notification[]
  confirmations: ConfirmationMap
  reminders: Reminders
  congLang: string
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

  const [cong, persons, services, weeks, absences, notifs, confs] = await Promise.all([
    supabase.from('congregations').select('name, hall, meeting_times, settings').eq('id', congregationId).maybeSingle(),
    supabase.from('persons').select('*').eq('congregation_id', congregationId).order('created_at'),
    supabase.from('services').select('*').eq('congregation_id', congregationId).order('position'),
    supabase.from('weeks').select('position, data').eq('congregation_id', congregationId).order('position'),
    supabase.from('absences').select('*').eq('congregation_id', congregationId).eq('user_id', userId).order('from_date'),
    supabase.from('notifications').select('*').eq('congregation_id', congregationId).order('created_at', { ascending: false }),
    supabase.from('confirmations').select('task_key, status').eq('congregation_id', congregationId),
  ])

  const firstErr = [cong, persons, services, weeks, absences, notifs, confs].find((r) => r.error)?.error
  if (firstErr) return { ok: false, reason: 'error', message: firstErr.message }

  const personList = (persons.data ?? []).map((r) => personFromRow(r as PersonRow))
  const weekList = (weeks.data ?? []).map((r) => (r as WeekRow).data)

  const confirmations: ConfirmationMap = {}
  for (const row of (confs.data ?? []) as ConfirmationRow[]) {
    if (row.status === 'bestätigt' || row.status === 'verhindert') {
      confirmations[row.task_key] = row.status
    }
  }

  const settings = ((cong.data?.settings as CongregationSettings | null) ?? {})
  const reminders: Reminders = {
    first: settings.reminders?.first ?? DEMO_REMINDERS.first,
    last: settings.reminders?.last ?? DEMO_REMINDERS.last,
    repeat: settings.reminders?.repeat ?? DEMO_REMINDERS.repeat,
  }

  const data: CongregationData = {
    congregation: {
      name: cong.data?.name ?? '',
      hall: cong.data?.hall ?? '',
      meetings: cong.data?.meeting_times ?? '',
    },
    planner: Boolean(member.planner),
    personId: (member.person_id as string | null) ?? null,
    persons: personList,
    services: (services.data ?? []).map((r) => serviceFromRow(r as ServiceRow)),
    weeks: weekList,
    absences: (absences.data ?? []).map((r) => absenceFromRow(r as AbsenceRow)),
    notifications: (notifs.data ?? []).map((r) => notificationFromRow(r as NotificationRow)),
    confirmations,
    reminders,
    congLang: settings.congLang ?? 'Deutsch',
  }

  const empty = personList.length === 0 && weekList.length === 0
  return { ok: true, empty, data, congregationId, userId }
}

/* ---- Erstbefüllung (Demo-Datensatz in eine leere Versammlung) ------------ */

/**
 * Schreibt den Demo-Datensatz (Personen, Dienste, Wochen) in eine noch leere
 * Versammlung — als Startpunkt zum Weiterbearbeiten. Nur für Planer (RLS).
 */
export async function seedCongregation(congregationId: string): Promise<string | null> {
  if (!supabase) return 'kein Client'
  const personRows = DEMO_PERSONS.map((p) => {
    const row = personToRow({ ...p, id: crypto.randomUUID() }, congregationId)
    return row
  })
  const serviceRows = DEMO_SERVICES.map((s, i) => serviceToRow(s, congregationId, i))
  const weekRows = buildDemoWeeks().map((w, i) => ({
    congregation_id: congregationId,
    position: i,
    data: w,
  }))

  const results = await Promise.all([
    supabase.from('persons').insert(personRows),
    supabase.from('services').insert(serviceRows),
    supabase.from('weeks').insert(weekRows),
  ])
  const err = results.find((r) => r.error)?.error
  return err ? err.message : null
}

/* ---- Schreiben ----------------------------------------------------------- */

async function run(promise: PromiseLike<{ error: { message: string } | null }>): Promise<void> {
  const { error } = await promise
  if (error) console.error('[persistenz]', error.message)
}

export function saveWeek(congregationId: string, position: number, week: Week): void {
  if (!supabase) return
  void run(
    supabase
      .from('weeks')
      .upsert({ congregation_id: congregationId, position, data: week }, { onConflict: 'congregation_id,position' }),
  )
}

export function savePerson(congregationId: string, person: Person): void {
  if (!supabase) return
  void run(supabase.from('persons').upsert(personToRow(person, congregationId)))
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

export function saveAbsence(
  congregationId: string,
  userId: string,
  personId: string | null,
  absence: Absence,
): void {
  if (!supabase) return
  void run(
    supabase.from('absences').insert({
      id: absence.id,
      congregation_id: congregationId,
      user_id: userId,
      person_id: personId,
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

export function insertNotification(
  congregationId: string,
  userId: string | null,
  type: NotificationType,
  title: string,
  body: string,
): void {
  if (!supabase) return
  void run(
    supabase
      .from('notifications')
      .insert({ congregation_id: congregationId, user_id: userId, type, title, body }),
  )
}

export function markNotificationsRead(congregationId: string): void {
  if (!supabase) return
  void run(supabase.from('notifications').update({ read: true }).eq('congregation_id', congregationId))
}

export function saveCongregationInfo(
  congregationId: string,
  info: { name: string; hall: string; meetings: string },
): void {
  if (!supabase) return
  void run(
    supabase
      .from('congregations')
      .update({ name: info.name, hall: info.hall, meeting_times: info.meetings })
      .eq('id', congregationId),
  )
}

/** Versammlungsweite Einstellungen (Erinnerungen, Versammlungssprache). */
export function saveSettings(
  congregationId: string,
  settings: { reminders: Reminders; congLang: string },
): void {
  if (!supabase) return
  void run(supabase.from('congregations').update({ settings }).eq('id', congregationId))
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
