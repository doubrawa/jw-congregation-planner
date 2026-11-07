/**
 * Predigtdienst: der Grundplan der Treffpunkte, die Gruppenbesuche des
 * Dienstaufsehers und die Trolleys samt ihren Terminen.
 */

import { kurzeZeit } from '../../../supabase/functions/_shared/planung.ts'
import type { FsRule, Gruppenbesuch, Trolley, TrolleyTermin } from '../../data/types'
import { supabase } from '../supabase'
import { fsRuleToRow, gruppenbesuchToRow } from '../zeilen'
import { loeschenDannSchreiben, schreibSchlange } from './schreibweg'

/** Ein Trolley (T121, Phase 7): eine Zeile. */
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
