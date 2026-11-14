/**
 * Zusagen und Ersatz: bestätigen und absagen, Ersatz suchen, einspringen und
 * einen freien Platz übernehmen (Edge Function `substitute`), ein Gesuch
 * ablehnen.
 */

import { isoDay } from '../../data/meeting-dates'
import type { Absage, ConfirmationMap, TaskStatus } from '../../data/types'
import { supabase } from '../supabase'
import { mitverfolgen } from '../schreiben-unterwegs'
import { fehlerAntwort } from '../function-antwort'
import { konfliktMelden, run, schreibfehler, zeilenRun } from './schreibweg'
import { ladungJetzt, standDerFunctionUebernehmen } from './wochen'

export interface ConfirmationRow {
  task_key: string
  status: string
}

/**
 * Bestätigungs-Zeilen zur Karte `task_key → Status`.
 *
 * Ein Platz kann **zwei** Zeilen haben: Sagt A ab und springt B ein, steht unter
 * demselben `task_key` A mit „verhindert" und B mit „bestätigt". Die Abfrage
 * kommt ungeordnet zurück; gewänne, wer zuletzt gelesen wurde, stünde der
 * Platz nach dem Einspringen und Neuladen mal als besetzt, mal als abgesagt
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

export interface AbsageRow {
  person_id: string
  task_key: string
}

export function absageFromRow(r: AbsageRow): Absage {
  return { personId: r.person_id, taskKey: r.task_key }
}

/**
 * Ersatzgesuch: qualifizierte Personen (gleicher Hilfsdienst) benachrichtigen
 * (Sofort-Push + In-App). Läuft serverseitig (Edge Function `substitute`), weil
 * Push nur mit dem privaten VAPID-Schlüssel geht. Fire-and-forget.
 */
/*
 * **Ohne `congregationId`.** Der Server liest die Versammlung selbst; nähme er
 * sie aus dem Rumpf, wäre das ein Angriffsweg. Und ein Feld, das niemand
 * auswertet, bleibt eine offene Fläche — wertet es später jemand aus, ist die
 * Lücke wieder da.
 */
export function substituteSeek(taskKey: string): void {
  if (!supabase) return
  void run(supabase.functions.invoke('substitute', { body: { action: 'seek', taskKey } }))
}

/** Absagen, die nur ein veralteter Stand erklärt: Der Platz ist nicht mehr der eigene oder fällt aus. */
const ABSAGE_VERALTET: ReadonlySet<string> = new Set(['not-assigned', 'slot-not-found', 'meeting-cancelled', 'past'])

/** Die Gründe, aus denen die Function einzelne Plätze abgewiesen hat (`abgewiesen` in ihrer Antwort). */
function abgewieseneGruende(antwort: unknown): (string | undefined)[] {
  const abgewiesen = (antwort as { abgewiesen?: unknown } | null)?.abgewiesen
  return Array.isArray(abgewiesen) ? abgewiesen.map((a) => (a as { error?: string } | null)?.error) : []
}

/**
 * **Absagen denen melden, die planen** (Edge Function `substitute`, Aufruf
 * 'absage'): je Aufgabe eine Zeile in ihrer Glocke und — wo neu zuzuteilen ist
 * — ein Push je Empfänger für alle. Bei einem Gruppentreffpunkt erfahren es
 * auch Aufseher und Gehilfe der Gruppe.
 *
 * Über die Function, nicht über `notify_planners`: Ein Push geht nur mit dem
 * privaten VAPID-Schlüssel hinaus, und wer die Gruppe leitet, weiß die App des
 * Absagenden nicht zuverlässig. `nachricht` ist, was er dem Planer dazuschreibt.
 *
 * Weist die Function ab, weil ein Platz nicht mehr der eigene ist, wird
 * nachgeladen (`konfliktMelder`) — ein „konnte nicht gespeichert werden"
 * erklärte nichts, und die Zusage scheitert dann ohnehin an derselben Lage.
 * Das gilt auch, wenn nur einer von mehreren abgewiesen ist: Die übrigen sind
 * gemeldet, aber der Bildschirm zeigt einen Stand, den es nicht mehr gibt.
 */
export function absageMelden(taskKeys: readonly string[], nachricht: string | undefined): void {
  if (!supabase || taskKeys.length === 0) return
  const heute = isoDay(new Date())
  mitverfolgen(
    supabase.functions
      .invoke('substitute', { body: { action: 'absage', taskKeys, nachricht: nachricht ?? '', heute } })
      .then(async ({ data, error }) => {
        if (error) console.error('[substitute/absage]', error.message)
        // Abgewiesen ist der ganze Aufruf (Fehler) oder ein Teil der Plätze —
        // die Gründe gelten gleich.
        const gruende = error ? [(await fehlerAntwort(error))?.error] : abgewieseneGruende(data)
        if (gruende.some((grund) => grund !== undefined && ABSAGE_VERALTET.has(grund))) konfliktMelden()
        else if (gruende.length > 0) schreibfehler(error ?? { message: `[substitute/absage] abgewiesen: ${gruende.join(', ')}` })
      }),
  )
}

