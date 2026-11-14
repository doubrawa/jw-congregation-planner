/*
 * Test-Ersatz für `npm:web-push` (Deno-Specifier, den Node/Vitest nicht auflösen
 * kann). Eingehängt über `test.alias` in vite.config.ts.
 *
 * Die Tests laufen meist ohne VAPID-Schlüssel, deshalb kehrt der Versand in den
 * Functions vorzeitig zurück und ruft hier nichts auf. `sent` ist trotzdem da,
 * damit ein Test belegen kann, dass ein abgelehnter Aufruf auch keinen Push
 * ausgelöst hat.
 */

export interface SentPush {
  endpoint: string
  payload: string
}

// Am globalThis verankert: send-reminders wird je Szenario mit anderer Umgebung
// neu importiert (vi.resetModules), wodurch auch dieser Stub neu ausgewertet
// wird. Ohne gemeinsame Ablage hielte der Test ein anderes Array als die
// Function und sähe die Sendungen nie.
const STORE = '__testSentPush'
const g = globalThis as Record<string, unknown>
g[STORE] ??= [] as SentPush[]

export const sent = g[STORE] as SentPush[]

/** Wie der Push-Dienst je Gerät antwortet — ohne Angabe sofort mit Erfolg. */
type Antwort = (endpoint: string) => Promise<void>
const ANTWORT = '__testPushAntwort'

export function reset(): void {
  sent.length = 0
  g[ANTWORT] = null
}

/** Den Push-Dienst anders antworten lassen: gar nicht, mit einem Fehlerstatus. */
export function antwortet(wie: Antwort): void {
  g[ANTWORT] = wie
}

const webpush = {
  setVapidDetails(): void {
    /* no-op */
  },
  sendNotification(sub: { endpoint: string }, payload: string): Promise<void> {
    sent.push({ endpoint: sub.endpoint, payload })
    return (g[ANTWORT] as Antwort | null)?.(sub.endpoint) ?? Promise.resolve()
  },
}

export default webpush
