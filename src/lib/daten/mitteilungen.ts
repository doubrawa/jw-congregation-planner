/**
 * Die Glocke und Push: Mitteilungen laden, gelesen setzen und löschen, die
 * Planer benachrichtigen und die Push-Abos dieses Geräts.
 */

import { taskKeyVorbei } from '../../data/planung/schluessel'
import type { MeetingTimes, Notification, NotificationType, Week } from '../../data/types'
import { supabase } from '../supabase'
import { run } from './schreibweg'

export interface NotificationRow {
  id: string
  type: string
  title: string
  body: string
  read: boolean
  created_at: string
  /** Aufgabe, um die es geht; null bei Mitteilungen ohne Aufgabenbezug. */
  task_key?: string | null
}

/** Jede Art genau einmal — über den Typ, damit eine neue Art hier nicht fehlen kann. */
const NOTIF_TYPES: Readonly<Record<NotificationType, true>> = {
  zuteilung: true,
  erinnerung: true,
  gesendet: true,
  import: true,
  verhindert: true,
  anmeldung: true,
}
const asNotifType = (t: string): NotificationType => (Object.hasOwn(NOTIF_TYPES, t) ? (t as NotificationType) : 'gesendet')

/*
 * Hier stand `relativeTime()` und baute aus dem Zeitstempel einen **deutschen
 * Satz** („vor 3 Std."), der als `Notification.time` mitgeführt wurde.
 * Übersetzen ließ er sich danach nur noch über eine feste Liste von
 * Zeichenketten — und die deckte, wie am 13.8.2026 nachgemessen, ausgerechnet
 * die Stundenzahl ab, die zufällig in den Testdaten stand. Jede andere blieb
 * deutsch, in allen 33 Sprachen.
 *
 * Die Zeile trägt jetzt ihren Zeitstempel (`at`), und die Form entsteht beim
 * Anzeigen — `relativeZeit` in i18n/zeit.ts, über `Intl.RelativeTimeFormat`.
 */

function notificationFromRow(r: NotificationRow): Notification {
  return {
    id: r.id,
    type: asNotifType(r.type),
    title: r.title,
    text: r.body,
    at: r.created_at,
    read: r.read,
    ...(r.task_key ? { taskId: r.task_key } : {}),
  }
}

/**
 * Wie viele Glocken-Zeilen ein Ladevorgang mitnimmt. Älteres räumt
 * `send-reminders` serverseitig ab (30 Tage).
 */
const NOTIF_LIMIT = 50

/**
 * Die Glocken-Abfrage — **eine** Fassung für den vollen Ladevorgang und für das
 * Nachladen beim Öffnen der Glocke. Liefe sie auseinander (andere Grenze,
 * andere Sortierung), zeigte die Glocke nach dem Nachladen etwas anderes als
 * nach einem Neustart, und niemand fände den Grund.
 *
 * Auf die eigene `user_id` filtert die Abfrage nicht: Der Feed ist seit
 * Mitteilungen sind personalisiert, und RLS lässt ohnehin nur die eigenen Zeilen
 * durch.
 */
export function notifAbfrage(client: NonNullable<typeof supabase>, congregationId: string) {
  return client
    .from('notifications')
    .select('*')
    .eq('congregation_id', congregationId)
    .order('created_at', { ascending: false })
    .limit(NOTIF_LIMIT)
}

/**
 * Rohzeilen → Glocken-Zeilen.
 *
 * Abgelaufenes fällt heraus (T77): Eine Mitteilung über einen Platz, dessen Tag
 * vorbei ist, interessiert niemanden mehr — „Ersatz gesucht" für letzten
 * Dienstag am wenigsten. Möglich, weil die Zeile weiß, worum es geht; Zeilen
 * ohne Aufgabenbezug tragen keinen Schlüssel und bleiben stehen, sie laufen
 * ohnehin über die Grenze aus.
 */
export function notificationsAus(
  rows: NotificationRow[],
  weeks: Week[],
  zeiten: MeetingTimes,
): Notification[] {
  return rows
    .map(notificationFromRow)
    .filter((n) => !n.taskId || !taskKeyVorbei(n.taskId, weeks, zeiten))
}

/**
 * Nur die Glocken-Zeilen nachladen — der leichte Teil eines Ladevorgangs.
 *
 * Beim Öffnen der Glocke lief bis hierher der **volle** Ladevorgang: dreizehn
 * Abfragen, darunter 52 Wochen als JSONB und das ganze Versand-Tagebuch, um
 * fünfzig Zeilen anzuzeigen. Wer die App als PWA offen liegen hat und
 * gelegentlich nachsieht, lud damit jedes Mal die ganze Versammlung neu.
 *
 * `null` heißt „nicht gelesen" (kein Client, Fehler) — dann bleibt der
 * bisherige Stand stehen, wie bei jedem stillen Nachladen.
 */
export async function loadNotifications(
  congregationId: string,
  weeks: Week[],
  zeiten: MeetingTimes,
): Promise<Notification[] | null> {
  if (!supabase) return null
  const { data, error } = await notifAbfrage(supabase, congregationId)
  if (error) {
    console.error('[notifications]', error.message)
    return null
  }
  return notificationsAus((data ?? []) as NotificationRow[], weeks, zeiten)
}

