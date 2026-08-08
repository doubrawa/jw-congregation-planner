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
import { fsBaseFromWeeks, regenFsWeeks } from '../data/fs'
import { itemTaskKey, partTaskKey } from '../data/planning'
import {
  displayName,
  emptyQualifications,
  neueItemId,
  normalizeChairKeys,
  serviceQualKey,
  shortDisplayName,
} from '../data/helpers'
import type {
  Absence,
  ConfirmationMap,
  FsInstance,
  FsRule,
  Group,
  HelperSlot,
  Invite,
  Meeting,
  Member,
  Notification,
  NotificationType,
  Person,
  Qualifications,
  Reminders,
  Role,
  Service,
  SlotAssignment,
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
  planner: boolean
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
  /** Stand der Zeile — Grundlage der Konfliktprüfung beim Speichern (T39). */
  updated_at: string
}

interface AbsenceRow {
  id: string
  person_id: string | null
  user_id: string
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
  auxClass?: boolean // Zusaetzliche Klasse eingerichtet (jw.org S-38, Absatz 26)
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
export function normalizePriv(raw: Qualifications | null | undefined): Qualifications {
  const r = (raw ?? {}) as unknown as Record<string, unknown>
  const priv = emptyQualifications()
  for (const [key, value] of Object.entries(r)) priv[key] = Boolean(value)
  if (r.lesen) {
    priv.bibellesung = true
    priv.leser = true
  }
  // Früher gab es einen gemeinsamen `vorsitz`; heute getrennt nach
  // Zusammenkunft. Bis der echte Split (NWS) gesetzt ist, beide gewähren —
  // so verliert niemand das Vorsitz-Recht.
  if (r.vorsitz) {
    priv.vorsitzMid = true
    priv.vorsitzWe = true
  }
  delete priv['vorsitz']
  return priv
}

/**
 * Hebt Alt-Datensätze auf die dienst-eigenen Bereiche: früher teilten sich
 * mehrere Hilfsdienste einen festen Bereich (Eingangs- und Saalordner beide
 * `ordner`), heute hat jeder Dienst seinen eigenen (`svc:<key>`). Fehlt der
 * neue Bereich bei einer Person, wird er aus dem alten Bereich des Dienstes
 * übernommen. Idempotent: bereits migrierte Bereiche bleiben unangetastet.
 */
export function migrateServicePrivs(persons: Person[], services: Service[]): Person[] {
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
export function migrateAssignmentNames(weeks: Week[], persons: Person[]): Week[] {
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
    mid: mapMeetingNames(week.mid, fix),
    we: mapMeetingNames(week.we, fix),
  }))
}

/**
 * Trägt jedem Programmpunkt eine **stabile Kennung** nach und benennt die
 * Bestätigungen einmalig mit (T37).
 *
 * Die Bestätigungen hingen an der Position (`"60|mid|part|2|1|0"`). Das ist die
 * Ursache von T16 (ein eingefügter LAC-Punkt verschiebt alle folgenden, die
 * Bestätigungen blieben an der alten Zahl kleben) und der Grund, warum der
 * Wochen-Index die Datenbank-Position sein *muss*.
 *
 * **Idempotent**: ein Punkt, der schon eine Kennung trägt, wird übersprungen.
 * Beim zweiten Laden gibt es also nichts mehr zu tun.
 *
 * **Verlustfrei**: umbenannt wird nur, was es gibt. Ein Punkt ohne Bestätigung
 * bekommt einfach seine Kennung; eine Bestätigung ohne passenden Punkt (Altlast
 * eines gelöschten Slots) bleibt liegen, wo sie ist, und stört niemanden.
 *
 * Beide Räume werden geprüft — Hauptsaal und Zusätzliche Klasse —, und zwar
 * unabhängig davon, ob die Klasse gerade besteht: ihre Bestätigungen bleiben
 * beim Abschalten bewusst stehen, damit ein Wiedereinschalten sie wiederfindet.
 */
