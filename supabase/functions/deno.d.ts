/*
 * Was die Edge-Laufzeit mitbringt — so viel davon, wie dieser Code benutzt.
 *
 * Die fünf Functions laufen unter Deno, nicht unter Node und nicht im Browser.
 * Der Typprüfer kennt weder das globale `Deno` noch den Modul-Spezifizierer
 * `npm:` — und genau daran ist die Prüfung bisher gescheitert: Die 2149 Zeilen
 * der vier Einstiegspunkte standen in **keinem** tsc-Projekt. Gemessen am
 * 5.9.2026: Ein `const x: number = 'keine Zahl'` in `send-plan/index.ts` kam
 * durch `tsc`, durch `oxlint` und durch alle 4924 Tests.
 *
 * Ausgerechnet dort ist das teuer. Diese Funktionen verschicken jede
 * Benachrichtigung und holen jede Woche von jw.org; sie laufen im Cron oder
 * fire-and-forget, und ein Fehler darin meldet sich nirgends — er zeigt sich
 * daran, dass etwas **nicht** passiert.
 *
 * **Bewusst nur der benutzte Ausschnitt.** Ein vollständiges `deno.d.ts` wäre
 * eine zweite Wahrheit, die niemand pflegt. Was hier fehlt, fällt beim nächsten
 * Gebrauch sofort auf — und dann steht die Frage an, ob es wirklich in eine
 * Edge Function gehört (siehe den Kopf von `_shared/planung.ts`: dieses
 * Verzeichnis soll klein bleiben).
 */

declare namespace Deno {
  /** Secrets und Umgebung — hier ausschließlich lesend. */
  const env: {
    get(key: string): string | undefined
  }

  /** Der Einstiegspunkt jeder Function. */
  function serve(handler: (req: Request) => Response | Promise<Response>): void
}

/**
 * Web-Push, von der Edge-Laufzeit aus npm aufgelöst.
 *
 * Nur die zwei Aufrufe, die `_shared/push.ts` macht. `sendNotification` wirft
 * bei abgelaufenen Abos einen Fehler mit `statusCode` — dass der Typ ihn nicht
 * beschreibt, ist richtig so: Es ist ein `unknown` aus einem `catch`, und der
 * Aufrufer sieht dort selbst nach.
 */
declare module 'npm:web-push@3.6.7' {
  interface WebPushSubscription {
    endpoint: string
    keys: { p256dh: string; auth: string }
  }
  interface WebPushOptions {
    TTL?: number
  }
  const webpush: {
    setVapidDetails(subject: string, publicKey: string, privateKey: string): void
    sendNotification(
      subscription: WebPushSubscription,
      payload: string,
      options?: WebPushOptions,
    ): Promise<unknown>
  }
  export default webpush
}
