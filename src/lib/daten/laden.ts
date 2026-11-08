/**
 * Der volle Ladevorgang: alle Daten der Versammlung des angemeldeten Kontos
 * in einem Zug — wachsende Tabellen seitenweise, Zeilen über die Umformer der
 * Fachmodule.
 */

import { STANDARD_ERINNERUNGEN } from '../../data/vorgaben'
import { zeitenAus } from '../../../supabase/functions/_shared/planung.ts'
import { fsLeiterBinden, regenFsWeeks } from '../../data/fs'
import { sentKey } from '../../data/planung/schluessel'
import { pidsNachtragen } from '../../data/namensbindung'
import { normalizeChairKeys } from '../../data/helpers'
import { isoDay, montagVon, wirktAb } from '../../data/meeting-dates'
import { aufbewahrtAb, VERTEILUNG_WOCHEN } from '../../data/aufbewahrung'
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
  Trolley,
  TrolleyTermin,
  WeitererPlan,
  PlanEintrag,
  Member,
  Notification,
  Person,
  PersoenlichLog,
  Reminders,
  SentLog,
  Service,
  Week,
} from '../../data/types'
import { supabase } from '../supabase'
import { type AbgelehnteGesuche, gesuchKennung } from '../abgelehnte-gesuche'
import {
  type AbsenceRow,
  absenceFromRow,
  type AnwesenheitRow,
  anwesenheitFromRow,
  type TauschAnfrageRow,
  tauschAnfrageFromRow,
  type FsRuleRow,
  fsRuleFromRow,
  type GruppenbesuchRow,
  gruppenbesuchFromRow,
  type PersonRow,
  personFromRow,
  type VortragRow,
  vortragFromRow,
} from '../zeilen'
import type { VorgemerkterVortrag } from '../../data/vortragsplan'
import type { Anwesenheit } from '../../data/anwesenheit'
import type { TauschAnfrage } from '../../data/tausch'
import type { Zeilenfehler } from './schreibweg'
import { fsWochen, wochen, type WeekRow } from './wochen'
import { ABWESENHEIT_SPALTEN, PERSON_SPALTEN } from './personen'
import {
  CONG_SPALTEN,
  groupFromRow,
  serviceFromRow,
  type CongregationRow,
  type GroupRow,
  type ServiceRow,
} from './versammlung'
import { trolleyFromRow, trolleyTerminFromRow, type TrolleyRow, type TrolleyTerminRow } from './predigtdienst'
import { planEintragFromRow, planFromRow, rueckblickAb, type PlanEintragRow, type PlanRow } from './plaene'
import { absageFromRow, confirmationMap, type AbsageRow, type ConfirmationRow } from './zusagen'
import { notifAbfrage, notificationsAus, type NotificationRow } from './mitteilungen'
import { ANMELDE_LINK_SPALTEN, anmeldeLinkAusZeile, type AnmeldeLinkRow, type MemberRow } from './konto'

/*
 * Ohne konfigurierten Client (siehe supabase.ts) steigt das Laden vorher aus
 * (`if (!supabase)`). Was geladen wird, sagt `CongregationData`. Nicht in der
 * Datenbank, bewusst geräteweise in localStorage: App-Sprache und Darstellung.
 */

/* ---- Laden --------------------------------------------------------------- */

/**
 * Wie viele Tagebuch-Zeilen ein Ladevorgang höchstens mitnimmt.
 *
 * Eine Woche hat gut 35 Plätze, und jedes Umteilen legt eine weitere Zeile an —
 * sechzig je Woche lassen dafür Luft, für das Jahr, das die Wochen bleiben.
 * Jüngste zuerst: Was für die kommenden Wochen zählt, wurde zuletzt
 * gemeldet und steht vorn.
 */
export const SENT_LOG_LIMIT = VERTEILUNG_WOCHEN * 60