export function migrateItemIds(
  weeks: Week[],
  confirmations: ConfirmationMap,
): { weeks: Week[]; confirmations: ConfirmationMap; renames: Array<[string, string]> } {
  const renames: Array<[string, string]> = []
  let anyChanged = false

  const next = weeks.map((week, wi) => {
    if (week.stub) return week
    let weekChanged = false
    const kopie = { ...week }
    for (const tab of ['mid', 'we'] as const) {
      let meetingChanged = false
      const sections = week[tab].sections.map((section, si) => ({
        ...section,
        items: section.items.map((item, ii) => {
          if ('song' in item || item.iid) return item
          meetingChanged = true
          const iid = neueItemId()
          // Positions-Schlüssel → Kennungs-Schlüssel, für beide Räume.
          for (const [raum, slots] of [
            [false, item.names] as const,
            [true, item.aux ?? []] as const,
          ]) {
            slots.forEach((_slot, ni) => {
              const alt = partTaskKey(wi, tab, si, ii, ni, raum)
              if (!(alt in confirmations)) return
              renames.push([alt, itemTaskKey(wi, tab, iid, ni, raum)])
            })
          }
          return { ...item, iid }
        }),
      }))
      if (!meetingChanged) continue
      kopie[tab] = { ...week[tab], sections }
      weekChanged = true
    }
    if (!weekChanged) return week
    anyChanged = true
    return kopie
  })

  if (renames.length === 0 && !anyChanged) return { weeks, confirmations, renames }

  const nextConf = { ...confirmations }
  for (const [alt, neu] of renames) {
    const status = nextConf[alt]
    if (status === undefined) continue // umbenannt wird nur, was es gibt
    nextConf[neu] = status
    delete nextConf[alt]
  }
  return { weeks: anyChanged ? next : weeks, confirmations: nextConf, renames }
}

/**
 * Zieht eine Personen-Umbenennung durch bereits geplante Wochen: ersetzt exakt
 * den alten Anzeigenamen durch den neuen in allen Zuteilungen (Programmpunkte +
 * Hilfsdienste) der kanonischen Wochen. Unveränderte Wochen behalten ihre
 * Referenz (der Aufrufer erkennt daran, welche Wochen neu gespeichert werden
 * müssen). Sprachvarianten (Week.alt) tragen keine Namen — nur die kanonische
 * Woche wird angefasst.
 */
export function renameInWeeks(weeks: Week[], id: string, oldName: string, newName: string): Week[] {
  // Leerer alter Name: nichts tun (sonst würden offene Slots mit leerem Namen
  // versehentlich mit-umbenannt). Ein zugeteilter Slot trägt immer einen Namen.
  if (!oldName || oldName === newName) return weeks
  return mapPersonSlots(weeks, id, oldName, (slot) =>
    slot.name === newName ? slot : { ...slot, name: newName },
  )
}

/**
 * Löst die Verweise auf eine gelöschte Person aus den Wochen: die `pid`
 * verschwindet, **der Name bleibt als Text stehen** (so war es immer
 * dokumentiert — eine geplante Woche soll nicht plötzlich Lücken zeigen).
 *
 * Ohne das bliebe ein Fremdschlüssel ins Leere zeigen. Die Folgen sind still
 * und unangenehm: `gehoertZu` entscheidet über die Id, findet niemanden mehr,
 * und der Slot zählt nirgends — nicht in der Auslastung, nicht in den
 * Konflikten, nicht in den Aufgaben. Legt der Planer dieselbe Person neu an,
 * bekommt sie eine neue Id, und der alte Verweis passt nie wieder.
 *
 * Ohne `pid` greift wieder der Namensweg: die Zuteilung verhält sich wie ein
 * Altdatensatz und wird beim nächsten Laden erneut zugeordnet
 * (`migrateAssignmentPids`), sobald es wieder jemanden dieses Namens gibt.
 */
export function dropPersonPid(weeks: Week[], id: string): Week[] {
  return mapPersonSlots(weeks, id, null, (slot) => {
    if (!slot.pid) return slot
    const { pid: _weg, ...ohne } = slot
    return ohne
  })
}

/**
 * Bildet jeden Slot einer Person über `fix` ab — Programmpunkte (Hauptsaal
 * **und** Zusätzliche Klasse), den Ratgeber der Klasse und die Hilfsdienste.
 *
 * Ein Slot gehört zur Person, wenn seine `pid` passt (stabil) — oder, ohne
 * `pid` (Altdaten, Hilfsdienste), sein Name dem angegebenen entspricht.
 * `oldName: null` schaltet den Namensweg ab: beim Lösen einer Id ist nur sie
 * gemeint, nicht jeder Gleichnamige.
 *
 * **Klasse und Ratgeber waren hier lange nicht dabei** (bei T38 aufgefallen).
 * Beide tragen `pid`, funktional stimmte also alles — aber der Anzeigename
 * blieb nach einer Umbenennung der alte. Auf dem Programmblatt der Klasse stand
 * dann ein Name, den es nicht mehr gibt.
 *
 * Unveränderte Wochen behalten ihre Referenz; daran erkennt der Aufrufer, welche
 * er speichern muss. Sprachvarianten (`Week.alt`) tragen keine Namen.
 */