/**
 * Mitteilung an die Planer der Versammlung (`notify_planners`, security
 * definer): je Planer eine eigene Zeile → eigener Gelesen-/Lösch-Status.
 * Erinnerungen erzeugt die Edge Function selbst; Client-Mitteilungen sind
 * Import, „Plan gesendet" und Verhinderung.
 *
 * Die Empfänger bestimmt die Datenbank, nicht der Client. Ein Verkündiger
 * sieht in `members` nur die eigene Zeile (`members_select`) — wer die Planer
 * aus `state.members` herausfilterte, bekam für jede Verhinderung eine leere
 * Liste und schrieb still nichts (so bis zum 24.9.2026).
 *
 * `taskKey`: die Aufgabe, um die es geht (die Absage, seit dem 4.10.2026) —
 * daran findet ein Tipp in der Glocke ihre Woche. Ohne ihn bleibt der Aufruf
 * genau der alte; so verträgt er auch eine Datenbank, die den vierten
 * Parameter noch nicht kennt.
 */
export function notifyPlanners(type: NotificationType, title: string, body: string, taskKey?: string): void {
  if (!supabase) return
  void run(
    supabase.rpc('notify_planners', {
      kind: type,
      subject: title,
      message: body,
      ...(taskKey ? { task: taskKey } : {}),
    }),
  )
}

/** Eine Glocken-Zeile gelesen — die angetippte (`mitteilungGelesen`). */
export function markNotificationRead(congregationId: string, userId: string, id: string): void {
  if (!supabase) return
  void run(
    supabase
      .from('notifications')
      .update({ read: true })
      .eq('congregation_id', congregationId)
      .eq('user_id', userId)
      .eq('id', id),
  )
}

export function markNotificationsRead(congregationId: string, userId: string): void {
  if (!supabase) return
  void run(
    supabase
      .from('notifications')
      .update({ read: true })
      .eq('congregation_id', congregationId)
      .eq('user_id', userId),
  )
}

/**
 * „Alle löschen" (T140): die eigenen Mitteilungen in dieser Versammlung — auch
 * die, die über die geladenen hinausgehen. Mehr lässt `notifications_delete`
 * ohnehin nicht zu; `user_id` steht trotzdem da, damit die Absicht im Aufruf
 * steht und nicht erst in der Datenbankregel.
 */
export function deleteNotifications(congregationId: string, userId: string): void {
  if (!supabase) return
  void run(
    supabase
      .from('notifications')
      .delete()
      .eq('congregation_id', congregationId)
      .eq('user_id', userId),
  )
}

/**
 * Push-Abo dieses Geräts speichern (Endpoint ist eindeutig → Upsert).
 *
 * `lang` ist die App-Sprache dieses Geräts: der Text einer Push-Nachricht
 * entsteht beim Versand und lässt sich danach nicht mehr übersetzen.
 */
export function savePushSubscription(
  congregationId: string,
  userId: string,
  sub: { endpoint: string; p256dh: string; auth: string },
  lang: string,
): void {
  if (!supabase) return
  void run(
    supabase.from('push_subscriptions').upsert(
      {
        congregation_id: congregationId,
        user_id: userId,
        endpoint: sub.endpoint,
        p256dh: sub.p256dh,
        auth: sub.auth,
        lang,
      },
      { onConflict: 'endpoint' },
    ),
  )
}

/**
 * Sprache eines bestehenden Abos nachziehen. Ohne das bekäme jemand, der die
 * Sprache nach dem Aktivieren wechselt, weiter Erinnerungen in der alten.
 */
export function savePushLanguage(endpoint: string, lang: string): void {
  if (!supabase) return
  void run(supabase.from('push_subscriptions').update({ lang }).eq('endpoint', endpoint))
}

/** Die Zeile eines Abos löschen — mit Antwort, denn das Abmelden wartet darauf (`pushAboLoesen`). */
export async function deletePushSubscription(endpoint: string): Promise<void> {
  if (!supabase) return
  await run(supabase.from('push_subscriptions').delete().eq('endpoint', endpoint))
}

/**
 * Steht dieses Abo als **eigenes** in der Datenbank? Die Zugriffsregel zeigt
 * nur eigene Zeilen (`user_id = auth.uid()`) — ein fremdes Abo desselben
 * Endpoints sieht hier niemand. `null`: Die Frage ging nicht durch.
 */
export async function pushAboEigen(endpoint: string): Promise<boolean | null> {
  if (!supabase) return null
  const { data, error } = await supabase.from('push_subscriptions').select('endpoint').eq('endpoint', endpoint).maybeSingle()
  if (error) return null
  return data !== null
}

/**
 * Ein Abo neu eintragen, **ohne** eine bestehende Zeile anzufassen. `fremd`:
 * Den Endpoint führt schon eine Zeile, die nicht die eigene ist — sie gehört
 * dem, der vorher auf diesem Gerät angemeldet war (`push_subscriptions.endpoint`
 * ist eindeutig).
 */
export async function pushAboEintragen(
  congregationId: string,
  userId: string,
  sub: { endpoint: string; p256dh: string; auth: string },
  lang: string,
): Promise<'eingetragen' | 'fremd' | 'fehler'> {
  if (!supabase) return 'fehler'
  const { error } = await supabase.from('push_subscriptions').insert({
    congregation_id: congregationId,
    user_id: userId,
    endpoint: sub.endpoint,
    p256dh: sub.p256dh,
    auth: sub.auth,
    lang,
  })
  if (!error) return 'eingetragen'
  return error.code === '23505' ? 'fremd' : 'fehler'
}