/** Eine Zeile des Versand-Tagebuchs (`assignment_log`), wie die App sie lädt. */
interface SentLogRow {
  task_key: string
  name: string
  sent_at: string
  user_id: string | null
  persoenlich_at: string | null
}

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
 * wachsen mit jeder Woche um gut 35, ein Jahr lang; ohne Seiten fiele nach
 * gut einem halben Jahr ein beliebiger Teil weg, und ein bestätigter Platz
 * stünde wieder als offen da. Das Tagebuch soll bis zu `SENT_LOG_LIMIT` Zeilen
 * bringen und brächte nie mehr als 1000.
 *
 * Die Zählung (`count: 'exact'`) der ersten Seite sagt, wie viel es gibt. Die
 * übrigen Seiten gehen dann **gleichzeitig** hinaus, nicht nacheinander: Jede
 * weitere wäre sonst eine volle Netzrunde mehr auf dem Weg zum ersten Bild.
 * Wie groß eine Seite ist, sagt die erste:
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
  admin: boolean
  zuteiler: boolean
  personId: string | null
  persons: Person[]
  services: Service[]
  groups: Group[]
  /** Die geladenen Wochen, aufsteigend nach ihrer Kennung (`start`). */
  weeks: Week[]
  fsRules: FsRule[]
  fsWeeks: FsInstance[][]
  /** Besuche des Dienstaufsehers, aufsteigend nach Woche — nicht an die geladenen Wochen gebunden. */
  gruppenbesuche: Gruppenbesuch[]
  /**
   * Vorgemerkte öffentliche Vorträge, aufsteigend nach Woche. Nur für
   * Admin und Planer (RLS) — die Versammlung sieht einen Vortrag in seiner Woche.
   */
  vortraege: VorgemerkterVortrag[]
  /** Trolleys und ihre Termine ab dem Montag dieser Woche. */
  trolleys: Trolley[]
  trolleyTermine: TrolleyTermin[]
  /** Weitere Pläne, deren Zeitraum frühestens ein Vierteljahr zurück endet. */
  plaene: WeitererPlan[]
  planEintraege: PlanEintrag[]
  absences: Absence[]
  /** Absagen des letzten Jahres — nur Admin und Planer bekommen Zeilen (RLS). */
  absagen: Absage[]
  /** Die Anwesenden je Zusammenkunft, ein Jahr wie die Wochen. */
  anwesenheit: Anwesenheit[]
  /** Offene Tausch-Anfragen — nur die, um die es den Angemeldeten geht (RLS). */
  tauschAnfragen: TauschAnfrage[]
  /** „Nein, danke" des Kontos auf Ersatzgesuche — nur die eigenen Zeilen (RLS). */
  abgelehnteGesuche: AbgelehnteGesuche
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
    .select('congregation_id, person_id, admin, zuteiler')
    .eq('user_id', userId)
    .maybeSingle()
  if (memberErr) return { ok: false, reason: 'error', message: memberErr.message }
  if (!member) return { ok: false, reason: 'no-membership' }

  const congregationId = member.congregation_id as string

  // **Ladefenster**: was die App braucht, und nicht mehr — gezählt vom Montag
  // der laufenden Woche (`aufbewahrung.ts`). Ein Jahr für die Wochen und was
  // zu ihnen gehört (Treffpunkte, Gruppenbesuche, vorgemerkte Vorträge,
  // Plan-Einträge, Absagen) und ebenso ein Jahr nach ihrem Ende für die
  // Abwesenheiten (für die Auswertung). Was voraus liegt, kommt ganz. Älteres
  // räumt die Datenbank (`alte_daten_loeschen`).
  //
  // Mit einer Frist ab heute braucht die Grenze keine Vorabfrage, anders als
  // „die jüngsten 52 Wochen", die erst am Ergebnis feststünden. Gemessen wird
  // am Datum, nicht an einer Ordnungszahl: Eine Lücke im Bestand (die Woche
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

  const [cong, persons, services, groups, weeks, absences, gruende, notifs, confs, members, linkRows, fsRulesRows, fsWeeksRows, sentLogRows, besuchRows, vortragRows, trolleyRows, trolleyTerminRows, planRows, planEintragRows, absageRows, anwesenheitRows, tauschRows, abgelehntRows] = await Promise.all([
    supabase.from('congregations').select(CONG_SPALTEN.join(', ')).eq('id', congregationId).maybeSingle(),
    supabase.from('persons').select(PERSON_SPALTEN).eq('congregation_id', congregationId).order('created_at'),
    supabase.from('services').select('*').eq('congregation_id', congregationId).order('position'),
    supabase.from('groups').select('*').eq('congregation_id', congregationId).order('position'),
    wochenAbfrage,
    // Versammlungsweit, nicht nur die eigenen: die Planung muss wissen, wer
    // fehlt (RLS erlaubt der Versammlung ohnehin das Lesen). „Deine Einträge"
    // im persönlichen Bereich filtert selbst auf die eigene user_id.
    // Seitenweise wie die Zusagen: Eine, die hinter der Zeilengrenze läge,
    // bekäme der Planer nicht zu sehen. Ein Jahr nach ihrem Ende, wie die
    // Wochen: Die Auswertung rechnet über das ganze Jahr damit, wer fehlte.
    // Den Grund leert die Datenbank nach acht Wochen.
    alleSeiten<Omit<AbsenceRow, 'reason'>>((von, bis) =>
      db
        .from('absences')
        .select(ABWESENHEIT_SPALTEN, { count: 'exact' })
        .eq('congregation_id', congregationId)
        .gte('to_date', verteilungAb)
        .order('from_date')
        .order('id')
        .range(von, bis),
    ),
    // Die Gründe: dem Admin alle, sonst die eigenen. Es sind wenige — die
    // Datenbank leert sie nach acht Wochen.
    supabase.rpc('abwesenheit_gruende'),
    // Dieselbe Abfrage, die auch das Nachladen beim Öffnen der Glocke benutzt.
    notifAbfrage(supabase, congregationId),
    // Seitenweise (`alleSeiten`): Die Zusagen wachsen über die Zeilengrenze.
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
    supabase.from('members').select('user_id, person_id, admin, zuteiler, email').eq('congregation_id', congregationId).order('created_at'),
    supabase.from('anmelde_links').select(ANMELDE_LINK_SPALTEN).eq('congregation_id', congregationId),
    supabase.from('fs_rules').select('*').eq('congregation_id', congregationId).order('created_at'),
    fsWochenAbfrage,
    // Versand-Tagebuch: welcher Platz wurde wann gemeldet. Der
    // Planen-Screen zeigt es an, und der „Plan senden"-Knopf zählt daraus, was
    // noch aussteht.
    //
    // **Jüngste zuerst, und begrenzt.** Die Tabelle wächst ein Jahr lang, bis
    // das Aufräumen sie kürzt: rund 35 Plätze je Woche sind gegen 1800 Zeilen,
    // und jedes Umteilen legt eine weitere an. Ungebremst holte jeder
    // Kaltstart den ganzen Bestand — in den Zustand, von dort in die
    // Momentaufnahme im Browser-Speicher, und deren Platz ist knapp. Absteigend
    // sortiert kann die Grenze nichts Gebrauchtes abschneiden: Was für die
    // geladenen Wochen zählt, wurde zuletzt gemeldet und steht damit vorn.
    // Ohne `user_id` hat die Nachricht niemanden erreicht — die Zusagen der
    // Woche nennen diese Personen, und der Planer hakt ab (`persoenlich_at`).
    // Seitenweise bis zur Grenze (`alleSeiten`): Eine Abfrage allein brächte
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
    // Gruppenbesuche des Dienstaufsehers — alles Kommende, auch in Wochen, die
    // noch nicht importiert sind, und zurück ein Jahr wie die Zuteilungen. Es
    // sind wenige (einer je Monat).
    supabase
      .from('gruppenbesuche')
      .select('id, woche, grp, person_id')
      .eq('congregation_id', congregationId)
      .gte('woche', verteilungAb)
      .order('woche'),
    // Vorgemerkte Vorträge — ebenso alles Kommende und zurück ein Jahr wie
    // ihre Wochen. Ein Mitglied ohne Zuteilungsrecht bekommt keine Zeile (RLS).
    supabase
      .from('vortraege')
      .select('id, woche, redner, versammlung, eigener, person_id, thema, lied')
      .eq('congregation_id', congregationId)
      .gte('woche', verteilungAb)
      .order('woche'),
    // Trolleys: alle, und ihre Termine ab dem Montag dieser Woche — was davor
    // liegt, zeigt die App nirgends. Die Termine seitenweise (`alleSeiten`):
    // Ein Vierteljahr voraus, mehrere Trolleys, halbe Stunden — an der
    // Zeilengrenze fehlten sonst still die spätesten, und ihr Platz stünde
    // frei da.
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
    // Weitere Pläne: was frühestens ein Vierteljahr zurück endet — die
    // abgeschlossenen stehen beim Planen noch eine Weile als Rückblick da. Ein
    // Mitglied bekommt nur, was es sehen darf (RLS).
    supabase
      .from('plaene')
      .select('id, name, von, bis, entwurf, takt')
      .eq('congregation_id', congregationId)
      .gte('bis', rueckblickAb())
      .order('von'),
    // Die Einträge reichen weiter zurück als die Pläne selbst: Ein laufender
    // Plan kann vor mehr als einem Vierteljahr begonnen haben. Ein Jahr wie
    // die Zuteilungen; verteilt wird ohnehin nur ab der laufenden Spanne
    // (`gruppenVerteilen`). Was zu keinem geladenen Plan gehört, fällt unten
    // heraus. Seitenweise (`alleSeiten`): Ein Plan mit einer Zeile je Woche
    // wächst mit jedem Jahr um gut fünfzig.
    alleSeiten<PlanEintragRow>((von, bis) =>
      db
        .from('plan_eintraege')
        .select('id, plan_id, datum, grp, person_id, aus', { count: 'exact' })
        .eq('congregation_id', congregationId)
        .gte('datum', verteilungAb)
        .order('datum')
        .order('id')
        .range(von, bis),
    ),
    // Absagen: ein Jahr wie ihre Wochen. Ein Mitglied ohne Zuteilungsrecht
    // bekommt keine Zeile (RLS). Seitenweise: Über ein Jahr kommen leicht ein
    // paar Hundert zusammen.
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
    // Die Anwesenden: ein Jahr wie ihre Wochen, für die Auswertung. Zwei
    // Zeilen je Woche — im Jahr gut hundert, weit unter der Zeilengrenze.
    supabase
      .from('anwesenheit')
      .select('woche, zusammenkunft, saal, video, person_id')
      .eq('congregation_id', congregationId)
      .gte('woche', verteilungAb)
      .order('woche'),
    // Offene Tausch-Anfragen: von mir und an mich, sonst sieht niemand
    // eine (RLS). Was vorbei ist, beantwortet niemand mehr.
    supabase
      .from('tausch_anfragen')
      .select('id, von_person, an_person, gibt_ab, nimmt, bis')
      .eq('congregation_id', congregationId)
      .gte('bis', isoDay(new Date()))
      .order('bis'),
    // „Nein, danke" auf Ersatzgesuche: nur die eigenen Zeilen (RLS). Das
    // Aufräumen nimmt sie nach ihrer Woche; vorgelegt wird Vergangenes ohnehin
    // nicht.
    supabase.from('abgelehnte_gesuche').select('task_key, abgesagt_von').eq('congregation_id', congregationId),
  ])

  // Geprüft werden die Abfragen, ohne die die App nicht arbeitet — auch
  // fs_rules/fs_weeks: Fehlten sie in der Liste, bliebe ein Ladefehler dort
  // stumm, und die Treffpunkte kämen einfach leer an.
  //
  // Das Versand-Tagebuch steht **nicht** in dieser Liste, und zwar mit Absicht:
  // Fehlt die Tabelle, bleibt die Anzeige „benachrichtigt am" leer — das ist
  // eine fehlende Auskunft, kein fehlender Datenbestand, und die App bleibt
  // benutzbar.
  //
  // Die Gruppenbesuche ebenso wenig: Eine Datenbank, in der das aktuelle
  // `schema.sql` nicht lief, hat die Tabelle noch nicht. Die App bleibt dann
  // benutzbar, nur ohne Besuche — gespeichert werden können sie erst nach dem
  // Schema (dann meldet der Schreibfehler-Toast).
  const firstErr = [cong, persons, services, groups, weeks, absences, notifs, confs, members, fsRulesRows, fsWeeksRows]
    .find((r) => r.error)?.error
  if (firstErr) return { ok: false, reason: 'error', message: firstErr.message }
  // Die Gründe nicht: Geschrieben wird eine Abwesenheit nur neu, nie
  // zurück — ohne sie fehlt bloß ein Satz in der Liste.
  if (gruende.error) console.error('[abwesenheit_gruende]', gruende.error.message)
  // Ohne die Links fehlt nur der Stand der Anmeldung an den Personen — kein
  // Grund, dem Admin die ganze App zu verweigern.
  if (linkRows.error) console.error('[anmelde_links]', linkRows.error.message)
  if (sentLogRows.error) console.error('[assignment_log]', sentLogRows.error.message)
  const tagebuch = sentLogRows.data
  if (besuchRows.error) console.error('[gruppenbesuche]', besuchRows.error.message)
  // Ebenso die vorgemerkten Vorträge.
  if (vortragRows.error) console.error('[vortraege]', vortragRows.error.message)
  // Ebenso die Trolleys.
  if (trolleyRows.error) console.error('[trolleys]', trolleyRows.error.message)
  if (trolleyTerminRows.error) console.error('[trolley_termine]', trolleyTerminRows.error.message)
  // Und die weiteren Pläne.
  if (planRows.error) console.error('[plaene]', planRows.error.message)
  if (planEintragRows.error) console.error('[plan_eintraege]', planEintragRows.error.message)
  // Und die Absagen: Ohne sie fehlt nur ein Abschnitt der Auswertung.
  if (absageRows.error) console.error('[absagen]', absageRows.error.message)
  // Ebenso die Anwesenden — und solange `schema.sql` nicht lief, gibt es die
  // Tabelle noch nicht.
  if (anwesenheitRows.error) console.error('[anwesenheit]', anwesenheitRows.error.message)
  // Ebenso die Tausch-Anfragen: Ohne sie fehlen nur die Karten dazu.
  if (tauschRows.error) console.error('[tausch_anfragen]', tauschRows.error.message)
  // Und das „Nein, danke": Ohne es fragt das Blatt beim Öffnen nur noch einmal.
  if (abgelehntRows.error) console.error('[abgelehnte_gesuche]', abgelehntRows.error.message)

  const serviceList = (services.data ?? []).map((r) => serviceFromRow(r as ServiceRow))
  const personList = ((persons.data ?? []) as unknown as PersonRow[]).map(personFromRow)
  // Absteigend geholt, aufsteigend gebraucht (`CongregationData.weeks`).
  const wochenAbsteigend = (weeks.data ?? []) as WeekRow[]
  // Dieselbe Grenze noch einmal am Ergebnis. Sie schneidet nichts weg, was die
  // Abfrage nicht ohnehin ausgelassen hätte; sie steht da als das, was das
  // Fenster ausmacht, für beide Wochen-Tabellen gleich.
  const imFenster = <T extends { start: string }>(rows: T[]): T[] =>
    rows.filter((r) => r.start >= verteilungAb).slice().reverse()
  const weekRows = imFenster(wochenAbsteigend)
  // Stände merken: jeder spätere Schreibvorgang nennt den Stand, auf dem er
  // beruht. Vor dem Füllen leeren — ein zweiter Ladevorgang (Neuanmeldung,
  // Konflikt-Nachladen) darf keine Stände einer anderen Versammlung erben.
  wochen.setzen(weekRows.map((r) => [r.start, r.updated_at]))
  // Die Kennung kommt aus der **Spalte**, nicht aus dem Blob: sie ist der
  // Primärschlüssel der Woche, der Blob trägt nur das Programm. Damit trägt
  // jede geladene Woche ihr Datum, auch die älteste. Die Zeilen reihen sich
  // nach Datum: eine fehlende Woche ist eine fehlende Woche und verschiebt
  // nichts.
  //
  // **Der Ladevorgang liest nur** — ein Zurückschreiben träfe mitten in die
  // Arbeit des Planers. Jeder Punkt bekommt seine Kennung beim Entstehen
  // (`PartItem.iid`) und jede Zuteilung ihre `pid`; es bleibt nur das Binden
  // loser Namen an ihre Person, und das geschieht rein im Speicher.
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
  // Ab der laufenden Woche (`wirktAb`): Die Treffpunkte davor fanden so statt,
  // wie sie gespeichert sind.
  const ausgerichtet = fsRules.length
    ? regenFsWeeks(weekList.map((w) => w.start), storedFsWeeks, fsRules, { ab: wirktAb() })
    : storedFsWeeks
  // Leiter ohne `lpid` an ihre Person binden — dasselbe, was `pidsNachtragen`
  // eine Bildschirmhöhe weiter oben für die Zusammenkünfte tut. Ohne das bliebe
  // eine gelöschte und neu angelegte Person in ihren Treffpunkten für immer ein
  // bloßer Name.
  const fsWeeks = fsLeiterBinden(ausgerichtet, personList)
  const planListe = ((planRows.data ?? []) as PlanRow[]).map(planFromRow)
  const geladenePlaene = new Set(planListe.map((p) => p.id))
  const grundVon = new Map(((gruende.data ?? []) as { id: string; reason: string }[]).map((g) => [g.id, g.reason]))

  const data: CongregationData = {
    congregation: { name: c?.name ?? '', hall: c?.hall ?? '', times: zeiten },
    admin: Boolean(member.admin),
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
    absences: (absences.data ?? []).map((r) => absenceFromRow({ ...r, reason: grundVon.get(r.id) ?? '' })),
    absagen: absageRows.data.map(absageFromRow),
    anwesenheit: ((anwesenheitRows.data ?? []) as AnwesenheitRow[]).map(anwesenheitFromRow),
    tauschAnfragen: ((tauschRows.data ?? []) as TauschAnfrageRow[]).map(tauschAnfrageFromRow),
    abgelehnteGesuche: ((abgelehntRows.data ?? []) as { task_key: string; abgesagt_von: string }[]).map((r) =>
      gesuchKennung({ key: r.task_key, declinedBy: r.abgesagt_von }),
    ),
    notifications: notificationsAus((notifs.data ?? []) as NotificationRow[], weekList, zeiten),
    confirmations,
    reminders,
    auxClass: c?.aux_class ?? false,
    // **Eine Sprache ist ein Code**, in der Datenbank wie im Zustand —
    // an dieser Grenze wird nichts umgesetzt.
    congLang: c?.cong_lang ?? 'de',
    progLangs: c?.prog_langs ?? [],
    members: ((members.data ?? []) as MemberRow[]).map((r) => ({
      userId: r.user_id,
      email: r.email,
      personId: r.person_id,
      admin: r.admin,
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
