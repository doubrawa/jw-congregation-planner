/**
 * Predigtdienst: der Grundplan der Treffpunkte, die Gruppenbesuche des
 * Dienstaufsehers und die Trolleys samt ihren Terminen.
 */

import { kurzeZeit } from '../../../supabase/functions/_shared/planung.ts'
import type { FsRule, Gruppenbesuch, Trolley, TrolleyTermin } from '../../data/types'
import { supabase } from '../supabase'
import { fsRuleToRow, gruppenbesuchToRow } from '../zeilen'
import { loeschenDannSchreiben, schreibSchlange } from './schreibweg'

/** Ein Trolley: eine Zeile. */
export interface TrolleyRow {
  id: string
  name: string
  ort: string
  hinweis: string
}

export function trolleyFromRow(r: TrolleyRow): Trolley {
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

/**
 * Grundplan der Treffpunkte — eine Zeile je Regel.
 *
 * Eine Regel ist eine gewöhnliche Zeile mit einem Verweis auf eine Gruppe. In
 * einem JSONB-Blob je Versammlung könnte dieser Verweis kein Fremdschlüssel
 * sein, und die App müsste beim Löschen einer Gruppe selbst darin aufräumen.
 *
 * **Gelöscht wird, was dieser Planer entfernt hat** (`entfernt`) — nicht alles,
 * was nicht in seiner Liste steht. Der Unterschied zählt, sobald zwei Planer
 * zugleich arbeiten: Mit `delete … where id not in (<meine Regeln>)` räumte
 * jedes Speichern die Regel weg, die der andere gerade angelegt hat — ohne
 * Fehler, ohne Konflikt, auf beiden Bildschirmen unbemerkt. Die Wochen sind
 * gegen genau das durch Vergleiche-und-Tausche geschützt; der Grundplan hat
 * keine solche Sperre, also darf er auch nichts anfassen, wovon er nichts
 * weiß.
 *
 * **Geschrieben wird ebenso nur, was er angelegt oder geändert hat** — mehr
 * übergibt `persist.ts` nicht. Ginge der ganze Grundplan als Upsert hinaus,
 * stellte er zurück, was ein anderer Planer inzwischen geändert oder gelöscht
 * hat. Derselbe Weg gilt für die Weiteren Pläne.
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
 * **Je Tabelle eine Schlange** (`schreibSchlange`) — hier für Grundplan,
 * Besuche und Trolleys; die der Vorträge steht in `wochen.ts`, die der Pläne
 * in `plaene.ts`. Ohne sie ginge jeder Aufruf für sich los: Zwei schnelle
 * Handlungen an derselben Zeile (den Besucher wechseln, dann den Besuch
 * entfernen) liefen nebeneinander, und käme das Schreiben nach dem Löschen
 * an, stünde der Besuch nach dem Neuladen wieder da.
 */
const regelnNacheinander = schreibSchlange()
const besucheNacheinander = schreibSchlange()
const trolleysNacheinander = schreibSchlange()

/**
 * Gruppenbesuche des Dienstaufsehers — eine Zeile je Besuch.
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
 * Trolleys — wie die Gruppenbesuche: geschrieben wird, was der
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
