/**
 * **Zeilen der Datenbank ↔ App-Objekte** — für die Tabellen, die auch die
 * Wartungsskripte lesen: Personen, Abwesenheiten, Grundplan-Regeln,
 * Gruppenbesuche, vorgemerkte Vorträge.
 *
 * Eine eigene Datei ohne Supabase-Client (5.10.2026): `data.ts` hängt an
 * `supabase.ts` und damit an `import.meta.env` — außerhalb von Vite lädt es
 * nicht. Die Skripte laden diese Umsetzer über `appCodeBereit`
 * (`scripts/gemeinsam.mjs`) und bauen damit dieselben Objekte wie die App,
 * statt sie nachzubauen.
 */

import { ROLE_ORDER } from '../data/constants'
import { normalizePriv } from '../data/namensbindung'
import { kurzeZeit } from '../../supabase/functions/_shared/planung.ts'
import type { Anwesenheit } from '../data/anwesenheit'
import type { Absence, FsRule, Gruppenbesuch, MeetingKey, Person, Qualifications, Role } from '../data/types'
import type { VorgemerkterVortrag } from '../data/vortragsplan'

/* ---- Row-Typen (Spalten aus supabase/schema.sql) ------------------------ */

export interface PersonRow {
  id: string
  fn: string
  ln: string
  planner_vorgemerkt: boolean
  /** Fehlt, solange `schema.sql` vom 4.10.2026 nicht eingespielt ist. */
  zuteiler_vorgemerkt?: boolean
  role: string
  female: boolean
  mail: string
  priv: Qualifications
  grp: string | null
  fam: string | null
}

/**
 * Eine Abwesenheit — von Datum bis Datum, am Wochenindex hängt nichts. Die
 * Skripte lesen sie seit dem 18.10.2026 mit: Der feste Studienleiter kommt nur
 * in eine Woche, in der er da ist (`festenWtLeiterEintragen`).
 */
export interface AbsenceRow {
  id: string
  person_id: string | null
  user_id: string | null // NULL = importiert (kein Konto dahinter)
  from_date: string
  to_date: string
  reason: string
}

/** Eine Grundplan-Regel der Treffpunkte — seit T105 eine Zeile statt JSONB. */
export interface FsRuleRow {
  id: string
  grp: string | null
  wd: number
  time: string
  place: string
  monthly: number
  skip_cong: boolean
  aus: string[] | null
}

/** Ein Gruppenbesuch des Dienstaufsehers (T120) — eine Zeile je Besuch. */
export interface GruppenbesuchRow {
  id: string
  woche: string
  grp: string
  person_id: string | null
}

/** Ein vorgemerkter öffentlicher Vortrag (T122) — eine Zeile je Woche. */
export interface VortragRow {
  id: string
  woche: string
  redner: string
  versammlung: string
  eigener: boolean
  person_id: string | null
  thema: string
  lied: string
}

export const asRole = (r: string): Role => (ROLE_ORDER.includes(r as Role) ? (r as Role) : 'verkuendiger')

/* ---- Mapper Row ↔ App ---------------------------------------------------- */

export function personFromRow(r: PersonRow): Person {
  return {
    id: r.id,
    fn: r.fn,
    ln: r.ln,
    plannerVorgemerkt: r.planner_vorgemerkt || undefined,
    zuteilerVorgemerkt: r.zuteiler_vorgemerkt || undefined,
    role: asRole(r.role),
    female: r.female || undefined,
    mail: r.mail,
    priv: normalizePriv(r.priv),
    grp: r.grp ?? null,
    fam: r.fam ?? null,
  }
}

export function personToRow(p: Person, congregationId: string) {
  return {
    id: p.id,
    congregation_id: congregationId,
    fn: p.fn,
    ln: p.ln,
    planner_vorgemerkt: Boolean(p.plannerVorgemerkt),
    zuteiler_vorgemerkt: Boolean(p.zuteilerVorgemerkt),
    role: p.role,
    female: Boolean(p.female),
    mail: p.mail,
    priv: p.priv,
    grp: p.grp ?? null,
    fam: p.fam ?? null,
  }
}

export function absenceFromRow(r: AbsenceRow): Absence {
  return {
    id: r.id,
    personId: r.person_id,
    userId: r.user_id,
    from: r.from_date,
    to: r.to_date,
    reason: r.reason,
  }
}

/**
 * Eine Grundplan-Regel: `grp` ist in der Datenbank `null` für den
 * Versammlungstreffpunkt, und dieselbe Bedeutung trägt sie in der App — dort
 * stand dafür lange der leere String.
 */
export function fsRuleFromRow(r: FsRuleRow): FsRule {
  return {
    id: r.id,
    grp: r.grp,
    wd: r.wd,
    time: kurzeZeit(r.time, '00:00'),
    place: r.place,
    monthly: r.monthly,
    skipCong: r.skip_cong,
    ...(r.aus?.length ? { aus: r.aus } : {}),
  }
}

export function fsRuleToRow(r: FsRule, congregationId: string) {
  return {
    id: r.id,
    congregation_id: congregationId,
    grp: r.grp,
    wd: r.wd,
    time: r.time,
    place: r.place,
    monthly: r.monthly,
    skip_cong: r.skipCong,
    aus: r.aus ?? [],
  }
}

export function gruppenbesuchFromRow(r: GruppenbesuchRow): Gruppenbesuch {
  return { id: r.id, woche: r.woche, grp: r.grp, pid: r.person_id }
}

export function gruppenbesuchToRow(b: Gruppenbesuch, congregationId: string) {
  return { id: b.id, congregation_id: congregationId, woche: b.woche, grp: b.grp, person_id: b.pid }
}

export function vortragFromRow(r: VortragRow): VorgemerkterVortrag {
  return {
    id: r.id,
    woche: r.woche,
    redner: r.redner,
    versammlung: r.versammlung,
    eigener: r.eigener,
    pid: r.person_id,
    thema: r.thema,
    lied: r.lied,
  }
}

/** Die Anwesenden einer Zusammenkunft (T152) — Spalten wie in `anwesenheit`. */
export interface AnwesenheitRow {
  woche: string
  zusammenkunft: MeetingKey
  saal: number | null
  video: number | null
  person_id: string | null
}

export function anwesenheitFromRow(r: AnwesenheitRow): Anwesenheit {
  return { woche: r.woche, tab: r.zusammenkunft, saal: r.saal, video: r.video, pid: r.person_id }
}

/** Ohne `person_id`: Wer einträgt, setzt die Datenbank (`anwesenheit_vermerken`). */
export function anwesenheitToRow(a: Anwesenheit, congregationId: string) {
  return { congregation_id: congregationId, woche: a.woche, zusammenkunft: a.tab, saal: a.saal, video: a.video }
}

export function vortragToRow(v: VorgemerkterVortrag, congregationId: string) {
  return {
    id: v.id,
    congregation_id: congregationId,
    woche: v.woche,
    redner: v.redner,
    versammlung: v.versammlung,
    eigener: v.eigener,
    person_id: v.pid,
    thema: v.thema,
    lied: v.lied,
  }
}
