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
  DEMO_GROUPS,
  DEMO_PERSONS,
  DEMO_REMINDERS,
  DEMO_SERVICES,
} from '../data/demo'
import { displayName, serviceQualKey, shortDisplayName } from '../data/helpers'
import type {
  Absence,
  ConfirmationMap,
  Group,
  Invite,
  Member,
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
  dn: string
  role: string
  female: boolean
  tel: string
  mail: string
  absent: number[]
  priv: Qualifications
  grp: string | null
}

interface ServiceRow {
  key: string
  name: string
  count: number
  priv: string | null
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

/** congregations.settings (JSONB) — versammlungsweite Einstellungen. */
interface CongregationSettings {
  reminders?: Partial<Reminders>
  congLang?: string
  progLangs?: string[] // weitere Programmsprachen (deutsche Anzeigenamen)
}

const ROLES: Role[] = ['aeltester', 'dienstamtgehilfe', 'verkuendiger']
const asRole = (r: string): Role => (ROLES.includes(r as Role) ? (r as Role) : 'verkuendiger')

const NOTIF_TYPES: NotificationType[] = ['zuteilung', 'erinnerung', 'gesendet', 'import', 'verhindert']
const asNotifType = (t: string): NotificationType =>
  NOTIF_TYPES.includes(t as NotificationType) ? (t as NotificationType) : 'gesendet'

/* ---- Mapper Row ↔ App ---------------------------------------------------- */

/**
 * Migriert gespeicherte Qualifikationen auf das aktuelle Schema: die festen
 * Programm-Bereiche sind immer gesetzt, das frühere kombinierte `lesen` wird auf
 * `bibellesung`+`leser` gespiegelt. Alle übrigen gespeicherten Keys bleiben
 * erhalten — das sind die Hilfsdienst-Bereiche (`svc:<key>`) und die alten
 * festen Dienst-Bereiche, die `migrateServicePrivs` noch braucht.
 */
function normalizePriv(raw: Qualifications | null | undefined): Qualifications {
  const r = (raw ?? {}) as unknown as Record<string, unknown>
  const priv: Qualifications = {
    vorsitz: false,
    vortrag: false,
    gebet: false,
    bibellesung: false,
    leser: false,
    schulung: false,
    studium: false,
  }
  for (const [key, value] of Object.entries(r)) priv[key] = Boolean(value)
  if (r.lesen) {
    priv.bibellesung = true
    priv.leser = true
  }
  return priv
}

/**
 * Hebt Alt-Datensätze auf die dienst-eigenen Bereiche: früher teilten sich
 * mehrere Hilfsdienste einen festen Bereich (Eingangs- und Saalordner beide
 * `ordner`), heute hat jeder Dienst seinen eigenen (`svc:<key>`). Fehlt der
 * neue Bereich bei einer Person, wird er aus dem alten Bereich des Dienstes
 * übernommen. Idempotent: bereits migrierte Bereiche bleiben unangetastet.
 */
function migrateServicePrivs(persons: Person[], services: Service[]): Person[] {
  const legacy = services.flatMap((s) => (s.legacyPriv ? [[serviceQualKey(s.key), s.legacyPriv] as const] : []))
  if (legacy.length === 0) return persons
  return persons.map((p) => {
    const priv = { ...p.priv }
    for (const [key, old] of legacy) {
      if (priv[key] === undefined) priv[key] = Boolean(priv[old])
    }
    return { ...p, priv }
  })
}

/**
 * Migriert in den Wochen gespeicherte Zuteilungs-Namen von der früheren
 * Kurzform "V. Nachname" auf den heutigen Anzeigenamen (voller Name bzw.
 * `dn`). Nur eindeutige Treffer werden ersetzt; "Gruppe N" und externe Namen
 * (Gastredner) bleiben unangetastet. Idempotent — aktuelle Namen matchen die
 * Kurzform nicht mehr. Rein im Speicher; persistiert wird beim nächsten
 * Speichern der jeweiligen Woche.
 */
function migrateAssignmentNames(weeks: Week[], persons: Person[]): Week[] {
  const map = new Map<string, string>()
  const dupes = new Set<string>()
  for (const p of persons) {
    const short = shortDisplayName(p)
    const full = displayName(p)
    if (short === full) continue
    if (map.has(short)) dupes.add(short)
    map.set(short, full)
  }
  for (const d of dupes) map.delete(d) // mehrdeutig → nicht anfassen
  if (map.size === 0) return weeks
  const fix = (name: string): string => map.get(name) ?? name
  return weeks.map((week) => ({
    ...week,
    mid: migrateMeetingNames(week.mid, fix),
    we: migrateMeetingNames(week.we, fix),
  }))
}

function migrateMeetingNames(meeting: Week['mid'], fix: (n: string) => string): Week['mid'] {
  return {
    ...meeting,
    sections: meeting.sections.map((section) => ({
      ...section,
      items: section.items.map((item) =>
        'song' in item
          ? item
          : { ...item, names: item.names.map((slot) => ({ ...slot, name: fix(slot.name) })) },
      ),
    })),
    helpers: Object.fromEntries(
      Object.entries(meeting.helpers).map(([key, arr]) => [key, arr.map(fix)]),
    ),
  }
}

function personFromRow(r: PersonRow): Person {
  return {
    id: r.id,
    fn: r.fn,
    ln: r.ln,
    dn: r.dn || undefined,
    role: asRole(r.role),
    female: r.female || undefined,
    tel: r.tel,
    mail: r.mail,
    absent: r.absent ?? [],
    priv: normalizePriv(r.priv),
    grp: r.grp ?? null,
  }
}

function personToRow(p: Person, congregationId: string) {
  return {
    id: p.id,
    congregation_id: congregationId,
    fn: p.fn,
    ln: p.ln,
    dn: p.dn ?? '',
    role: p.role,
    female: Boolean(p.female),
    tel: p.tel,
    mail: p.mail,
    absent: p.absent,
    priv: p.priv,
    grp: p.grp ?? null,
  }
}

function groupFromRow(r: GroupRow): Group {
  return { id: r.id, name: r.name, ov: r.overseer_id, as: r.assistant_id }
}

function groupToRow(g: Group, congregationId: string, position: number) {
  return {
    id: g.id,
    congregation_id: congregationId,
    name: g.name,
    overseer_id: g.ov,
    assistant_id: g.as,
    position,
  }
}

function serviceFromRow(r: ServiceRow): Service {
  return {
    key: r.key,
    name: r.name,
    count: r.count,
    groups: r.groups,
    legacyPriv: r.priv,
  }
}

// Die Spalte `priv` ist Altbestand: neue Dienste leiten ihren Bereich aus dem
// Key ab. Der gespeicherte Wert wird unverändert durchgereicht, damit
// `migrateServicePrivs` bei jedem Laden dieselbe Zuordnung findet.
function serviceToRow(s: Service, congregationId: string, position: number) {
  return {
    congregation_id: congregationId,
    key: s.key,
    name: s.name,
    count: s.count,
    priv: s.legacyPriv ?? null,
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
  groups: Group[]
  weeks: Week[]
  absences: Absence[]
  notifications: Notification[]
  confirmations: ConfirmationMap
  reminders: Reminders
  congLang: string
  progLangs: string[] // weitere Programmsprachen (deutsche Anzeigenamen)
  members: Member[]
  invites: Invite[]
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

  const [cong, persons, services, groups, weeks, absences, notifs, confs, members, invites] = await Promise.all([
    supabase.from('congregations').select('name, hall, meeting_times, settings').eq('id', congregationId).maybeSingle(),
    supabase.from('persons').select('*').eq('congregation_id', congregationId).order('created_at'),
    supabase.from('services').select('*').eq('congregation_id', congregationId).order('position'),
    supabase.from('groups').select('*').eq('congregation_id', congregationId).order('position'),
    supabase.from('weeks').select('position, data').eq('congregation_id', congregationId).order('position'),
    supabase.from('absences').select('*').eq('congregation_id', congregationId).eq('user_id', userId).order('from_date'),
    supabase.from('notifications').select('*').eq('congregation_id', congregationId).order('created_at', { ascending: false }),
    supabase.from('confirmations').select('task_key, status').eq('congregation_id', congregationId),
    // Nicht-Planer sehen per RLS nur die eigene Zeile bzw. keine Einladungen
    supabase.from('members').select('user_id, person_id, planner, email').eq('congregation_id', congregationId).order('created_at'),
    supabase.from('invites').select('id, code, person_id, planner').eq('congregation_id', congregationId).is('redeemed_by', null).order('created_at'),
  ])

  const firstErr = [cong, persons, services, groups, weeks, absences, notifs, confs, members, invites].find((r) => r.error)?.error
  if (firstErr) return { ok: false, reason: 'error', message: firstErr.message }

  const serviceList = (services.data ?? []).map((r) => serviceFromRow(r as ServiceRow))
  const personList = migrateServicePrivs(
    (persons.data ?? []).map((r) => personFromRow(r as PersonRow)),
    serviceList,
  )
  const weekList = migrateAssignmentNames(
    (weeks.data ?? []).map((r) => (r as WeekRow).data),
    personList,
  )

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
    services: serviceList,
    groups: (groups.data ?? []).map((r) => groupFromRow(r as GroupRow)),
    weeks: weekList,
    absences: (absences.data ?? []).map((r) => absenceFromRow(r as AbsenceRow)),
    notifications: (notifs.data ?? []).map((r) => notificationFromRow(r as NotificationRow)),
    confirmations,
    reminders,
    congLang: settings.congLang ?? 'Deutsch',
    progLangs: settings.progLangs ?? [],
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
  // Neue UUIDs vergeben und Referenzen (Person.grp, Group.ov/as) konsistent
  // ummappen, damit die Demo-Verknüpfungen erhalten bleiben.
  const personId = new Map(DEMO_PERSONS.map((p) => [p.id, crypto.randomUUID()]))
  const groupId = new Map(DEMO_GROUPS.map((g) => [g.id, crypto.randomUUID()]))
  const mapPerson = (id: string | null | undefined) => (id ? (personId.get(id) ?? null) : null)

  const personRows = DEMO_PERSONS.map((p) =>
    personToRow({ ...p, id: personId.get(p.id)!, grp: p.grp ? (groupId.get(p.grp) ?? null) : null }, congregationId),
  )
  const serviceRows = DEMO_SERVICES.map((s, i) => serviceToRow(s, congregationId, i))
  const groupRows = DEMO_GROUPS.map((g, i) =>
    groupToRow({ ...g, id: groupId.get(g.id)!, ov: mapPerson(g.ov), as: mapPerson(g.as) }, congregationId, i),
  )
  const weekRows = buildDemoWeeks().map((w, i) => ({
    congregation_id: congregationId,
    position: i,
    data: w,
  }))

  // Personen zuerst (Gruppen referenzieren sie per FK), dann Gruppen.
  const err1 = (await supabase.from('persons').insert(personRows)).error
  if (err1) return err1.message
  const results = await Promise.all([
    supabase.from('services').insert(serviceRows),
    supabase.from('groups').insert(groupRows),
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

export function saveGroupRow(congregationId: string, group: Group): void {
  if (!supabase) return
  void run(supabase.from('groups').upsert(groupToRow(group, congregationId, 0)))
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

/** Push-Abo dieses Geräts speichern (Endpoint ist eindeutig → Upsert). */
export function savePushSubscription(
  congregationId: string,
  userId: string,
  sub: { endpoint: string; p256dh: string; auth: string },
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
      },
      { onConflict: 'endpoint' },
    ),
  )
}

export function deletePushSubscription(endpoint: string): void {
  if (!supabase) return
  void run(supabase.from('push_subscriptions').delete().eq('endpoint', endpoint))
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
  settings: { reminders: Reminders; congLang: string; progLangs: string[] },
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
  const { data, error } = await supabase.rpc('redeem_invite', { invite_code: code })
  if (error) return error.message
  return (data as string | null) ?? null
}

/** Gut lesbarer Einladungscode (6 Zeichen, ohne 0/O/1/I). */
export function generateInviteCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = new Uint8Array(6)
  crypto.getRandomValues(bytes)
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join('')
}
