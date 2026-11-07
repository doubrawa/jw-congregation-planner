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
import { konfliktMelden, run, zeilenRun } from './schreibweg'
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
 *
 * Ist das Gesuch erledigt, sagt der Hinweis das (1.11.2026). Mit dem
 * allgemeinen „konnte nicht gespeichert werden" stand der Nutzer ratlos da,
 * nachdem der Absagende sein Gesuch zurückgezogen hatte.
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
 * Einen **offenen Platz selbst übernehmen** (4.10.2026) — Edge Function
 * `substitute`, Aufruf 'fill'. Serverseitig aus demselben Grund wie das
 * Einspringen: Wochen und Bestätigungen schreibt sonst nur der Planer.
 *
 * Schlägt es fehl — jemand war schneller, der Platz wird nicht mehr angeboten
 * —, wird **nachgeladen** statt nur gemeldet (`konfliktMelder`). Mit `run()`
 * stünde man hier weiter eingetragen, wo längst ein anderer steht. War jemand
 * schneller, sagt der Hinweis das (1.11.2026).
 *
 * Der Kalendertag des Geräts geht mit (5.10.2026): Der Server kennt nur UTC,
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
 * **„Nein, danke" auf ein Ersatzgesuch** am Konto vermerken (1.11.2026) — das
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
