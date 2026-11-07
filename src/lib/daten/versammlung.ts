/**
 * Die Versammlung selbst: Stammdaten und Einstellungen, Dienste und
 * Predigtdienstgruppen — ihre Zeilen, Umformer und Schreiber.
 */

import type { Congregation, Group, Reminders, Service } from '../../data/types'
import { supabase } from '../supabase'
import { run, zeileSchreiben, type Zeilenstand } from './schreibweg'

/* ---- Row-Typen (Spalten aus supabase/schema.sql) ------------------------ */
// Zeilen, die auch die Wartungsskripte lesen, stehen in `zeilen.ts` — dort
// hängt nichts am Client.

export interface ServiceRow {
  key: string
  name: string
  count: number
  groups: boolean
  position: number
}

export interface GroupRow {
  id: string
  name: string
  overseer_id: string | null
  assistant_id: string | null
  position: number
  ohne_reinigung: boolean
}

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
export const CONG_SPALTEN = [
  'name', 'hall',
  'mid_wd', 'mid_time', 'we_wd', 'we_time',
  'reminder_first', 'reminder_last', 'reminder_repeat',
  'cong_lang', 'prog_langs', 'aux_class',
] as const satisfies ReadonlyArray<keyof CongregationRow>

/**
 * Stammdaten und Einstellungen der Versammlung — je eine Spalte, kein
 * `settings`-Beutel und kein Anzeigetext (siehe schema.sql).
 */
export interface CongregationRow {
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

/* ---- Mapper Row ↔ App ---------------------------------------------------- */

export function groupFromRow(r: GroupRow): Group {
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

export function serviceFromRow(r: ServiceRow): Service {
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

/** Einen Dienst schreiben — neu ganz, sonst nur, was sich gegenüber `vorher` geändert hat (`zeileSchreiben`). */
export function saveService(congregationId: string, service: Service, position: number, vorher?: Zeilenstand<Service>): void {
  const db = supabase
  if (!db) return
  zeileSchreiben(serviceToRow(service, congregationId, position), vorher && serviceToRow(vorher.eintrag, congregationId, vorher.position), {
    ganz: (zeile) => db.from('services').upsert(zeile, { onConflict: 'congregation_id,key' }),
    spalten: (spalten) => db.from('services').update(spalten).eq('congregation_id', congregationId).eq('key', service.key),
  })
}

export function deleteServiceRow(congregationId: string, key: string): void {
  if (!supabase) return
  void run(supabase.from('services').delete().eq('congregation_id', congregationId).eq('key', key))
}

/**
 * Eine Predigtdienstgruppe speichern — **mit ihrer Position**.
 *
 * Geladen werden die Gruppen `.order('position')` (`loadCongregationData` in
 * laden.ts). Bei einer festen `0` wäre die Reihenfolge das, was die Datenbank
 * gerade zurückgibt: die Ablage im Heap. Ein `update` schreibt eine neue
 * Version der Zeile, meist ans Ende — wer den Aufseher von „Gruppe 2" ändert,
 * sähe sie danach hinter „Gruppe 4" stehen.
 *
 * Es bleibt nicht bei der Liste: Die **Reinigung rotiert über die Gruppen**
 * (`waehler` in data/planung/waehler.ts). Springt eine Gruppe in der
 * Reihenfolge, rotiert die Zuteilung ab da anders herum, als der Planer sie
 * kennt — für dieselbe Woche käme beim nächsten Lauf eine andere Gruppe heraus.
 *
 * `position` ist der Index in `state.groups`, genau wie bei den Diensten
 * (`saveService`): Die Liste steht in Ladereihenfolge, und neue Gruppen hängen
 * sich hinten an.
 *
 * Neu geht die ganze Zeile hinaus, sonst nur, was sich gegenüber `vorher`
 * geändert hat (`zeileSchreiben`).
 */
export function saveGroupRow(congregationId: string, group: Group, position: number, vorher?: Zeilenstand<Group>): void {
  const db = supabase
  if (!db) return
  zeileSchreiben(groupToRow(group, congregationId, position), vorher && groupToRow(vorher.eintrag, congregationId, vorher.position), {
    ganz: (zeile) => db.from('groups').upsert(zeile),
    spalten: (spalten) => db.from('groups').update(spalten).eq('id', group.id),
  })
}

export function deleteGroupRow(id: string): void {
  if (!supabase) return
  void run(supabase.from('groups').delete().eq('id', id))
}

/**
 * Stammdaten der Versammlung — **nur, was sich geändert hat**.
 *
 * Gingen Name, Saal und alle vier Zeit-Spalten bei jeder Änderung hinaus,
 * überschrieben sich zwei Admins, die zugleich Verschiedenes einstellen, still:
 * Wer den Saal umbenennt, schriebe mit seinem älteren Stand die
 * Zusammenkunftszeit zurück, die der andere eben geändert hat. Die Zeiten
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
 * Stammdaten: Wer die Erinnerung verstellt, schriebe sonst die Zusätzliche
 * Klasse eines zweiten Admins mit seinem älteren Stand zurück.
 *
 * Es sind Spalten mit Typ und Grenzen, kein JSONB-Objekt in einer Spalte — so
 * stehen die Zusagen „1..21 Tage" und „0..7 Tage" nicht nur im Eingabefeld.
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