function mapPersonSlots(
  weeks: Week[],
  id: string,
  oldName: string | null,
  fix: (slot: SlotAssignment) => SlotAssignment,
): Week[] {
  const meins = (slot: { pid?: string; name: string }): boolean =>
    slot.pid ? slot.pid === id : oldName !== null && slot.name === oldName

  let anyChanged = false
  const mapMeeting = (m: Week['mid']): Week['mid'] => {
    let changed = false
    /** Eine Platzreihe (Hauptsaal oder Klasse); gibt dieselbe zurück, wenn nichts passt. */
    const mapReihe = <T extends SlotAssignment>(arr: T[] | undefined): T[] | undefined => {
      if (!arr) return arr
      let reiheChanged = false
      const next = arr.map((slot) => {
        if (!meins(slot)) return slot
        const neu = fix(slot) as T
        if (neu !== slot) reiheChanged = true
        return neu
      })
      if (!reiheChanged) return arr
      changed = true
      return next
    }

    const sections = m.sections.map((section) => ({
      ...section,
      items: section.items.map((item) => {
        if ('song' in item) return item
        const names = mapReihe(item.names) ?? item.names
        const aux = mapReihe(item.aux)
        if (names === item.names && aux === item.aux) return item
        return { ...item, names, ...(aux ? { aux } : {}) }
      }),
    }))

    // Ratgeber der Zusätzlichen Klasse: eine Zuteilung je Zusammenkunft.
    let ratgeber = m.auxRatgeber
    if (ratgeber && meins(ratgeber)) {
      const neu = fix(ratgeber)
      if (neu !== ratgeber) {
        ratgeber = neu
        changed = true
      }
    }

    // Hilfsdienste tragen keine Rolle und keinen Bereich, sonst dieselbe Regel;
    // die Reinigungs-Rotation („Gruppe N") hat weder pid noch Personennamen.
    let helpersChanged = false
    const helpers = Object.fromEntries(
      Object.entries(m.helpers).map(([key, arr]) => [
        key,
        arr.map((slot) => {
          if (!meins(slot)) return slot
          const neu = fix(slot)
          if (neu !== slot) helpersChanged = true
          return { name: neu.name, ...(neu.pid ? { pid: neu.pid } : {}) }
        }),
      ]),
    )
    if (!changed && !helpersChanged) return m
    anyChanged = true
    return { ...m, sections, helpers, ...(ratgeber ? { auxRatgeber: ratgeber } : {}) }
  }

  const next = weeks.map((week) => {
    const mid = mapMeeting(week.mid)
    const we = mapMeeting(week.we)
    return mid === week.mid && we === week.we ? week : { ...week, mid, we }
  })
  return anyChanged ? next : weeks
}

/**
 * Bildet alle zugeteilten Namen (Programmpunkte + Hilfsdienste) einer
 * Zusammenkunft über `fix` ab und liefert eine neue Zusammenkunft. Lieder
 * tragen keine Namen und bleiben unangetastet. Basis der Lade-Migration
 * (migrateAssignmentNames).
 */
function mapMeetingNames(meeting: Week['mid'], fix: (n: string) => string): Week['mid'] {
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
      Object.entries(meeting.helpers).map(([key, arr]) => [
        key,
        arr.map((slot) => ({ ...slot, name: fix(slot.name) })),
      ]),
    ),
  }
}

/**
 * Backfill der Person-Id (pid) an Programmpunkt- UND Hilfsdienst-Slots aus dem
 * gespeicherten Anzeigenamen — für Bestandsdaten ohne pid. Nur eindeutige Namen
 * werden zugeordnet; mehrdeutige (Dubletten), externe Redner und die
 * Reinigungs-Rotation („Gruppe N") bleiben unangetastet. Idempotent. Rein im
 * Speicher; persistiert beim nächsten Speichern der Woche.
 */
