/**
 * Daten-Zugriff auf Supabase (Persistenz). Lädt die Daten einer Versammlung
 * für den eingeloggten Nutzer und schreibt Änderungen zurück. Alle Funktionen
 * setzen einen konfigurierten Client voraus (siehe supabase.ts) — ohne Client
 * steigen sie vorher aus (`if (!supabase)`).
 *
 * Persistiert: Versammlung (Stammdaten + Einstellungen), Mitgliedschaft
 * (Rolle), Personen, Dienste, Wochen (als JSONB), eigene Abwesenheiten,
 * Mitteilungen und Aufgaben-Bestätigungen. Nicht persistiert (bewusst,
 * geräteweise in localStorage): App-Sprache und Darstellung.
 */

import { STANDARD_ERINNERUNGEN } from '../data/vorgaben'
import { kurzeZeit, zeitenAus } from '../../supabase/functions/_shared/planung.ts'
import { fsLeiterBinden, regenFsWeeks } from '../data/fs'
import { sentKey, taskKeyVorbei } from '../data/planning'
import type { EntzogeneZuteilung } from '../data/plan-versand'
import { pidsNachtragen } from '../data/namensbindung'
import { normalizeChairKeys } from '../data/helpers'
import { isoDay, montagVon, tagNach } from '../data/meeting-dates'
import { aufbewahrtAb, VERTEILUNG_WOCHEN } from '../data/aufbewahrung'
import { taktVon } from '../data/weitere-plaene'
import type {
  Absage,
  Absence,
  Congregation,
  ConfirmationMap,
  FsInstance,
  FsRule,
  Group,
  Gruppenbesuch,
  AnmeldeLink,
  MeetingTimes,
  Trolley,
  TrolleyTermin,
  WeitererPlan,
  PlanEintrag,
  PlanTakt,
  Member,
  Notification,
  NotificationType,
  Person,
  PersoenlichLog,
  Reminders,
  SentLog,
  Service,
  TaskStatus,
  Week,
} from '../data/types'
import { supabase } from './supabase'
import {
  type AbsenceRow,
  absenceFromRow,
  type AnwesenheitRow,
  anwesenheitFromRow,
  anwesenheitToRow,
  type FsRuleRow,
  fsRuleFromRow,
  fsRuleToRow,
  type GruppenbesuchRow,
  gruppenbesuchFromRow,
  gruppenbesuchToRow,
  type PersonRow,
  personFromRow,
  personToRow,
  type VortragRow,
  vortragFromRow,
  vortragToRow,
} from './zeilen'
import type { VorgemerkterVortrag } from '../data/vortragsplan'
import type { Anwesenheit } from '../data/anwesenheit'

/* ---- Row-Typen (Spalten aus supabase/schema.sql) ------------------------ */
// Personen, Abwesenheiten, Grundplan-Regeln, Gruppenbesuche und vorgemerkte
// Vorträge stehen in `zeilen.ts` — die lesen auch die Wartungsskripte, und dort
// hängt nichts am Client.

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
  ohne_reinigung: boolean
}

/** Ein Trolley (T121, Phase 7): eine Zeile. */
interface TrolleyRow {
  id: string
  name: string
  ort: string
  hinweis: string
}

function trolleyFromRow(r: TrolleyRow): Trolley {
  return { id: r.id, name: r.name, ort: r.ort, hinweis: r.hinweis }
}

function trolleyToRow(t: Trolley, congregationId: string) {
  return { id: t.id, congregation_id: congregationId, name: t.name, ort: t.ort, hinweis: t.hinweis }
}

/** Ein Trolley-Termin, wie die Datenbank und die Function `trolley` ihn liefern. */
export interface TrolleyTerminRow {
  id: string
  trolley_id: string
  datum: string
  von: string
  bis: string
  person_id: string
  partner_id: string | null
  gemeinsam: boolean
}

export function trolleyTerminFromRow(r: TrolleyTerminRow): TrolleyTermin {
  // `time` kommt als „10:00:00" — die App führt „10:00", wie bei den Regeln.
  return {
    id: r.id,
    trolleyId: r.trolley_id,
    datum: r.datum,
    von: kurzeZeit(r.von, '00:00'),
    bis: kurzeZeit(r.bis, '00:00'),
    pid: r.person_id,
    partner: r.partner_id,
    gemeinsam: r.gemeinsam,
  }
}

/** Weitere Pläne (T120, Phase 5): ein Plan, eine Zeile. */
interface PlanRow {
  id: string
  name: string
  von: string
  bis: string
  entwurf: boolean
  /** `woche` oder `monat` — die Datenbank lässt nichts anderes zu (`plaene.takt`). */
  takt: string
}

function planFromRow(r: PlanRow): WeitererPlan {
  return { id: r.id, name: r.name, von: r.von, bis: r.bis, entwurf: r.entwurf, takt: taktVon({ takt: r.takt as PlanTakt }) }
}

function planToRow(p: WeitererPlan, congregationId: string) {
  return {
    id: p.id,
    congregation_id: congregationId,
    name: p.name,
    von: p.von,
    bis: p.bis,
    entwurf: p.entwurf,
    takt: taktVon(p),
  }
}

/** Ein Eintrag eines weiteren Plans: die Woche und ihre Gruppe. */
interface PlanEintragRow {
  id: string
  plan_id: string
  datum: string
  grp: string | null
}

function planEintragFromRow(r: PlanEintragRow): PlanEintrag {
  return { id: r.id, planId: r.plan_id, datum: r.datum, grp: r.grp }
}

function planEintragToRow(e: PlanEintrag, congregationId: string) {
  return {
    id: e.id,
    congregation_id: congregationId,
    plan_id: e.planId,
    datum: e.datum,
    grp: e.grp,
  }
}

/**
 * Wie weit Weitere Pläne zurück geladen werden: die, die seit höchstens einem
 * Vierteljahr vorbei sind.
 */
const RUECKBLICK_TAGE = 91

