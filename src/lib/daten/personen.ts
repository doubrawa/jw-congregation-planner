/**
 * Personen, Haushalte und Abwesenheiten schreiben — und welche Spalten von
 * `persons` und `absences` die App lesen darf.
 */

import type { Absence, Person } from '../../data/types'
import { supabase } from '../supabase'
import { personToRow } from '../zeilen'
import { run, zeileSchreiben } from './schreibweg'

/**
 * Die Spalten von `persons` und `absences`, die die App lädt — ebenso
 * **ausdrücklich** (Sicherheits-Review 29.10.2026): Der Grund einer
 * Abwesenheit ist für die Versammlung gesperrt und kommt über
 * `abwesenheit_gruende`, nur zu dem, dem die App ihn zeigt. (Eine Adresse
 * speichert die App seit dem 31.10.2026 nicht mehr.)
 * `spaltenrechte.test.ts` misst beide Listen an den Mappern und am Schema.
 */
export const PERSON_SPALTEN = 'id, fn, ln, planner_vorgemerkt, zuteiler_vorgemerkt, role, female, priv, grp, fam'
export const ABWESENHEIT_SPALTEN = 'id, person_id, user_id, from_date, to_date'

/**
 * Eine Person schreiben — neu ganz, sonst nur, was sich gegenüber `vorher`
 * geändert hat (`zeileSchreiben`).
 *
 * Das Upsert der neuen liest jede Spalte, die es schreibt: PostgREST macht
 * daraus `on conflict (id) do update set x = excluded.x`, und dafür verlangt
 * Postgres das Leserecht an der Spalte — auch beim Admin. `personToRow`
 * schreibt deshalb nur Spalten der Freigabe in `schema.sql`.
 */
export function savePerson(congregationId: string, person: Person, vorher?: Person): void {
  const db = supabase
  if (!db) return
  zeileSchreiben(personToRow(person, congregationId), vorher && personToRow(vorher, congregationId), {
    ganz: (zeile) => db.from('persons').upsert(zeile),
    spalten: (spalten) => db.from('persons').update(spalten).eq('id', person.id),
  })
}

export function deletePersonRow(id: string): void {
  if (!supabase) return
  void run(supabase.from('persons').delete().eq('id', id))
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
 *
 * An den Personen geht nur `fam` hinaus, je Haushalt eine Anfrage. Was sonst
 * an ihnen wartet, schreibt ihr eigener Weg (`savePerson`).
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
      const jeHaushalt = new Map<string | null, string[]>()
      for (const p of personen) jeHaushalt.set(p.fam ?? null, [...(jeHaushalt.get(p.fam ?? null) ?? []), p.id])
      for (const [fam, ids] of jeHaushalt) {
        const { error: fehler } = await client.from('persons').update({ fam }).in('id', ids)
        if (fehler) return { error: fehler }
      }
      return { error: null }
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
