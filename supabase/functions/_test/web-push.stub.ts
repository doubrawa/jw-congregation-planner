/*
 * Test-Ersatz für `npm:web-push` (Deno-Specifier, den Node/Vitest nicht auflösen
 * kann). Eingehängt über `test.alias` in vite.config.ts.
 *
 * Die Tests laufen ohne VAPID-Schlüssel, deshalb kehrt pushTo() in den Functions
 * ohnehin vorzeitig zurück und ruft hier nichts auf. `sent` ist trotzdem da,
 * damit ein Test belegen kann, dass ein abgelehnter Aufruf auch keinen Push
 * ausgelöst hat.
 */

export interface SentPush {
  endpoint: string
  payload: string
}

export const sent: SentPush[] = []

export function reset(): void {
  sent.length = 0
}

const webpush = {
  setVapidDetails(): void {
    /* no-op */
  },
  sendNotification(sub: { endpoint: string }, payload: string): Promise<void> {
    sent.push({ endpoint: sub.endpoint, payload })
    return Promise.resolve()
  },
}

export default webpush