export function migrateAssignmentPids(weeks: Week[], persons: Person[]): Week[] {
  const byName = new Map<string, string>()
  const dupes = new Set<string>()
  for (const p of persons) {
    const n = displayName(p)
    if (byName.has(n)) dupes.add(n)
    byName.set(n, p.id)
  }
  for (const d of dupes) byName.delete(d) // mehrdeutig → nicht zuordnen
  if (byName.size === 0) return weeks
  let anyChanged = false
  const fixMeeting = (m: Week['mid']): Week['mid'] => {
    let changed = false
    const sections = m.sections.map((section) => ({
      ...section,
      items: section.items.map((item) => {
        if ('song' in item) return item
        let itemChanged = false
        const names = item.names.map((slot) => {
          if (slot.pid || !slot.name) return slot
          const id = byName.get(slot.name)
          if (!id) return slot
          itemChanged = true
          return { ...slot, pid: id }
        })
        if (!itemChanged) return item
        changed = true
        return { ...item, names }
      }),
    }))
    // Hilfsdienste ebenso (Gruppen-Namen matchen keine Person → bleiben ohne pid).
    const helpers = Object.fromEntries(
      Object.entries(m.helpers).map(([key, arr]) => [
        key,
        arr.map((slot) => {
          if (slot.pid || !slot.name) return slot
          const id = byName.get(slot.name)
          if (!id) return slot
          changed = true
          return { ...slot, pid: id }
        }),
      ]),
    )
    if (!changed) return m
    anyChanged = true
    return { ...m, sections, helpers }
  }
  const next = weeks.map((week) => {
    const mid = fixMeeting(week.mid)
    const we = fixMeeting(week.we)
    return mid === week.mid && we === week.we ? week : { ...week, mid, we }
  })
  return anyChanged ? next : weeks
}

/**
 * Alt-Format der Hilfsdienste (reine Namens-Strings) auf das Slot-Objekt
 * { name, pid? } heben. Bestandsdaten in der DB haben helpers als string[];
 * muss vor allen weiteren Wochen-Transformationen laufen. Idempotent.
 */
export function normalizeWeekHelpers(weeks: Week[]): Week[] {
  const fix = (m: Week['mid']): Week['mid'] => {
    let changed = false
    const helpers = Object.fromEntries(
      Object.entries(m.helpers).map(([key, arr]) => [
        key,
        (arr as unknown[]).map((e) => {
          if (typeof e === 'string') {
            changed = true
            return { name: e }
          }
          return e as HelperSlot
        }),
      ]),
    )
    return changed ? { ...m, helpers } : m
  }
  let anyChanged = false
  const next = weeks.map((week) => {
    const mid = fix(week.mid)
    const we = fix(week.we)
    if (mid === week.mid && we === week.we) return week
    anyChanged = true
    return { ...week, mid, we }
  })
  return anyChanged ? next : weeks
}

