/**
 * Rund um den `task_key`: Woche und Zusammenkunft eines Schlüssels, ob sein
 * Termin vorbei ist, Hilfsdienst-Schlüssel zerlegen, das Versand-Tagebuch und
 * die Zusagen eines gelöschten Punkts. Die Erzeuger selbst stehen in
 * `supabase/functions/_shared/aufgaben-schluessel.ts`.
 */

import { istVorbei, meetingDateMs } from '../meeting-dates'
import { punktStamm, schluesselTeile } from '../../../supabase/functions/_shared/aufgaben-schluessel.ts'
import type { ConfirmationMap, MeetingKey, MeetingTimes, Week } from '../types'

/**
 * Index der Woche mit dieser Kennung — `-1`, wenn sie nicht geladen ist.
 *
 * Das Gegenstück zum Umbau: Wer aus einem Schlüssel wieder eine Woche braucht,
 * schlägt sie hier nach, statt die Zahl als Index zu missbrauchen. Nicht
 * geladen heißt nicht ungültig — die Woche kann außerhalb des Ladefensters
 * liegen (ein Jahr zurück, `aufbewahrung.ts`), und ihr Schlüssel bleibt
 * trotzdem richtig.
 */
export function wochenIndex(weeks: readonly Week[], woche: string): number {
  return woche ? weeks.findIndex((w) => w.start === woche) : -1
}

/**
 * Schlüssel im Versand-Tagebuch: Platz **und** Name.
 *
 * Der Name gehört dazu, weil ein Platz die Person wechseln kann. Teilt der
 * Planer um, ist es ein anderer Schlüssel — die neue Person zählt als noch
 * nicht benachrichtigt und bekommt beim nächsten „Plan senden" ihre Nachricht.
 * Der Name statt der Person-Id, weil auch Plätze ohne `pid` vorkommen
 * (Altdaten, Hilfsdienste als reine Zeichenkette); die Function bildet ihn
 * genauso.
 */
export function sentKey(taskKey: string, name: string): string {
  return `${taskKey} ${name}`
}

/**
 * Woche und Zusammenkunft eines task_key — jeder beginnt mit `<wi>|<tab>|…`,
 * gleich ob Programmpunkt, Ratgeber oder Hilfsdienst. null bei Fremdformaten
 * und bei Plätzen ohne Zusammenkunft (Treffpunkt).
 */
export function taskKeyWeek(key: string): { woche: string; tab: MeetingKey } | null {
  const teile = schluesselTeile(key)
  // Gefragt wird, ob der Schlüssel eine Zusammenkunft trägt — nicht, welche
  // Arten es sonst noch gibt. Seit T120 kamen zwei ohne dazu, und jede neue
  // stünde hier sonst als weitere Ausnahme.
  return teile && 'tab' in teile ? { woche: teile.woche, tab: teile.tab } : null
}

/**
 * Ist der Termin vorbei, auf den sich dieser `task_key` bezieht? (T77)
 *
 * Für Mitteilungen: „Ersatz gesucht", „Erinnerung" und dergleichen beziehen
 * sich auf einen Platz an einem bestimmten Tag — ist der herum, interessieren
 * sie niemanden mehr. Die Mitteilung trägt den Schlüssel ihrer Aufgabe und
 * damit die Antwort.
 *
 * Ohne erkennbaren Schlüssel: **false**. Wer nichts über den Termin weiß, lässt
 * die Zeile stehen — lieber eine zu viel als eine, die noch gebraucht wird.
 *
 * Ein Treffpunkt (`fs|…`) ist vorbei, wenn seine Woche um ist: Seinen Tag
 * kennen nur die Treffpunkt-Wochen, die hier nicht vorliegen. Bis zum
 * 15.10.2026 blieben seine Mitteilungen ganz stehen, bis die Glocke sie nach
 * 30 Tagen abräumte.
 */
export function taskKeyVorbei(
  key: string,
  weeks: Week[],
  zeiten: MeetingTimes,
  heute = new Date(),
): boolean {
  const teile = schluesselTeile(key)
  if (!teile) return false
  if ('tab' in teile) {
    const week = weeks[wochenIndex(weeks, teile.woche)]
    if (week) return istVorbei(meetingDateMs(week, teile.tab, zeiten), heute)
  }
  // Woche nicht geladen (der Ladebereich deckt ein Jahr um heute ab, siehe
  // lib/daten/laden.ts), oder ein Treffpunkt. Auch dann nicht geraten, sondern
  // gerechnet: Der Schlüssel trägt den Montag, und spätestens sechs Tage
  // später ist der Termin gewesen.
  const montag = Date.parse(teile.woche)
  return Number.isNaN(montag) ? false : istVorbei(montag + 6 * 864e5, heute)
}

/** Zerlegt einen Hilfsdienst-task_key; null, wenn es kein Hilfsdienst-Key ist. */
export function helperKeyParts(
  key: string,
): { woche: string; tab: MeetingKey; svc: string; pos: number } | null {
  const teile = schluesselTeile(key)
  return teile?.art === 'helper' ? teile : null
}

/**
 * Bestätigungen eines gelöschten Programmpunkts — alle seine Plätze, beide
 * Räume.
 *
 * **Das ist alles, was Einfügen, Löschen und Verschieben an Bestätigungen noch
 * anfassen.** Hier standen drei Funktionen: Beim Einfügen und Löschen mussten
 * die Schlüssel aller folgenden Punkte umbenannt, beim Verschieben zwei
 * Schlüssel getauscht werden — alles nur, weil die Position im Schlüssel stand
 * (T16). Seit der Punkt seine eigene Kennung trägt, verschiebt sich nichts
 * mehr; verfallen kann nur, was wirklich verschwindet.
 */
export function itemZusagenKeys(
  map: ConfirmationMap,
  woche: string,
  tab: MeetingKey,
  iid: string,
): string[] {
  const praefixe = [punktStamm(woche, tab, iid, false), punktStamm(woche, tab, iid, true)]
  return Object.keys(map).filter((key) => praefixe.some((p) => key.startsWith(p)))
}