/**
 * Hilfsdienst-Ersatz übernehmen: trägt den Aufrufer serverseitig in den Slot ein,
 * setzt die Bestätigung und informiert Ursprungsperson + Planer. Nötig, weil
 * Wochen/Bestätigungen nur der Planer schreiben darf (RLS). Fire-and-forget —
 * der Client aktualisiert seinen Stand optimistisch.
 *
 * Scheitert es — ein anderer war schneller, das Gesuch ist erledigt, die
 * Zusammenkunft fällt aus —, wird **nachgeladen** (`konfliktMelder`), wie
 * beim Füllen eines freien Platzes. Mit `run()` käme nur ein Schreibfehler,
 * und der Aufrufer stünde trotzdem weiter als eingesprungen da, wo längst ein
 * anderer steht — bis zum nächsten Laden.
 *
 * Ist das Gesuch erledigt, sagt der Hinweis das. Mit dem allgemeinen „konnte
 * nicht gespeichert werden" stünde der Nutzer ratlos da, wenn der Absagende
 * sein Gesuch zurückgezogen hat.
 */
export function substituteTake(taskKey: string): void {
  if (!supabase) return
  const geladen = ladungJetzt()
  // Der Kalendertag des Geräts geht mit, wie beim freien Platz (`platzFuellen`).
  const heute = isoDay(new Date())
  mitverfolgen(
    supabase.functions.invoke('substitute', { body: { action: 'take', taskKey, heute } }).then(async ({ data, error }) => {
      if (!error) {
        standDerFunctionUebernehmen(data, geladen)
        return
      }
      console.error('[substitute/take]', error.message)
      konfliktMelden((await fehlerAntwort(error))?.error === 'not-sought' ? 'nicht-gesucht' : undefined)
    }),
  )
}

/**
 * Einen **offenen Platz selbst übernehmen** — Edge Function
 * `substitute`, Aufruf 'fill'. Serverseitig aus demselben Grund wie das
 * Einspringen: Wochen und Bestätigungen schreibt sonst nur der Planer.
 *
 * Schlägt es fehl — jemand war schneller, der Platz wird nicht mehr angeboten
 * —, wird **nachgeladen** statt nur gemeldet (`konfliktMelder`). Mit `run()`
 * stünde man hier weiter eingetragen, wo längst ein anderer steht. War jemand
 * schneller, sagt der Hinweis das.
 *
 * Der Kalendertag des Geräts geht mit: Der Server kennt nur UTC,
 * und zwischen Mitternacht und 02:00 ließe sich dort noch ein Platz vom Vorabend
 * übernehmen — dieselbe Lage wie bei „Plan senden".
 */
export function platzFuellen(taskKey: string): void {
  if (!supabase) return
  const heute = isoDay(new Date())
  const geladen = ladungJetzt()
  mitverfolgen(
    supabase.functions.invoke('substitute', { body: { action: 'fill', taskKey, heute } }).then(async ({ data, error }) => {
      if (!error) {
        standDerFunctionUebernehmen(data, geladen)
        return
      }
      console.error('[substitute/fill]', error.message)
      konfliktMelden((await fehlerAntwort(error))?.error === 'slot-taken' ? 'vergeben' : undefined)
    }),
  )
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

/** Bestätigung/Verhinderung einer Aufgabe (eigene Zeile je Nutzer+Slot). */
export function saveConfirmation(
  congregationId: string,
  userId: string,
  taskKey: string,
  status: Exclude<TaskStatus, 'offen'>,
): void {
  if (!supabase) return
  // Über `zeilenRun`: Weist die Datenbank ab, weil die Aufgabe inzwischen
  // nicht mehr meine ist (`task_gehoert_mir`, 42501), wird nachgeladen — sonst
  // bliebe lokal „bestätigt" für einen Platz stehen, den längst ein anderer hat.
  void zeilenRun(
    supabase.from('confirmations').upsert(
      { congregation_id: congregationId, user_id: userId, task_key: taskKey, status },
      { onConflict: 'congregation_id,task_key,user_id' },
    ),
  )
}

/**
 * **„Nein, danke" auf ein Ersatzgesuch** am Konto vermerken — das
 * Blatt beim Öffnen legt es danach auf keinem Gerät mehr vor.
 *
 * Steht dieselbe Antwort schon da (ein zweites Fenster hat sie vor dem Laden
 * gegeben), ist nichts zu tun: `ignoreDuplicates`, keine Dublette als Fehler.
 * Weist die Datenbank sonst ab, wird nachgeladen wie bei jeder Zeile
 * (`zeilenRun`).
 */
export function gesuchAblehnen(congregationId: string, userId: string, taskKey: string, abgesagtVon: string): void {
  if (!supabase) return
  void zeilenRun(
    supabase.from('abgelehnte_gesuche').upsert(
      { congregation_id: congregationId, user_id: userId, task_key: taskKey, abgesagt_von: abgesagtVon },
      { onConflict: 'congregation_id,user_id,task_key,abgesagt_von', ignoreDuplicates: true },
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
