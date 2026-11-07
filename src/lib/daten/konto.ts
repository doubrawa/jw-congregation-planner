/**
 * Konten und Anmelde-Links (nur Admins, RLS-geschützt): ein Mitglied
 * schreiben oder entfernen, einen Anmelde-Link zurückziehen.
 */

import type { AnmeldeLink, Member } from '../../data/types'
import { supabase } from '../supabase'
import { run, zeileSchreiben } from './schreibweg'

export interface MemberRow {
  user_id: string
  person_id: string | null
  planner: boolean
  zuteiler: boolean
  email: string
}

export interface AnmeldeLinkRow {
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
export const ANMELDE_LINK_SPALTEN = 'person_id, gueltig_bis, erstellt_at, gesendet_at, benutzt_at'

export function anmeldeLinkAusZeile(r: AnmeldeLinkRow): AnmeldeLink {
  return { personId: r.person_id, gueltigBis: r.gueltig_bis, erstelltAt: r.erstellt_at, gesendetAt: r.gesendet_at, benutztAt: r.benutzt_at }
}

/* ---- Mitglieder & Anmelde-Links (nur Admins, RLS-geschützt) -------------- */

/** Ein Konto schreiben — mit `vorher` nur, was sich geändert hat (`zeileSchreiben`). Die Zeile gibt es immer schon. */
export function saveMemberRow(member: Member, vorher?: Member): void {
  const db = supabase
  if (!db) return
  const zeile = (m: Member) => ({ person_id: m.personId, planner: m.planner, zuteiler: m.zuteiler })
  const aendern = (spalten: Partial<ReturnType<typeof zeile>>) => db.from('members').update(spalten).eq('user_id', member.userId)
  zeileSchreiben(zeile(member), vorher && zeile(vorher), { ganz: aendern, spalten: aendern })
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