/** Der erste Tag des Rückblicks (ISO). */
function rueckblickAb(): string {
  return tagNach(isoDay(new Date()), -RUECKBLICK_TAGE)
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

/** Eine Zeile des Versand-Tagebuchs (`assignment_log`), wie die App sie lädt. */
interface SentLogRow {
  task_key: string
  name: string
  sent_at: string
  user_id: string | null
  persoenlich_at: string | null
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
  zuteiler: boolean
  email: string
}

interface AnmeldeLinkRow {
  person_id: string
  gueltig_bis: string
  erstellt_at: string
  gesendet_at: string | null
  benutzt_at: string | null
}

/**
 * Die Spalten von `anmelde_links`, die die App lesen darf — **ausdrücklich**:
 * Die Prüfsummen von Token und Code sind für sie gesperrt (Spaltenrechte), und
 * ein `select('*')` scheiterte an ihnen als Ganzes.
 */
const ANMELDE_LINK_SPALTEN = 'person_id, gueltig_bis, erstellt_at, gesendet_at, benutzt_at'

export function anmeldeLinkAusZeile(r: AnmeldeLinkRow): AnmeldeLink {
  return { personId: r.person_id, gueltigBis: r.gueltig_bis, erstelltAt: r.erstellt_at, gesendetAt: r.gesendet_at, benutztAt: r.benutzt_at }
}

const NOTIF_TYPES: NotificationType[] = ['zuteilung', 'erinnerung', 'gesendet', 'import', 'verhindert']
const asNotifType = (t: string): NotificationType =>
  NOTIF_TYPES.includes(t as NotificationType) ? (t as NotificationType) : 'gesendet'

/* ---- Mapper Row ↔ App ---------------------------------------------------- */

function groupFromRow(r: GroupRow): Group {
  return {
    id: r.id,
    name: r.name,
    overseerId: r.overseer_id,
    assistantId: r.assistant_id,
    ohneReinigung: r.ohne_reinigung || undefined,
  }
}

function groupToRow(g: Group, congregationId: string, position: number) {
  return {
    id: g.id,
    congregation_id: congregationId,
    name: g.name,
    overseer_id: g.overseerId,
    assistant_id: g.assistantId,
    position,
    ohne_reinigung: Boolean(g.ohneReinigung),
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

interface AbsageRow {
  person_id: string
  task_key: string
}

function absageFromRow(r: AbsageRow): Absage {
  return { personId: r.person_id, taskKey: r.task_key }
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
 * Wie viele Tagebuch-Zeilen ein Ladevorgang höchstens mitnimmt.
 *
 * Eine Woche hat gut 35 Plätze, und jedes Umteilen legt eine weitere Zeile an —
 * sechzig je Woche lassen dafür Luft, für das Jahr, das die Wochen bleiben
 * (T125). Jüngste zuerst: Was für die kommenden Wochen zählt, wurde zuletzt
 * gemeldet und steht vorn.
 */
export const SENT_LOG_LIMIT = VERTEILUNG_WOCHEN * 60

/**
 * Zeilen je Seite — die Grenze, die PostgREST gehostet je Abfrage höchstens
 * liefert (`max-rows`, Vorgabe von Supabase: 1000).
 */
const SEITE = 1000

/** Eine Seite, wie supabase-js sie liefert; `count` nur mit `{ count: 'exact' }`. */
interface Seite<T> {
  data: T[] | null
  error: Zeilenfehler | null
  count?: number | null
}

/**
 * **Alle Zeilen einer wachsenden Tabelle — nicht nur die erste Seite.**
 *
 * PostgREST liefert je Abfrage höchstens `max-rows` Zeilen, und zwar
 * **still**: kein Fehler, kein Hinweis, nur weniger Zeilen. Die Zusagen
 * wachsen mit jeder Woche um gut 35, ein Jahr lang (T125); ohne Seiten fiel
 * nach gut einem halben Jahr ein beliebiger Teil weg, und ein bestätigter
 * Platz stand wieder als offen da. Das Tagebuch sollte bis zu `SENT_LOG_LIMIT`
 * Zeilen bringen und brachte nie mehr als 1000.
 *
 * Die Zählung (`count: 'exact'`) der ersten Seite sagt, wie viel es gibt. Die
 * übrigen Seiten gehen dann **gleichzeitig** hinaus, nicht nacheinander (seit
 * dem 16.10.2026, Review App #5): Jede weitere wäre sonst eine volle Netzrunde
 * mehr auf dem Weg zum ersten Bild. Wie groß eine Seite ist, sagt die erste:
 * Liefert der Server weniger als erbeten (eine kleinere Zeilengrenze), beginnt
 * jede weitere trotzdem lückenlos dahinter.
 *
 * `hoechstens` kappt bewusst (das Tagebuch: nur die jüngsten). Die Abfrage
 * braucht eine **eindeutige** Sortierung, sonst verschieben sich die Seiten
 * gegeneinander und eine Zeile fehlt oder kommt doppelt.
 */
async function alleSeiten<T>(
  seite: (von: number, bis: number) => PromiseLike<Seite<T>>,
  hoechstens = Number.POSITIVE_INFINITY,
): Promise<{ data: T[]; error: Zeilenfehler | null }> {
  const erste = await seite(0, Math.min(SEITE, hoechstens) - 1)
  if (erste.error) return { data: [], error: erste.error }
  const zeilen = [...(erste.data ?? [])]
  const gesamt = Math.min(erste.count ?? zeilen.length, hoechstens)
  const groesse = zeilen.length
  if (groesse === 0 || groesse >= gesamt) return { data: zeilen, error: null }
  const anfaenge: number[] = []
  for (let von = groesse; von < gesamt; von += groesse) anfaenge.push(von)
  const weitere = await Promise.all(anfaenge.map((von) => seite(von, Math.min(von + SEITE, hoechstens) - 1)))
  for (const { data, error } of weitere) {
    if (error) return { data: zeilen, error }
    zeilen.push(...(data ?? []))
  }
  return { data: zeilen.slice(0, gesamt), error: null }
}

export interface CongregationData {
  congregation: Congregation
  planner: boolean
  zuteiler: boolean
  personId: string | null
  persons: Person[]
  services: Service[]
  groups: Group[]
  /** Die geladenen Wochen, aufsteigend nach ihrer Kennung (`start`). */
  weeks: Week[]
  fsRules: FsRule[]
  fsWeeks: FsInstance[][]
  /** Besuche des Dienstaufsehers (T120), aufsteigend nach Woche — nicht an das Ladefenster gebunden. */
  gruppenbesuche: Gruppenbesuch[]
  /**
   * Vorgemerkte öffentliche Vorträge (T122), aufsteigend nach Woche. Nur für
   * Admin und Planer (RLS) — die Versammlung sieht einen Vortrag in seiner Woche.
   */
  vortraege: VorgemerkterVortrag[]
  /** Trolleys (T121, Phase 7) und ihre Termine ab dem Montag dieser Woche. */
  trolleys: Trolley[]
  trolleyTermine: TrolleyTermin[]
  /** Weitere Pläne (T120, Phase 5), deren Zeitraum frühestens ein Vierteljahr zurück endet. */
  plaene: WeitererPlan[]
  planEintraege: PlanEintrag[]
  absences: Absence[]
  /** Absagen des letzten Jahres (T126) — nur Admin und Planer bekommen Zeilen (RLS). */
  absagen: Absage[]
  /** Die Anwesenden je Zusammenkunft (T152), ein Jahr wie die Wochen. */
  anwesenheit: Anwesenheit[]
  notifications: Notification[]
  confirmations: ConfirmationMap
  reminders: Reminders
  congLang: string
  progLangs: string[] // weitere Programmsprachen (jw.org-Codes)
  auxClass: boolean // Zusaetzliche Klasse eingerichtet
  members: Member[]
  anmeldeLinks: AnmeldeLink[]
  /** Wer wurde wann über welchen Platz benachrichtigt (`assignment_log`). */
  sentLog: SentLog
  /** Wer davon kein Konto hat — und ob der Planer es ihm selbst gesagt hat. */
  persoenlich: PersoenlichLog
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
  // Für die Seiten-Abfragen unten: In einem Rückruf vergisst TypeScript, dass
  // der importierte Client hier schon geprüft ist.
  const db = supabase

  const { data: member, error: memberErr } = await supabase
    .from('members')
    .select('congregation_id, person_id, planner, zuteiler')
    .eq('user_id', userId)
    .maybeSingle()
  if (memberErr) return { ok: false, reason: 'error', message: memberErr.message }
  if (!member) return { ok: false, reason: 'no-membership' }

  const congregationId = member.congregation_id as string

  // **Ladefenster** (T125, 16.10.2026): was die App braucht, und nicht mehr —
  // gezählt vom Montag der laufenden Woche (`aufbewahrung.ts`). Ein Jahr für
  // die Wochen und was zu ihnen gehört (Treffpunkte, Gruppenbesuche,
  // vorgemerkte Vorträge, Plan-Einträge, Absagen) und ebenso ein Jahr nach
  // ihrem Ende für die Abwesenheiten (seit 17.10.2026, für die Auswertung;
  // bis dahin acht Wochen). Was voraus liegt, kommt ganz. Älteres räumt die
  // Datenbank (`alte_daten_loeschen`).
  //
  // Bis dahin waren es die jüngsten 52 Wochen, angelegt am Ergebnis — mit einer
  // Frist ab heute braucht die Grenze keine Vorabfrage. Gemessen wird seit T66
  // am Datum, nicht an einer Ordnungszahl: Eine Lücke im Bestand (T65: die Woche
  // des Gedächtnismahls fehlt im Arbeitsheft) verschiebt nichts.
  //
  // Zusagen und Versand-Tagebuch tragen ihre Woche nur im Schlüssel; dort hält
  // das Aufräumen den Bestand klein.
  const verteilungAb = aufbewahrtAb(VERTEILUNG_WOCHEN)
  const wochenAbfrage = supabase
    .from('weeks')
    .select('start, data, updated_at')
    .eq('congregation_id', congregationId)
    .gte('start', verteilungAb)
    .order('start', { ascending: false })
  const fsWochenAbfrage = supabase
    .from('fs_weeks')
    .select('start, data, updated_at')
    .eq('congregation_id', congregationId)
    .gte('start', verteilungAb)
    .order('start', { ascending: false })

  const [cong, persons, services, groups, weeks, absences, notifs, confs, members, linkRows, fsRulesRows, fsWeeksRows, sentLogRows, besuchRows, vortragRows, trolleyRows, trolleyTerminRows, planRows, planEintragRows, absageRows, anwesenheitRows] = await Promise.all([
    supabase.from('congregations').select(CONG_SPALTEN.join(', ')).eq('id', congregationId).maybeSingle(),
    supabase.from('persons').select('*').eq('congregation_id', congregationId).order('created_at'),
    supabase.from('services').select('*').eq('congregation_id', congregationId).order('position'),
    supabase.from('groups').select('*').eq('congregation_id', congregationId).order('position'),
    wochenAbfrage,
    // Versammlungsweit, nicht nur die eigenen: die Planung muss wissen, wer
    // fehlt (RLS erlaubt der Versammlung ohnehin das Lesen). „Deine Einträge"
    // im persönlichen Bereich filtert selbst auf die eigene user_id.
    // Seitenweise wie die Zusagen: Eine, die hinter der Zeilengrenze läge,
    // bekäme der Planer nicht zu sehen. Ein Jahr nach ihrem Ende, wie die
    // Wochen: Die Auswertung rechnet über das ganze Jahr damit, wer fehlte
    // (T126, 17.10.2026). Den Grund leert die Datenbank nach acht Wochen.
    alleSeiten<AbsenceRow>((von, bis) =>
      db
        .from('absences')
        .select('*', { count: 'exact' })
        .eq('congregation_id', congregationId)
        .gte('to_date', verteilungAb)
        .order('from_date')
        .order('id')
        .range(von, bis),
    ),
    // Dieselbe Abfrage, die auch das Nachladen beim Öffnen der Glocke benutzt.
    notifAbfrage(supabase, congregationId),
    // Seitenweise (`alleSeiten`): Die Zusagen wachsen ohne Grenze.
    alleSeiten<ConfirmationRow>((von, bis) =>
      db
        .from('confirmations')
        .select('task_key, status', { count: 'exact' })
        .eq('congregation_id', congregationId)
        .order('task_key')
        .order('user_id')
        .range(von, bis),
    ),
    // Nicht-Admins sehen per RLS nur die eigene Zeile bzw. keine Anmelde-Links
    supabase.from('members').select('user_id, person_id, planner, zuteiler, email').eq('congregation_id', congregationId).order('created_at'),
    supabase.from('anmelde_links').select(ANMELDE_LINK_SPALTEN).eq('congregation_id', congregationId),
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
    // Ohne `user_id` hat die Nachricht niemanden erreicht — die Zusagen der
    // Woche nennen diese Personen, und der Planer hakt ab (`persoenlich_at`).
    // Seitenweise bis zur Grenze (`alleSeiten`): Eine Abfrage allein brachte
    // nie mehr als die Zeilengrenze von PostgREST, ein Drittel davon.
    alleSeiten<SentLogRow>(
      (von, bis) =>
        db
          .from('assignment_log')
          .select('task_key, name, sent_at, user_id, persoenlich_at', { count: 'exact' })
          .eq('congregation_id', congregationId)
          .order('sent_at', { ascending: false })
          .order('id')
          .range(von, bis),
      SENT_LOG_LIMIT,
    ),
    // Gruppenbesuche des Dienstaufsehers (T120) — alles Kommende, auch in
    // Wochen, die noch nicht importiert sind, und zurück ein Jahr wie die
    // Zuteilungen (T125). Es sind wenige (einer je Monat).
    supabase
      .from('gruppenbesuche')
      .select('id, woche, grp, person_id')
      .eq('congregation_id', congregationId)
      .gte('woche', verteilungAb)
      .order('woche'),
    // Vorgemerkte Vorträge (T122) — ebenso alles Kommende und zurück ein Jahr
    // wie ihre Wochen. Ein Mitglied ohne Zuteilungsrecht bekommt keine Zeile
    // (RLS).
    supabase
      .from('vortraege')
      .select('id, woche, redner, versammlung, eigener, person_id, thema, lied')
      .eq('congregation_id', congregationId)
      .gte('woche', verteilungAb)
      .order('woche'),
    // Trolleys (T121): alle, und ihre Termine ab dem Montag dieser Woche —
    // was davor liegt, zeigt die App nirgends mehr. Die Termine seitenweise
    // (`alleSeiten`): Ein Vierteljahr voraus, mehrere Trolleys, halbe Stunden —
    // an der Zeilengrenze fehlten sonst still die spätesten, und ihr Platz
    // stünde frei da.
    supabase.from('trolleys').select('id, name, ort, hinweis').eq('congregation_id', congregationId),
    alleSeiten<TrolleyTerminRow>((von, bis) =>
      db
        .from('trolley_termine')
        .select('id, trolley_id, datum, von, bis, person_id, partner_id, gemeinsam', { count: 'exact' })
        .eq('congregation_id', congregationId)
        .gte('datum', montagVon(isoDay(new Date())))
        // Nach Tag und Zeit, wie der Reducer sie hält (`termineSortiert`) — zwei
        // Termine in einer Zelle des Rasters stehen dann in der Folge des Tages.
        // Die Kennung zuletzt: Die Seiten brauchen eine eindeutige Folge.
        .order('datum')
        .order('von')
        .order('id')
        .range(von, bis),
    ),
    // Weitere Pläne (T120, Phase 5): was frühestens ein Vierteljahr zurück
    // endet — die abgeschlossenen stehen beim Planen noch eine Weile als
    // Rückblick da. Ein Mitglied bekommt nur, was es sehen darf (RLS).
    supabase
      .from('plaene')
      .select('id, name, von, bis, entwurf, takt')
      .eq('congregation_id', congregationId)
      .gte('bis', rueckblickAb())
      .order('von'),
    // Die Einträge reichen weiter zurück als die Pläne selbst: Ein laufender
    // Plan kann vor mehr als einem Vierteljahr begonnen haben. Ein Jahr wie
    // die Zuteilungen (T125); verteilt wird ohnehin nur ab der laufenden
    // Spanne (`gruppenVerteilen`). Was zu keinem geladenen Plan gehört, fällt
    // unten heraus. Seitenweise (`alleSeiten`): Ein Plan mit einer Zeile je
    // Woche wächst mit jedem Jahr um gut fünfzig.
    alleSeiten<PlanEintragRow>((von, bis) =>
      db
        .from('plan_eintraege')
        .select('id, plan_id, datum, grp', { count: 'exact' })
        .eq('congregation_id', congregationId)
        .gte('datum', verteilungAb)
        .order('datum')
        .order('id')
        .range(von, bis),
    ),
    // Absagen (T126): ein Jahr wie ihre Wochen. Ein Mitglied ohne
    // Zuteilungsrecht bekommt keine Zeile (RLS). Seitenweise: Über ein Jahr
    // kommen leicht ein paar Hundert zusammen.
    alleSeiten<AbsageRow>((von, bis) =>
      db
        .from('absagen')
        .select('person_id, task_key', { count: 'exact' })
        .eq('congregation_id', congregationId)
        .gte('woche', verteilungAb)
        .order('woche')
        .order('task_key')
        .order('person_id')
        .range(von, bis),
    ),
    // Die Anwesenden (T152): ein Jahr wie ihre Wochen, für die Auswertung. Zwei
    // Zeilen je Woche — im Jahr gut hundert, weit unter der Zeilengrenze.
    supabase
      .from('anwesenheit')
      .select('woche, zusammenkunft, saal, video, person_id')
      .eq('congregation_id', congregationId)
      .gte('woche', verteilungAb)
      .order('woche'),
  ])

  // Alle dreizehn Abfragen prüfen, nicht zehn: fehlten fs_rules/fs_weeks in der
  // Liste, blieb ein Ladefehler dort stumm und die Treffpunkte kamen einfach
  // leer an — genau der Fall bei einer Instanz ohne Migration 010.
  //
  // Das Versand-Tagebuch steht **nicht** in dieser Liste, und zwar mit Absicht:
  // Fehlt die Tabelle, bleibt die Anzeige „benachrichtigt am" leer — das ist
  // eine fehlende Auskunft, kein fehlender Datenbestand, und die App bleibt
  // benutzbar.
  //
  // Die Gruppenbesuche ebenso wenig: Die Tabelle kam mit T120 hinzu, und eine
  // Datenbank, in der `schema.sql` seitdem nicht neu lief, hat sie noch nicht.
  // Die App bleibt dann benutzbar, nur ohne Besuche — gespeichert werden
  // können sie erst nach dem Schema (dann meldet der Schreibfehler-Toast).
  const firstErr = [cong, persons, services, groups, weeks, absences, notifs, confs, members, fsRulesRows, fsWeeksRows]
    .find((r) => r.error)?.error
  if (firstErr) return { ok: false, reason: 'error', message: firstErr.message }
  // Ohne die Links fehlt nur der Stand der Anmeldung an den Personen — kein
  // Grund, dem Admin die ganze App zu verweigern.
  if (linkRows.error) console.error('[anmelde_links]', linkRows.error.message)
  if (sentLogRows.error) console.error('[assignment_log]', sentLogRows.error.message)
  const tagebuch = sentLogRows.data
  if (besuchRows.error) console.error('[gruppenbesuche]', besuchRows.error.message)
  // Ebenso die vorgemerkten Vorträge (T122).
  if (vortragRows.error) console.error('[vortraege]', vortragRows.error.message)
  // Ebenso die Trolleys (T121, Phase 7).
  if (trolleyRows.error) console.error('[trolleys]', trolleyRows.error.message)
  if (trolleyTerminRows.error) console.error('[trolley_termine]', trolleyTerminRows.error.message)
  // Und die weiteren Pläne (Phase 5).
  if (planRows.error) console.error('[plaene]', planRows.error.message)
  if (planEintragRows.error) console.error('[plan_eintraege]', planEintragRows.error.message)
  // Und die Absagen (T126): Ohne sie fehlt nur ein Abschnitt der Auswertung.
  if (absageRows.error) console.error('[absagen]', absageRows.error.message)
  // Ebenso die Anwesenden (T152) — und solange `schema.sql` nicht lief, gibt es
  // die Tabelle noch nicht.
  if (anwesenheitRows.error) console.error('[anwesenheit]', anwesenheitRows.error.message)

  const serviceList = (services.data ?? []).map((r) => serviceFromRow(r as ServiceRow))
  const personList = (persons.data ?? []).map((r) => personFromRow(r as PersonRow))
  // Absteigend geholt, aufsteigend gebraucht (`CongregationData.weeks`).
  const wochenAbsteigend = (weeks.data ?? []) as WeekRow[]
  // Dieselbe Grenze noch einmal am Ergebnis. Sie schneidet nichts weg, was die
  // Abfrage nicht ohnehin ausgelassen hätte; sie steht da als das, was das
  // Fenster ausmacht, für beide Wochen-Tabellen gleich.
  const imFenster = <T extends { start: string }>(rows: T[]): T[] =>
    rows.filter((r) => r.start >= verteilungAb).slice().reverse()
  const weekRows = imFenster(wochenAbsteigend)
  // Stände merken: jeder spätere Schreibvorgang nennt den Stand, auf dem er
  // beruht (T39). Vor dem Füllen leeren — ein zweiter Ladevorgang (Neuanmeldung,
  // Konflikt-Nachladen) darf keine Stände einer anderen Versammlung erben.
  wochen.setzen(weekRows.map((r) => [r.start, r.updated_at]))
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
  const fsZeilen = imFenster((fsWeeksRows.data ?? []) as { start: string; data: FsInstance[]; updated_at: string }[])
  for (const row of fsZeilen) fsNachWoche.set(row.start, row.data)
  // Stände merken wie bei den Wochen — eine Woche ohne Zeile hat keinen und
  // wird beim ersten Schreiben angelegt.
  fsWochen.setzen(fsZeilen.flatMap((r): Array<[string, string]> => (r.updated_at ? [[r.start, r.updated_at]] : [])))
  const storedFsWeeks: FsInstance[][] = weekList.map((w) => fsNachWoche.get(w.start) ?? [])
  const ausgerichtet = fsRules.length
    ? regenFsWeeks(weekList.map((w) => w.start), storedFsWeeks, fsRules)
    : storedFsWeeks
  // Leiter ohne `lpid` an ihre Person binden — dasselbe, was `pidsNachtragen`
  // eine Bildschirmhöhe weiter oben für die Zusammenkünfte tut. Ohne das bliebe
  // eine gelöschte und neu angelegte Person in ihren Treffpunkten für immer ein
  // bloßer Name.
  const fsWeeks = fsLeiterBinden(ausgerichtet, personList)
  const planListe = ((planRows.data ?? []) as PlanRow[]).map(planFromRow)
  const geladenePlaene = new Set(planListe.map((p) => p.id))

  const data: CongregationData = {
    congregation: { name: c?.name ?? '', hall: c?.hall ?? '', times: zeiten },
    planner: Boolean(member.planner),
    zuteiler: Boolean(member.zuteiler),
    personId: (member.person_id as string | null) ?? null,
    persons: personList,
    services: serviceList,
    groups: gruppenListe,
    weeks: weekList,
    fsRules,
    fsWeeks,
    gruppenbesuche: ((besuchRows.data ?? []) as GruppenbesuchRow[]).map(gruppenbesuchFromRow),
    vortraege: ((vortragRows.data ?? []) as VortragRow[]).map(vortragFromRow),
    trolleys: ((trolleyRows.data ?? []) as TrolleyRow[]).map(trolleyFromRow),
    trolleyTermine: trolleyTerminRows.data.map(trolleyTerminFromRow),
    plaene: planListe,
    planEintraege: ((planEintragRows.data ?? []) as PlanEintragRow[])
      .map(planEintragFromRow)
      .filter((e) => geladenePlaene.has(e.planId)),
    absences: (absences.data ?? []).map((r) => absenceFromRow(r as AbsenceRow)),
    absagen: absageRows.data.map(absageFromRow),
    anwesenheit: ((anwesenheitRows.data ?? []) as AnwesenheitRow[]).map(anwesenheitFromRow),
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
      zuteiler: r.zuteiler,
    })),
    anmeldeLinks: ((linkRows.data ?? []) as AnmeldeLinkRow[]).map(anmeldeLinkAusZeile),
    sentLog: Object.fromEntries(tagebuch.map((r) => [sentKey(r.task_key, r.name), r.sent_at])),
    persoenlich: Object.fromEntries(
      tagebuch.filter((r) => r.user_id === null).map((r) => [sentKey(r.task_key, r.name), r.persoenlich_at]),
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

/** Ein Fehler aus PostgREST — `code` ist der SQLSTATE, bei Netzfehlern leer. */
type Zeilenfehler = { message: string; code?: string }

/**
 * **Abweisungen, die nur ein veralteter Stand erklärt** — bei den Tabellen
 * „eine Zeile je …": eine Dublette (23505), ein Verweis ins Leere (23503: der
 * Termin, der Plan, die Gruppe ist inzwischen gelöscht), eine verletzte Regel
 * (23514: der Platz ist besetzt, der Termin liegt auf einem anderen Wochentag)
 * und eine verweigerte Zeile (42501: das Recht ist entzogen). Ein zweiter
 * Versuch hilft da nicht, nur Nachladen.
 */
const STAND_VERALTET: ReadonlySet<string> = new Set(['23505', '23503', '23514', '42501'])

function standVeraltet(error: Zeilenfehler): boolean {
  return error.code !== undefined && STAND_VERALTET.has(error.code)
}

/**
 * Wie `run`, für die Tabellen „eine Zeile je …": Hat die Datenbank abgewiesen,
 * weil der Stand hier veraltet ist, wird **nachgeladen** (`konfliktMelder`) statt
 * nur gemeldet — sonst stünde lokal weiter da, was es dort nicht gibt: „Du bist
 * eingetragen" für einen Platz, den ein anderer schon hatte. Bis zum 3.10.2026
 * lud allein das Zeugnisgeben nach, und nur bei zwei der Fälle.
 */
async function zeilenRun(promise: PromiseLike<{ error: Zeilenfehler | null }>): Promise<void> {
  const { error } = await promise
  if (!error) return
  if (!standVeraltet(error)) {
    schreibfehler(error)
    return
  }
  console.error('[persistenz]', error.message)
  konfliktMelder?.()
}

type Schreiben = () => Promise<{ error: Zeilenfehler | null }>

/**
 * **Eine Schreib-Schlange:** Was hineinkommt, geht in dieser Reihenfolge
 * hinaus, eines nach dem anderen. Ein Netzfehler hält sie nicht an — sonst
 * ginge nach ihm gar nichts mehr hinaus.
 *
 * Bis zum 3.10.2026 stand die Schlange zweimal da (Zeugnisgeben, Weitere
 * Pläne), Zeile für Zeile gleich; jede Tabellen-Familie bekommt ihre eigene.
 */
function schreibSchlange(): (schreiben: Schreiben) => void {
  let schlange: Promise<void> = Promise.resolve()
  return (schreiben) => {
    schlange = schlange
      .then(() => zeilenRun(schreiben()))
      .catch((err: unknown) => schreibfehler({ message: err instanceof Error ? err.message : String(err) }))
  }
}

/**
 * **Erst löschen, was dieser Planer entfernt hat, dann schreiben, was er
 * angelegt oder geändert hat** — der gemeinsame Weg der Tabellen mit einer
 * Zeile je Regel, Besuch, Termin, Vortrag, Plan oder Eintrag. Gelöscht wird
 * nur über die Kennungen in `entfernt`, nie „alles, was fehlt" (warum, steht
 * bei `saveFsRules`). Stand bis zum 3.10.2026 sechsmal da.
 */
async function loeschenDannSchreiben<T>(
  client: NonNullable<typeof supabase>,
  tabelle: string,
  congregationId: string,
  zeilen: T[],
  entfernt: string[],
  zuZeile: (zeile: T, congregationId: string) => object,
): Promise<{ error: Zeilenfehler | null }> {
  if (entfernt.length) {
    const { error } = await client.from(tabelle).delete().eq('congregation_id', congregationId).in('id', entfernt)
    if (error) return { error }
  }
  if (!zeilen.length) return { error: null }
  return await client.from(tabelle).upsert(zeilen.map((z) => zuZeile(z, congregationId)))
}

/* ---- Schreibkonflikte zwischen Planern (T39) ----------------------------- */

/**
 * **Welcher Ladevorgang gilt** — weitergezählt, sobald ein Laden die Stände
 * ersetzt (`setzen` in `wochenTabelle`).
 *
 * Ein Schreibvorgang beruht auf dem Zustand, aus dem er kommt, und der stammt
 * aus einem bestimmten Ladevorgang. Lädt die App dazwischen neu — nach einem
 * Konflikt, nach „Plan senden", nach einem Push-Klick —, gilt der frisch
 * geladene Stand, und der alte Inhalt passt nicht mehr zu ihm:
 *
 *  - **Wartet er noch in seiner Kette, geht er nicht mehr los.** Er nähme den
 *    frischen Stand und schriebe den alten Inhalt darüber — lautlos genau das,
 *    was der Stand verhindern soll (T39). Stattdessen meldet er einen Konflikt.
 *  - **War er schon unterwegs, setzt seine Antwort den Stand nicht mehr.** Hat
 *    das Laden vor ihm gelesen, zeigt der Bildschirm den Inhalt ohne ihn; mit
 *    seinem Stand daneben nähme die nächste Änderung ihn lautlos zurück. Mit
 *    dem geladenen Stand trifft sie einen Konflikt, und die App lädt nach.
 *
 * Bis zum 15.10.2026 galt einfach der jüngste Stand, auch über ein Laden
 * hinweg.
 */
let ladung = 0

/** Den Stand nach einem Schreibvorgang merken — nur, wenn seither nicht neu geladen wurde (`ladung`). */
function standMerken(staende: Map<string, string>, woche: string, stand: string, geladen: number): void {
  if (geladen === ladung) staende.set(woche, stand)
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
 * **Eine Tabelle „eine Zeile je Woche", geschrieben mit Stand** — die
 * Zusammenkünfte (`weeks`, T39) und die Treffpunkte (`fs_weeks`, seit dem
 * 15.10.2026) nach derselben Regel.
 *
 * Bis T39 ging die **ganze Woche** als Upsert hinaus, ohne Sperre und ohne
 * Versionskennzeichen. Planten zwei gleichzeitig, gewann der Letzte, und seine
 * Fassung überschrieb die des anderen lautlos. Bei den Treffpunkten liegt die
 * Woche als **eine** Liste in einer Zeile; wer mit älterem Stand schrieb, nahm
 * still zurück, was ein Gruppenaufseher inzwischen eingetragen hatte.
 *
 * Bis zum 16.10.2026 stand beides als Abschrift da, und die Fehlerbehandlung
 * war auseinandergelaufen. Die Treffpunkte luden bei jeder Abweisung nach, die
 * nur ein veralteter Stand erklärt; die Wochen nur bei einer Dublette. Eine
 * entzogene Berechtigung (42501) meldete dort einen Schreibfehler, und der
 * Bildschirm zeigte weiter, was nicht gespeichert war.
 *
 * Je Woche geführt, über ihre Kennung (`start`, seit T66 keine Ordnungszahl):
 *
 *  - **der Stand**, wie ihn die Datenbank zuletzt bestätigt hat. Er wird nie
 *    selbst gebildet, nur zurückgereicht: Die Zeichenkette kommt aus PostgREST
 *    und geht unverändert dorthin zurück, Genauigkeit und Zeitzone sind damit
 *    kein Thema;
 *  - **die Schreibkette**: Vorgänge derselben Woche laufen hintereinander.
 *    Sonst gingen zwei rasche Änderungen mit demselben Stand los, und die
 *    zweite meldete einen Konflikt gegen sich selbst.
 */
function wochenTabelle(tabelle: 'weeks' | 'fs_weeks') {
  const staende = new Map<string, string>()
  const kette = new Map<string, Promise<void>>()

  /**
   * Eine Woche schreiben und dabei den Stand prüfen.
   *
   *  1. Kein Stand bekannt → die Zeile gibt es hier noch nicht: anlegen.
   *  2. Stand bekannt → ändern **mit** Bedingung `updated_at = <Stand>`. Eine
   *     getroffene Zeile bringt den neuen Stand zurück; fertig.
   *  3. Keine Zeile getroffen, oder eine Abweisung, die nur ein veralteter Stand
   *     erklärt (`STAND_VERALTET`: angelegt hatte sie schon ein anderer, das
   *     Recht ist weg, der Trigger `fs_weeks_pruefen` weist ab) → melden, die
   *     App lädt nach. Überschrieben wurde nichts.
   *
   * Bis zum 5.10.2026 stand zwischen 2 und 3 ein Schritt: nachsehen und, wenn
   * dort noch der eigene Stand stand, **ohne** Bedingung schreiben — gegen einen
   * falschen Konfliktalarm, für den es keinen bekannten Auslöser gibt. Er
   * öffnete genau das Fenster, das die Bedingung schließen soll: Was ein anderer
   * zwischen Nachsehen und Schreiben speicherte, ging lautlos verloren. Die Edge
   * Functions schreiben nach derselben Regel (`_shared/woche-schreiben.ts`).
   *
   * `geladen`: die Ladung, aus der der Inhalt stammt (`ladung`). Wurde seither
   * neu geladen, geht er nicht mehr hinaus.
   *
   * `true`: Die Woche steht so in der Datenbank. Erst dann darf geschehen, was
   * an ihr hängt — das Löschen verfallener Zusagen, die Meldung „zurückgezogen"
   * (`persist.ts`, 16.10.2026).
   */
  async function schreiben(congregationId: string, woche: string, data: unknown, geladen: number): Promise<boolean> {
    if (!supabase) return false
    if (geladen !== ladung) {
      konfliktMelder?.()
      return false
    }
    const stand = staende.get(woche)
    const { data: zeile, error } =
      stand === undefined
        ? await supabase
            .from(tabelle)
            .insert({ congregation_id: congregationId, start: woche, data })
            .select('updated_at')
            .maybeSingle()
        : await supabase
            .from(tabelle)
            .update({ data })
            .eq('congregation_id', congregationId)
            .eq('start', woche)
            .eq('updated_at', stand)
            .select('updated_at')
            .maybeSingle()
    if (error) {
      if (standVeraltet(error)) {
        console.error('[persistenz]', error.message)
        konfliktMelder?.()
      } else schreibfehler(error)
      return false
    }
    if (zeile) {
      standMerken(staende, woche, zeile.updated_at as string, geladen)
      return true
    }
    konfliktMelder?.()
    return false
  }

  return {
    staende,
    kette,
    /** Nach einem Laden: die geladenen Stände übernehmen, Wartendes vergessen. */
    setzen(paare: Array<[string, string]>): void {
      ladung++
      staende.clear()
      kette.clear()
      for (const [woche, stand] of paare) staende.set(woche, stand)
    },
    /**
     * In die Kette der Woche einreihen. Ohne Kennung gibt es keine Zeile, die
     * gemeint sein könnte — nichts schreiben (bis T66 die Platzhalter-Prüfung).
     *
     * Die Ladung wird jetzt festgehalten, nicht erst beim Losgehen: Bis dahin
     * kann die Kette ein Laden überdauert haben. Das `catch` steht vor dem
     * Anhängen, sonst risse ein Fehlschlag die Kette ab, und die Woche schriebe
     * nie wieder; gemeldet wird er als Schreibfehler.
     */
    speichern(congregationId: string, woche: string, data: unknown): Promise<boolean> {
      if (!supabase || !woche) return Promise.resolve(false)
      const vorher = kette.get(woche) ?? Promise.resolve()
      const geladen = ladung
      const ergebnis = vorher.then(() =>
        schreiben(congregationId, woche, data, geladen).catch((err: unknown) => {
          schreibfehler({ message: err instanceof Error ? err.message : String(err) })
          return false
        }),
      )
      kette.set(woche, ergebnis.then(() => {}))
      return ergebnis
    },
  }
}

const wochen = wochenTabelle('weeks')
const fsWochen = wochenTabelle('fs_weeks')

/**
 * Eine Woche speichern. Welche Zeile gemeint ist, sagt ihre eigene Kennung —
 * kein Index von außen mehr (T66). Admin und Planer schreiben sie gleich —
 * unmittelbar in die Tabelle (`weeks_write`); bis zum 15.10.2026 ging die Woche
 * eines Planers über die Edge Function `zuteilen`.
 */
export function saveWeek(congregationId: string, week: Week): Promise<boolean> {
  return wochen.speichern(congregationId, week.start, week)
}

/**
 * **Warten, bis die Woche geschrieben ist** — die Zusammenkünfte und die
 * Treffpunkte, alles, was schon in ihren Ketten steht. Für die Aufrufe, die
 * danach auf dem Server lesen, was hier eben geändert wurde (`wocheDraussen`
 * in `planen/wochen-versand.ts`). Die Ketten fangen ihre Fehler selbst, das
 * Warten scheitert also nie.
 */
export async function wocheGeschrieben(woche: string): Promise<void> {
  await Promise.all([wochen.kette.get(woche), fsWochen.kette.get(woche)])
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
 * **Geschrieben wird ebenso nur, was er angelegt oder geändert hat** — mehr
 * übergibt `persist.ts` nicht. Bis zum 3.10.2026 ging der ganze Grundplan als
 * Upsert hinaus und stellte zurück, was ein anderer Planer inzwischen geändert
 * oder gelöscht hatte; derselbe Weg gilt für die Weiteren Pläne.
 *
 * Nacheinander, nicht nebeneinander — sonst könnte das Löschen eine gerade
 * erst geschriebene Zeile treffen.
 */
export function saveFsRules(congregationId: string, rules: FsRule[], entfernt: string[] = []): void {
  if (!supabase) return
  const client = supabase
  regelnNacheinander(() => loeschenDannSchreiben(client, 'fs_rules', congregationId, rules, entfernt, fsRuleToRow))
}

/*
 * **Je Tabelle eine Schlange** (`schreibSchlange`) — bis zum 16.10.2026 hatten
 * sie nur die Pläne. Grundplan, Besuche, Vorträge und Trolleys gingen jeder
 * Aufruf für sich los: Zwei schnelle Handlungen an derselben Zeile (den
 * Besucher wechseln, dann den Besuch entfernen) liefen nebeneinander, und kam
 * das Schreiben nach dem Löschen an, stand der Besuch nach dem Neuladen wieder
 * da.
 */
const regelnNacheinander = schreibSchlange()
const besucheNacheinander = schreibSchlange()
const vortraegeNacheinander = schreibSchlange()
const trolleysNacheinander = schreibSchlange()

/**
 * Gruppenbesuche des Dienstaufsehers (T120) — eine Zeile je Besuch.
 *
 * Wie beim Grundplan wird nur gelöscht, was **dieser** Planer entfernt hat
 * (`entfernt`), und nur geschrieben, was er angelegt oder geändert hat. Ein
 * zweiter Planer, der zugleich verteilt, verliert so nichts; träfen beide
 * dieselbe Gruppe in derselben Woche, weist die Datenbank den zweiten ab
 * (`unique (congregation_id, woche, grp)`), und der zweite lädt nach
 * (`zeilenRun`) — sonst stünden bei ihm Besuche, die es nicht gibt.
 */
export function saveGruppenbesuche(congregationId: string, besuche: Gruppenbesuch[], entfernt: string[] = []): void {
  if (!supabase) return
  const client = supabase
  besucheNacheinander(() => loeschenDannSchreiben(client, 'gruppenbesuche', congregationId, besuche, entfernt, gruppenbesuchToRow))
}

/**
 * Vorgemerkte Vorträge (T122) — eine Zeile je Woche, derselbe Weg wie bei den
 * Gruppenbesuchen. Übernehmen zwei Planer zugleich einen Vortragsplan, weist
 * die Datenbank die zweite Vormerkung derselben Woche ab
 * (`unique (congregation_id, woche)`), und der zweite lädt nach.
 */
export function saveVortraege(congregationId: string, vortraege: VorgemerkterVortrag[], entfernt: string[] = []): void {
  if (!supabase) return
  const client = supabase
  vortraegeNacheinander(() => loeschenDannSchreiben(client, 'vortraege', congregationId, vortraege, entfernt, vortragToRow))
}

const anwesenheitNacheinander = schreibSchlange()

/**
 * **Die Anwesenden einer Zusammenkunft** (T152) — eine Zeile je
 * Zusammenkunft, geschrieben über ihren natürlichen Schlüssel: Tragen
 * Saalordner und Zoom-Ordner zugleich ein, gilt, was zuletzt kam — beide sehen
 * dieselbe Zusammenkunft und berichtigen sich höchstens. Wer eintragen darf,
 * prüft die Datenbank (`darf_anwesenheit`); weist sie ab, lädt die App nach
 * (`zeilenRun`).
 */
export function saveAnwesenheit(congregationId: string, eintraege: Anwesenheit[]): void {
  if (!supabase || eintraege.length === 0) return
  const client = supabase
  anwesenheitNacheinander(async () => {
    const { error } = await client
      .from('anwesenheit')
      .upsert(
        eintraege.map((a) => anwesenheitToRow(a, congregationId)),
        { onConflict: 'congregation_id,woche,zusammenkunft' },
      )
    return { error }
  })
}

/**
 * Trolleys (T121, Phase 7) — wie die Gruppenbesuche: geschrieben wird, was der
 * Admin angelegt oder geändert hat.
 *
 * **Gelöscht wird hier nie.** Mit einem Trolley gehen seine Termine, und wer
 * eingetragen war, soll es erfahren — das tut die Edge Function `trolley`
 * (`trolleyEntfernen` in `lib/trolley.ts`), bevor der Zustand ihn verliert.
 * Löschte dieser Weg mit, käme er ihr womöglich zuvor, und niemand bekäme
 * Bescheid.
 */
export function saveTrolleys(congregationId: string, trolleys: Trolley[]): void {
  if (!supabase) return
  const client = supabase
  trolleysNacheinander(() => loeschenDannSchreiben(client, 'trolleys', congregationId, trolleys, [], trolleyToRow))
}

/**
 * Weitere Pläne (T120, Phase 5): Pläne und Einträge in **einer** Schlange.
 * Ein neuer Eintrag zeigt auf einen Plan, der womöglich noch im Bündel wartet
 * („Neuer Plan" und gleich „Reihum verteilen"); der Plan geht deshalb vorher
 * hinaus, und die Schlange hält die Reihenfolge.
 */
const planNacheinander = schreibSchlange()

/** Pläne: anlegen oder ändern, was übergeben wird; löschen, was hier entfernt wurde (die Einträge per Kaskade). */
export function savePlaene(congregationId: string, plaene: WeitererPlan[], entfernt: string[] = []): void {
  if (!supabase) return
  const client = supabase
  planNacheinander(() => loeschenDannSchreiben(client, 'plaene', congregationId, plaene, entfernt, planToRow))
}

/**
 * Einträge: erst löschen, dann schreiben. Je Plan und Woche gibt es einen Platz
 * (`plan_eintraege_woche`); der Reducer behält deshalb die Kennung eines
 * Platzes, wenn er nur eine andere Gruppe bekommt.
 */
export function savePlanEintraege(congregationId: string, eintraege: PlanEintrag[], entfernt: string[] = []): void {
  if (!supabase) return
  const client = supabase
  planNacheinander(() => loeschenDannSchreiben(client, 'plan_eintraege', congregationId, eintraege, entfernt, planEintragToRow))
}

/**
 * Materialisierte Treffpunkte einer Woche (Kennung → FsInstance[]) — mit Stand,
 * je Woche hintereinander, wie die Wochen der Zusammenkünfte (`wochenTabelle`).
 *
 * Gegen den Gruppenaufseher half bis zum 15.10.2026 zufällig der Trigger
 * (`fs_weeks_pruefen` weist eine geänderte fremde Gruppe ab); Admin und Planer
 * prüft er nicht oder nur ohne Leiter. Seine Abweisung (42501: der
 * Gruppenaufseher änderte eine fremde Gruppe, der Planer mehr als den Leiter)
 * entsteht nur auf einem veralteten Stand, die Oberfläche bietet beides nicht
 * an — also wird nachgeladen.
 */
export function saveFsWeek(congregationId: string, woche: string, insts: FsInstance[]): Promise<boolean> {
  return fsWochen.speichern(congregationId, woche, insts)
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

/** Die Zeile eines Abos löschen — mit Antwort, denn das Abmelden wartet darauf (`pushAboLoesen`). */
export async function deletePushSubscription(endpoint: string): Promise<void> {
  if (!supabase) return
  await run(supabase.from('push_subscriptions').delete().eq('endpoint', endpoint))
}

/**
 * Steht dieses Abo als **eigenes** in der Datenbank? Die Zugriffsregel zeigt
 * nur eigene Zeilen (`user_id = auth.uid()`) — ein fremdes Abo desselben
 * Endpoints sieht hier niemand. `null`: Die Frage ging nicht durch.
 */
export async function pushAboEigen(endpoint: string): Promise<boolean | null> {
  if (!supabase) return null
  const { data, error } = await supabase.from('push_subscriptions').select('endpoint').eq('endpoint', endpoint).maybeSingle()
  if (error) return null
  return data !== null
}

/**
 * Ein Abo neu eintragen, **ohne** eine bestehende Zeile anzufassen. `fremd`:
 * Den Endpoint führt schon eine Zeile, die nicht die eigene ist — sie gehört
 * dem, der vorher auf diesem Gerät angemeldet war (`push_subscriptions.endpoint`
 * ist eindeutig).
 */
export async function pushAboEintragen(
  congregationId: string,
  userId: string,
  sub: { endpoint: string; p256dh: string; auth: string },
  lang: string,
): Promise<'eingetragen' | 'fremd' | 'fehler'> {
  if (!supabase) return 'fehler'
  const { error } = await supabase.from('push_subscriptions').insert({
    congregation_id: congregationId,
    user_id: userId,
    endpoint: sub.endpoint,
    p256dh: sub.p256dh,
    auth: sub.auth,
    lang,
  })
  if (!error) return 'eingetragen'
  return error.code === '23505' ? 'fremd' : 'fehler'
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
 *
 * `taskKey`: die Aufgabe, um die es geht (die Absage, seit dem 4.10.2026) —
 * daran findet ein Tipp in der Glocke ihre Woche. Ohne ihn bleibt der Aufruf
 * genau der alte; so verträgt er auch eine Datenbank, die den vierten
 * Parameter noch nicht kennt.
 */
export function notifyPlanners(type: NotificationType, title: string, body: string, taskKey?: string): void {
  if (!supabase) return
  void run(
    supabase.rpc('notify_planners', {
      kind: type,
      subject: title,
      message: body,
      ...(taskKey ? { task: taskKey } : {}),
    }),
  )
}

/**
 * **Persönlich Bescheid gegeben** (T121, Phase 5g) — oder den Haken wieder
 * weg. Wer kein Konto hat, ist auf keinem Weg zu erreichen; der Planer sagt es
 * ihm selbst und hakt es in den Zusagen der Woche ab. Über
 * `persoenlich_bescheid` (security definer): Das Versand-Tagebuch schreibt
 * sonst nur `send-plan`.
 */
export function persoenlichBescheid(taskKey: string, name: string, ja: boolean): void {
  if (!supabase) return
  void run(supabase.rpc('persoenlich_bescheid', { p_task_key: taskKey, p_name: name, p_ja: ja }))
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
 *
 * Scheitert es — ein anderer war schneller, das Gesuch ist erledigt, die
 * Zusammenkunft fällt aus —, wird **nachgeladen** (`konfliktMelder`), wie
 * beim Füllen eines freien Platzes. Bis zum 14.10.2026 stand hier `run()`: Es
 * meldete einen Schreibfehler, und der Aufrufer stand trotzdem weiter als
 * eingesprungen da, wo längst ein anderer stand — bis zum nächsten Laden.
 */
export function substituteTake(taskKey: string): void {
  if (!supabase) return
  const geladen = ladung
  void supabase.functions.invoke('substitute', { body: { action: 'take', taskKey } }).then(({ data, error }) => {
    if (!error) {
      standDerFunctionUebernehmen(data, geladen)
      return
    }
    console.error('[substitute/take]', error.message)
    konfliktMelder?.()
  })
}

/**
 * **Den Stand nach einem Schreiben der Function übernehmen** — Einspringen und
 * ein freier Platz (`substitute`) schreiben die Woche selbst. Ohne den neuen
 * Stand meldete die nächste eigene Änderung derselben Woche einen Konflikt, den
 * es nicht gab: Ein Admin, der einspringt und gleich weiterplant, verlor seine
 * Änderung an ein Nachladen (bis zum 15.10.2026).
 *
 * Übernommen wird nur, was auf dem Stand aufbaut, den diese App kennt
 * (`vorher`): Dann steht dort, was auch hier steht — dieselbe Änderung hat der
 * Reducer gemacht. Hat dazwischen ein anderer geschrieben, bleibt der alte
 * Stand, und die nächste Änderung lädt nach, statt dessen Arbeit zu
 * überschreiben.
 */
function standDerFunctionUebernehmen(antwort: unknown, geladen: number): void {
  const { woche, vorher, stand } = (antwort ?? {}) as { woche?: unknown; vorher?: unknown; stand?: unknown }
  if (typeof woche !== 'string' || typeof stand !== 'string') return
  if (wochen.staende.get(woche) !== vorher) return
  standMerken(wochen.staende, woche, stand, geladen)
}

/**
 * Einen **offenen Platz selbst übernehmen** (4.10.2026) — Edge Function
 * `substitute`, Aufruf 'fill'. Serverseitig aus demselben Grund wie das
 * Einspringen: Wochen und Bestätigungen schreibt sonst nur der Planer.
 *
 * Schlägt es fehl — jemand war schneller, der Platz wird nicht mehr angeboten
 * —, wird **nachgeladen** statt nur gemeldet (`konfliktMelder`). Mit `run()`
 * stünde man hier weiter eingetragen, wo längst ein anderer steht.
 *
 * Der Kalendertag des Geräts geht mit (5.10.2026): Der Server kennt nur UTC,
 * und zwischen Mitternacht und 02:00 ließe sich dort noch ein Platz vom Vorabend
 * übernehmen — dieselbe Lage wie bei „Plan senden".
 */
export function platzFuellen(taskKey: string): void {
  if (!supabase) return
  const heute = isoDay(new Date())
  const geladen = ladung
  void supabase.functions.invoke('substitute', { body: { action: 'fill', taskKey, heute } }).then(({ data, error }) => {
    if (!error) {
      standDerFunctionUebernehmen(data, geladen)
      return
    }
    console.error('[substitute/fill]', error.message)
    konfliktMelder?.()
  })
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
export function sendPlan(weekStart: string, heute: string): Promise<PlanVersand | null> {
  // `heute`: der Kalendertag, mit dem die Vorschau am Knopf gerechnet hat —
  // die Function lässt Vergangenes weg und soll denselben Tag meinen.
  return planSenden({ action: 'plan', weekStart, heute })
}

/**
 * Der eine Aufruf hinter den Knöpfen, die auf die Antwort von `send-plan`
 * warten — „Plan senden" (bis zum 3.10.2026 dreimal abgeschrieben) und „Jetzt
 * erinnern". `null`: Er ist gescheitert.
 */
async function sendPlanAntwort<T>(body: {
  action: 'plan' | 'erinnern'
  heute: string
  weekStart?: string
}): Promise<Partial<T> | null> {
  if (!supabase) return null
  const { data, error } = await supabase.functions.invoke('send-plan', { body })
  if (error) {
    console.error(`[send-plan/${body.action}]`, error.message)
    return null
  }
  return (data ?? {}) as Partial<T>
}

async function planSenden(body: { action: 'plan'; heute: string; weekStart: string }): Promise<PlanVersand | null> {
  const res = await sendPlanAntwort<PlanVersand>(body)
  return res && { personen: res.personen ?? 0, ohneKonto: res.ohneKonto ?? [] }
}

/** Ergebnis von „Jetzt erinnern" (`send-plan`, Aktion `erinnern`). */
export interface Erinnert {
  /** Wie viele Personen jetzt erinnert wurden. */
  personen: number
  /** Wie viele heute schon eine Erinnerung hatten und deshalb ausblieben. */
  schonHeute: number
}

/**
 * **Jetzt erinnern** (Zusagen der Woche, T121, Phase 5g): Wer von seinem
 * Platz der Woche schon weiß und noch nicht zugesagt hat, bekommt die
 * Erinnerung sofort — je Person und Tag höchstens eine, von selbst oder von
 * Hand. Nicht fire-and-forget: Der Planer hat gedrückt und soll erfahren, was
 * daraus wurde. `heute` wie bei `sendPlan`: Vergangenes bleibt draußen.
 *
 * **Reihenfolge beim Ausrollen:** erst die Function — eine ältere kennt die
 * Aktion nicht und antwortet mit 400.
 */
export async function erinnerungSenden(weekStart: string, heute: string): Promise<Erinnert | null> {
  const res = await sendPlanAntwort<Erinnert>({ action: 'erinnern', weekStart, heute })
  return res && { personen: res.personen ?? 0, schonHeute: res.schonHeute ?? 0 }
}

/**
 * Zuteilungen, von denen jemand wusste (zugesagt oder gemeldet), wurden
 * zurückgezogen oder verlegt — die betroffenen Personen erfahren es sofort
 * (`entzogeneZuteilungen`).
 *
 * Das ist der einzige Fall, in dem eine Zuteilungs-Nachricht nicht auf den
 * Knopf wartet: Wer von seinem Platz weiß, bereitet vor. Bliebe es beim
 * nächsten „Plan senden", übte jemand tagelang für einen Platz, den er nicht
 * mehr hat.
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
export function sendPlanEntzug(entzuege: EntzogeneZuteilung[]): void {
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

/** Eine Glocken-Zeile gelesen — die angetippte (`mitteilungGelesen`). */
export function markNotificationRead(congregationId: string, userId: string, id: string): void {
  if (!supabase) return
  void run(
    supabase
      .from('notifications')
      .update({ read: true })
      .eq('congregation_id', congregationId)
      .eq('user_id', userId)
      .eq('id', id),
  )
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

/**
 * „Alle löschen" (T140): die eigenen Mitteilungen in dieser Versammlung — auch
 * die, die über die geladenen hinausgehen. Mehr lässt `notifications_delete`
 * ohnehin nicht zu; `user_id` steht trotzdem da, damit die Absicht im Aufruf
 * steht und nicht erst in der Datenbankregel.
 */
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

/**
 * Stammdaten der Versammlung — **nur, was sich geändert hat** (15.10.2026).
 *
 * Hier gingen Name, Saal und alle vier Zeit-Spalten bei jeder Änderung
 * hinaus. Zwei Admins, die zugleich Verschiedenes einstellten, überschrieben
 * sich dabei still: Wer den Saal umbenannte, schrieb mit seinem älteren Stand
 * die Zusammenkunftszeit zurück, die der andere eben geändert hatte. Die Zeiten
 * bleiben eine Einheit — sie werden zusammen eingestellt.
 */
export function saveCongregationInfo(congregationId: string, info: Partial<Congregation>): void {
  if (!supabase) return
  const spalten = {
    ...(info.name !== undefined ? { name: info.name } : {}),
    ...(info.hall !== undefined ? { hall: info.hall } : {}),
    ...(info.times
      ? { mid_wd: info.times.mid.wd, mid_time: info.times.mid.time, we_wd: info.times.we.wd, we_time: info.times.we.time }
      : {}),
  }
  if (Object.keys(spalten).length === 0) return
  void run(supabase.from('congregations').update(spalten).eq('id', congregationId))
}

/** Was sich an den Einstellungen der Versammlung geändert hat. */
export interface EinstellungsAenderung {
  reminders?: Reminders
  congLang?: string
  progLangs?: string[]
  auxClass?: boolean
}

/**
 * Versammlungsweite Einstellungen (Erinnerungen, Sprachen, Zusätzliche Klasse)
 * — **nur, was sich geändert hat**, aus demselben Grund wie bei den
 * Stammdaten: Wer die Erinnerung verstellte, schrieb sonst die Zusätzliche
 * Klasse eines zweiten Admins mit seinem älteren Stand zurück.
 *
 * Bis zum 17. September 2026 gingen sie als ein JSONB-Objekt `settings` in eine
 * einzige Spalte. Jetzt sind es Spalten mit Typ und Grenzen — die Zusagen
 * „1..21 Tage" und „0..7 Tage" standen vorher nur im Eingabefeld.
 */
export function saveSettings(congregationId: string, aenderung: EinstellungsAenderung): void {
  if (!supabase) return
  const { reminders, congLang, progLangs, auxClass } = aenderung
  const spalten = {
    ...(reminders
      ? { reminder_first: reminders.first, reminder_last: reminders.last, reminder_repeat: reminders.repeat }
      : {}),
    ...(congLang !== undefined ? { cong_lang: congLang } : {}),
    ...(progLangs ? { prog_langs: progLangs } : {}),
    ...(auxClass !== undefined ? { aux_class: auxClass } : {}),
  }
  if (Object.keys(spalten).length === 0) return
  void run(supabase.from('congregations').update(spalten).eq('id', congregationId))
}

/** Bestätigung/Verhinderung einer Aufgabe (eigene Zeile je Nutzer+Slot). */
export function saveConfirmation(
  congregationId: string,
  userId: string,
  taskKey: string,
  status: Exclude<TaskStatus, 'offen'>,
): void {
  if (!supabase) return
  // Über `zeilenRun`: Weist die Datenbank ab, weil die Aufgabe inzwischen
  // nicht mehr meine ist (`task_gehoert_mir`, 42501), wird nachgeladen. Bis zum
  // 16.10.2026 kam nur die Meldung, und lokal blieb „bestätigt" für einen Platz
  // stehen, den längst ein anderer hatte.
  void zeilenRun(
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

/* ---- Mitglieder & Anmelde-Links (nur Admins, RLS-geschützt) -------------- */

export function saveMemberRow(member: Member): void {
  if (!supabase) return
  void run(
    supabase
      .from('members')
      .update({ person_id: member.personId, planner: member.planner, zuteiler: member.zuteiler })
      .eq('user_id', member.userId),
  )
}

export function deleteMemberRow(userId: string): void {
  if (!supabase) return
  void run(supabase.from('members').delete().eq('user_id', userId))
}

/**
 * Den Anmelde-Link einer Person zurückziehen — Link und Zettel melden danach
 * niemanden mehr an. Ausgestellt wird er nur von der Function `send-invite`.
 */
export function deleteAnmeldeLink(personId: string): void {
  if (!supabase) return
  void run(supabase.from('anmelde_links').delete().eq('person_id', personId))
}