function personFromRow(r: PersonRow): Person {
  return {
    id: r.id,
    fn: r.fn,
    ln: r.ln,
    dn: r.dn || undefined,
    planner: r.planner || undefined,
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
    dn: p.dn ?? '',
    planner: Boolean(p.planner),
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
  return {
    id: r.id,
    personId: r.person_id,
    userId: r.user_id,
    from: r.from_date,
    to: r.to_date,
    reason: r.reason,
  }
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

/**
 * Wie viele Wochen höchstens geladen werden. Ein Jahr reicht für alles, was die
 * App mit Wochen tut: die Auslastung schaut ±3 Wochen weit, die Wartezeit-
 * Reihenfolge braucht nur „länger her als die anderen", und weiter zurück
 * schaut niemand. Ältere Wochen bleiben in der Datenbank stehen.
 */
export const WEEK_LIMIT = 52

/** Leerer Platzhalter für eine nicht geladene Woche (siehe Week.stub). */
function stubWeek(): Week {
  const leer = (): Meeting => ({ date: '', end: '', sections: [], helpers: {} })
  return { range: '', book: '', current: false, mid: leer(), we: leer(), stub: true }
}

export interface CongregationData {
  congregation: { name: string; hall: string; meetings: string }
  planner: boolean
  personId: string | null
  persons: Person[]
  services: Service[]
  groups: Group[]
  weeks: Week[]
  /** Index der ersten wirklich geladenen Woche; davor stehen Platzhalter. */
  weekFrom: number
  fsRules: FsRule[]
  fsWeeks: FsInstance[][]
  fsBase: string | null // ISO-Datum (Montag der Woche 0) oder null
  absences: Absence[]
  notifications: Notification[]
  confirmations: ConfirmationMap
  reminders: Reminders
  congLang: string
  progLangs: string[] // weitere Programmsprachen (deutsche Anzeigenamen)
  auxClass: boolean // Zusaetzliche Klasse eingerichtet
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

  // Ladefenster bestimmen: nur die jüngsten WEEK_LIMIT Wochen holen. Die
  // Positionen bleiben dabei absolut (siehe weekFrom/Week.stub) — sie stecken
  // in jedem gespeicherten task_key.
  const { data: letzte } = await supabase
    .from('weeks')
    .select('position')
    .eq('congregation_id', congregationId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()
  const hoechste = (letzte?.position as number | undefined) ?? -1
  const weekFrom = Math.max(0, hoechste - WEEK_LIMIT + 1)

  const [cong, persons, services, groups, weeks, absences, notifs, confs, members, invites, fsRulesRow, fsWeeksRows] = await Promise.all([
    supabase.from('congregations').select('name, hall, meeting_times, settings').eq('id', congregationId).maybeSingle(),
    supabase.from('persons').select('*').eq('congregation_id', congregationId).order('created_at'),
    supabase.from('services').select('*').eq('congregation_id', congregationId).order('position'),
    supabase.from('groups').select('*').eq('congregation_id', congregationId).order('position'),
    supabase.from('weeks').select('position, data, updated_at').eq('congregation_id', congregationId).gte('position', weekFrom).order('position'),
    // Versammlungsweit, nicht nur die eigenen: die Planung muss wissen, wer
    // fehlt (RLS erlaubt der Versammlung ohnehin das Lesen). „Deine Einträge"
    // im persönlichen Bereich filtert selbst auf die eigene user_id.
    supabase.from('absences').select('*').eq('congregation_id', congregationId).order('from_date'),
    // Nur die neuesten 50 — Altbestand räumt send-reminders serverseitig ab
    supabase.from('notifications').select('*').eq('congregation_id', congregationId).order('created_at', { ascending: false }).limit(50),
    supabase.from('confirmations').select('task_key, status').eq('congregation_id', congregationId),
    // Nicht-Planer sehen per RLS nur die eigene Zeile bzw. keine Einladungen
    supabase.from('members').select('user_id, person_id, planner, email').eq('congregation_id', congregationId).order('created_at'),
    supabase.from('invites').select('id, code, person_id, planner').eq('congregation_id', congregationId).is('redeemed_by', null).order('created_at'),
    supabase.from('fs_rules').select('base, rules').eq('congregation_id', congregationId).maybeSingle(),
    supabase.from('fs_weeks').select('position, data').eq('congregation_id', congregationId).gte('position', weekFrom).order('position'),
  ])

  // Alle zwölf Abfragen prüfen, nicht zehn: fehlten fs_rules/fs_weeks in der
  // Liste, blieb ein Ladefehler dort stumm und die Treffpunkte kamen einfach
  // leer an — genau der Fall bei einer Instanz ohne Migration 010.
  const firstErr = [cong, persons, services, groups, weeks, absences, notifs, confs, members, invites, fsRulesRow, fsWeeksRows]
    .find((r) => r.error)?.error
  if (firstErr) return { ok: false, reason: 'error', message: firstErr.message }

  const serviceList = (services.data ?? []).map((r) => serviceFromRow(r as ServiceRow))
  const personList = migrateServicePrivs(
    (persons.data ?? []).map((r) => personFromRow(r as PersonRow)),
    serviceList,
  )
  // Jede Zeile an IHRE Position setzen, nicht der Reihe nach aneinanderreihen.
  //
  // Vorher wurden die geladenen Zeilen hinter die Platzhalter gehängt und
  // stillschweigend als lückenlos angenommen. Fehlt eine Position — etwa nach
  // einem Schreibfehler, der früher verschluckt wurde (T5) —, rutschen alle
  // folgenden Wochen einen Index nach vorn. Der Index **ist** die Position und
  // steckt in jedem gespeicherten `task_key` („60|mid|part|2|1|0"): jede
  // Bestätigung, jede Aufgabe und jede Erinnerung zeigte danach auf die
  // Nachbarwoche. Lücken werden jetzt zu Platzhaltern, die nie gespeichert
  // werden (siehe Week.stub).
  const weekRows = (weeks.data ?? []) as WeekRow[]
  // Stände merken: jeder spätere Schreibvorgang nennt den Stand, auf dem er
  // beruht (T39). Vor dem Füllen leeren — ein zweiter Ladevorgang (Neuanmeldung,
  // Konflikt-Nachladen) darf keine Stände einer anderen Versammlung erben.
  staendeSetzen(weekRows.map((r) => [r.position, r.updated_at]))
  const letztePos = weekRows.reduce((max, r) => Math.max(max, r.position), weekFrom - 1)
  const roh = Array.from({ length: letztePos + 1 }, stubWeek)
  for (const row of weekRows) {
    // Position außerhalb (negativ oder jenseits des Arrays) wäre kaputt —
    // lieber die Zeile auslassen als eine Woche an falscher Stelle zeigen.
    if (row.position >= weekFrom && row.position <= letztePos) roh[row.position] = row.data
  }
  const gemigriert = normalizeChairKeys(
    migrateAssignmentPids(migrateAssignmentNames(normalizeWeekHelpers(roh), personList), personList),
  )

  const rohConf: ConfirmationMap = {}
  for (const row of (confs.data ?? []) as ConfirmationRow[]) {
    if (row.status === 'bestätigt' || row.status === 'verhindert') {
      rohConf[row.task_key] = row.status
    }
  }

  // Stabile Kennungen nachtragen und die Bestätigungen einmalig mit umbenennen
  // (T37). Idempotent — beim zweiten Laden gibt es nichts mehr zu tun.
  const umgestellt = migrateItemIds(gemigriert, rohConf)
  const weekList = umgestellt.weeks
  const confirmations = umgestellt.confirmations
  /** Nur die Wochen, die wirklich Kennungen bekommen haben. */
  const speichereUmgestellte = (): void => {
    for (let i = 0; i < weekList.length; i++) {
      const woche = weekList[i]
      if (woche && woche !== gemigriert[i]) saveWeek(congregationId, i, woche)
    }
  }
  if (umgestellt.renames.length > 0) {
    // Erst die Datenbank, dann die Wochen: bricht das Umbenennen ab, bleiben
    // die Wochen ohne Kennung und der nächste Ladevorgang versucht es erneut.
    // Andersherum wären die Bestätigungen verwaist.
    void renameConfirmationKeys(congregationId, umgestellt.renames).then(speichereUmgestellte)
  } else {
    speichereUmgestellte()
  }

  const settings = ((cong.data?.settings as CongregationSettings | null) ?? {})
  const reminders: Reminders = {
    first: settings.reminders?.first ?? DEMO_REMINDERS.first,
    last: settings.reminders?.last ?? DEMO_REMINDERS.last,
    repeat: settings.reminders?.repeat ?? DEMO_REMINDERS.repeat,
  }

  // Treffpunkte: Grundplan-Blob + je Woche gespeicherte Instanzen (Position → Daten).
  // Die Basis wird aus dem echten ISO-Startdatum der Wochen (`week.start`,
  // jw.org-Import) abgeleitet — unabhängig von der gespeicherten Basis und vom
  // `current`-Flag, die beide veralten können; anschließend werden die Wochen neu
  // ausgerichtet — Leiter und wochenspezifische Zeit/Ort bleiben erhalten, nur die
  // Regel→Woche-Zuordnung (z. B. „1. Samstag im Monat") wird anhand der korrekten
  // Datumsbasis neu bestimmt.
  const fsRules = (fsRulesRow.data?.rules as FsRule[] | undefined) ?? []
  const fsBaseDate = fsBaseFromWeeks(weekList, new Date())
  const fsBase = fsBaseDate.toISOString().slice(0, 10)
  const fsByPos = new Map<number, FsInstance[]>()
  for (const row of (fsWeeksRows.data ?? []) as { position: number; data: FsInstance[] }[]) {
    fsByPos.set(row.position, row.data)
  }
  const storedFsWeeks: FsInstance[][] = Array.from({ length: weekList.length }, (_u, i) => fsByPos.get(i) ?? [])
  const fsWeeks = fsRules.length
    ? regenFsWeeks(fsBaseDate, storedFsWeeks, fsRules, true, weekFrom)
    : storedFsWeeks

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
    weekFrom,
    fsRules,
    fsWeeks,
    fsBase,
    absences: (absences.data ?? []).map((r) => absenceFromRow(r as AbsenceRow)),
    notifications: (notifs.data ?? []).map((r) => notificationFromRow(r as NotificationRow)),
    confirmations,
    reminders,
    auxClass: settings.auxClass ?? false,
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

async function run(promise: PromiseLike<{ error: { message: string } | null }>): Promise<void> {
  const { error } = await promise
  if (!error) return
  console.error('[persistenz]', error.message)
  melder?.()
}

/* ---- Schreibkonflikte zwischen Planern (T39) ----------------------------- */

/**
 * Stand je Wochen-Position, wie ihn die Datenbank zuletzt bestätigt hat.
 *
 * `saveWeek` schrieb die **komplette Woche** als Upsert — ohne Sperre und ohne
 * Versionskennzeichen. Planen zwei Koordinatoren gleichzeitig, gewinnt der
 * Letzte: seine Fassung überschreibt die des anderen vollständig und lautlos.
 *
 * Die Werte werden nie selbst gebildet, sondern immer nur zurückgereicht — die
 * Zeichenkette kommt aus PostgREST und geht unverändert dorthin zurück. Damit
 * sind Genauigkeit und Zeitzone kein Thema.
 */
const wochenStand = new Map<number, string>()

/**
 * Schreibvorgänge je Position hintereinander.
 *
 * Ohne das kämpfte man gegen sich selbst: zwei rasch aufeinanderfolgende
 * Änderungen derselben Woche gingen beide mit demselben Stand los, und die
 * zweite meldete einen Konflikt, den es nicht gab.
 */
const wochenKette = new Map<number, Promise<void>>()

function staendeSetzen(paare: Array<[number, string]>): void {
  wochenStand.clear()
  wochenKette.clear()
  for (const [pos, stand] of paare) wochenStand.set(pos, stand)
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
async function schreibeWoche(congregationId: string, position: number, week: Week): Promise<void> {
  if (!supabase) return
  const stand = wochenStand.get(position)

  if (stand === undefined) {
    const { data, error } = await supabase
      .from('weeks')
      .insert({ congregation_id: congregationId, position, data: week })
      .select('updated_at')
      .maybeSingle()
    if (error) {
      // Verstoß gegen unique(congregation_id, position): die Zeile existiert
      // längst, wir kannten sie nur nicht — also hat sie ein anderer angelegt.
      if (error.code === '23505') konfliktMelder?.()
      else {
        console.error('[persistenz]', error.message)
        melder?.()
      }
      return
    }
    if (data) wochenStand.set(position, data.updated_at as string)
    return
  }

  const { data, error } = await supabase
    .from('weeks')
    .update({ data: week })
    .eq('congregation_id', congregationId)
    .eq('position', position)
    .eq('updated_at', stand)
    .select('updated_at')
    .maybeSingle()
  if (error) {
    console.error('[persistenz]', error.message)
    melder?.()
    return
  }
  if (data) {
    wochenStand.set(position, data.updated_at as string)
    return
  }

  const { data: jetzt, error: leseFehler } = await supabase
    .from('weeks')
    .select('updated_at')
    .eq('congregation_id', congregationId)
    .eq('position', position)
    .maybeSingle()
  if (leseFehler) {
    console.error('[persistenz]', leseFehler.message)
    melder?.()
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
      .eq('position', position)
      .select('updated_at')
      .maybeSingle()
    if (schreibFehler) {
      console.error('[persistenz]', schreibFehler.message)
      melder?.()
      return
    }
    if (erneut) wochenStand.set(position, erneut.updated_at as string)
    return
  }
  konfliktMelder?.()
}

export function saveWeek(congregationId: string, position: number, week: Week): void {
  if (!supabase) return
  // Platzhalter nie schreiben: an dieser Position steht in der Datenbank die
  // echte, nur nicht geladene Woche — ein Upsert würde sie leeren.
  if (week.stub) return
  const vorher = wochenKette.get(position) ?? Promise.resolve()
  // `catch` vor dem Anhängen: ein Fehlschlag darf die Kette nicht abreißen
  // lassen, sonst schriebe diese Woche nie wieder.
  const naechster = vorher.then(() => schreibeWoche(congregationId, position, week).catch(() => {}))
  wochenKette.set(position, naechster)
}

export function savePerson(congregationId: string, person: Person): void {
  if (!supabase) return
  void run(supabase.from('persons').upsert(personToRow(person, congregationId)))
}

/** Grundplan der Treffpunkte (ein Blob je Versammlung) + Basis-Datum. */
export function saveFsRules(congregationId: string, base: string, rules: FsRule[]): void {
  if (!supabase) return
  void run(
    supabase
      .from('fs_rules')
      .upsert({ congregation_id: congregationId, base, rules }, { onConflict: 'congregation_id' }),
  )
}

/** Materialisierte Treffpunkte einer Woche (Position → FsInstance[]). */
export function saveFsWeek(congregationId: string, position: number, insts: FsInstance[]): void {
  if (!supabase) return
  void run(
    supabase
      .from('fs_weeks')
      .upsert(
        { congregation_id: congregationId, position, data: insts },
        { onConflict: 'congregation_id,position' },
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

/**
 * Mitteilung an bestimmte Empfänger (je user_id eine eigene Zeile → eigener
 * Gelesen-/Lösch-Status). Leere Empfängerliste = kein Schreiben. Erinnerungen
 * erzeugt die Edge Function selbst; Client-Mitteilungen (Zuteilung, Import,
 * Verhinderung) richten sich an die Planer der Versammlung.
 */
export function insertNotifications(
  congregationId: string,
  userIds: string[],
  type: NotificationType,
  title: string,
  body: string,
): void {
  if (!supabase || userIds.length === 0) return
  const rows = userIds.map((user_id) => ({ congregation_id: congregationId, user_id, type, title, body }))
  void run(supabase.from('notifications').insert(rows))
}

/**
 * Ersatzgesuch: qualifizierte Personen (gleicher Hilfsdienst) benachrichtigen
 * (Sofort-Push + In-App). Läuft serverseitig (Edge Function `substitute`), weil
 * Push nur mit dem privaten VAPID-Schlüssel geht. Fire-and-forget.
 */
export function substituteSeek(congregationId: string, taskKey: string): void {
  if (!supabase) return
  void run(supabase.functions.invoke('substitute', { body: { action: 'seek', congregationId, taskKey } }))
}

/**
 * Hilfsdienst-Ersatz übernehmen: trägt den Aufrufer serverseitig in den Slot ein,
 * setzt die Bestätigung und informiert Ursprungsperson + Planer. Nötig, weil
 * Wochen/Bestätigungen nur der Planer schreiben darf (RLS). Fire-and-forget —
 * der Client aktualisiert seinen Stand optimistisch.
 */
export function substituteTake(congregationId: string, taskKey: string): void {
  if (!supabase) return
  // Über run(): scheitert die Übernahme, hat der Aufrufer sonst „Übernommen"
  // gesehen, während der Slot serverseitig unverändert blieb.
  void run(supabase.functions.invoke('substitute', { body: { action: 'take', congregationId, taskKey } }))
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
  settings: { reminders: Reminders; congLang: string; progLangs: string[]; auxClass: boolean },
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

/**
 * Bestätigungs-Einträge (alle Nutzer) der angegebenen Slots löschen — beim
 * Neu-Zuteilen, damit kein fremder Status am Slot kleben bleibt
 * (RLS-Policy confirmations_delete_planner, migration-007).
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

/**
 * Vertauscht die task_keys von Bestätigungen paarweise — für das Verschieben
 * eines LAC-Punkts, damit die Bestätigung beim Programmpunkt bleibt statt an
 * der Position zu haften. Über einen Zwischenschlüssel, um die Eindeutigkeit
 * (congregation_id, task_key, user_id) beim Tausch nicht zu verletzen.
 */
/**
 * Benennt task_keys der Reihe nach um — für das Einfügen/Löschen eines
 * Programmpunkts, nach dem alle folgenden Positionen um eine rutschen.
 *
 * Die Reihenfolge der Paare kommt aus `shiftPartConfirmations` und ist
 * bindend: falsch herum kollidiert eine Umbenennung mit einem noch belegten
 * Schlüssel (unique auf congregation_id, task_key, user_id). Deshalb hier —
 * anders als beim Tausch — kein Zwischenschlüssel: die Zielposition ist
 * garantiert frei.
 */
export async function renameConfirmationKeys(
  congregationId: string,
  pairs: Array<[string, string]>,
): Promise<void> {
  if (!supabase) return
  for (const [from, to] of pairs) {
    await run(
      supabase
        .from('confirmations')
        .update({ task_key: to })
        .eq('congregation_id', congregationId)
        .eq('task_key', from),
    )
  }
}

export async function swapConfirmationKeys(
  congregationId: string,
  pairs: Array<[string, string]>,
): Promise<void> {
  if (!supabase) return
  const move = (from: string, to: string) =>
    run(
      supabase!
        .from('confirmations')
        .update({ task_key: to })
        .eq('congregation_id', congregationId)
        .eq('task_key', from),
    )
  for (const [a, b] of pairs) {
    const tmp = `${a}~swap`
    await move(a, tmp)
    await move(b, a)
    await move(tmp, b)
  }
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
