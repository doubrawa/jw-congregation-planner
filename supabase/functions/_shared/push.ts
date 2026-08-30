// =============================================================================
// Geteilt: Web-Push zustellen
// =============================================================================
// Drei Functions schicken Push-Nachrichten, und alle drei trugen dieselbe
// Schleife für sich: bündeln, zustellen, bei 404/410 das Abo wegräumen. Die
// drei Abschriften waren bereits auseinandergelaufen — beim Aufräumen
// (`endpoint` gegen `id`, einmal sogar unkodiert im Pfad) und beim Bündeln:
// `send-plan` bündelte nur **innerhalb** eines Empfängers und lief die
// Empfänger nacheinander durch. Bei gut zwei Dutzend Personen mit je ein bis
// zwei Geräten griff die Bündelung damit nie, und es summierten sich Sekunden,
// für die eine Edge Function kein Zeitbudget hat.
//
// Deshalb liegt sie jetzt einmal hier, und zwar **über alle Empfänger hinweg**:
// Der Aufrufer baut die fertigen Zustellungen, das Bündeln ist Sache dieses
// Moduls.
// =============================================================================

// @ts-expect-error npm-Import wird von der Deno-Edge-Runtime aufgelöst
import webpush from 'npm:web-push@3.6.7'
import type { Rest } from './rest.ts'
import { wert } from './rest.ts'

/**
 * Wie viele Zustellungen gleichzeitig unterwegs sein dürfen.
 *
 * Nicht unbegrenzt: die Push-Dienste drosseln, und ein ganzer Schwung offener
 * Verbindungen brachte der Edge Function nichts als Fehler. Gebündelt zu zehnt
 * bleibt die Laufzeit im Rahmen, ohne dass jemand gedrosselt wird.
 */
const PUSH_PARALLEL = 10

/** Ein Push-Abo, so wie es in `push_subscriptions` steht. */
export interface PushAbo {
  id: string
  endpoint: string
  p256dh: string
  auth: string
}

/** Eine fertige Zustellung: ein Gerät, ein Text. */
export interface Zustellung {
  abo: PushAbo
  titel: string
  body: string
  url: string
}

export interface PushErgebnis {
  gesendet: number
  /** Abo war beim Dienst nicht mehr bekannt (404/410) und wurde abbestellt. */
  abgelaufen: number
  fehlgeschlagen: number
}

/**
 * Abgelaufenes Push-Abo entfernen — das Gegenstück, das `zustellen` braucht.
 *
 * Stand in allen drei Functions als dieselbe Zeile. Der Einreichpunkt war für
 * eine Abweichung gedacht, die es nicht gibt: Alle drei löschen über `id`,
 * und genau an dieser Stelle waren die alten Abschriften auseinander (`id`
 * gegen `endpoint`, einmal unkodiert im Pfad).
 */
export const abbestellerFuer = (rest: Rest) => (id: string): Promise<void> =>
  rest.send('DELETE', `push_subscriptions?id=eq.${wert(id)}`)

/**
 * VAPID-Schlüssel setzen. Gibt zurück, ob überhaupt gesendet werden kann.
 *
 * Ohne Schlüssel läuft alles Übrige weiter — die Glocken-Zeilen entstehen
 * trotzdem. Ein fehlender Schlüssel darf keinen Versand zum Absturz bringen.
 */
export function vapidSetzen(subject: string, publicKey: string, privateKey: string): boolean {
  if (!publicKey || !privateKey) return false
  webpush.setVapidDetails(subject, publicKey, privateKey)
  return true
}

/**
 * Alle Zustellungen gebündelt hinausschicken.
 *
 * `abbestellen` entfernt ein Abo, das der Push-Dienst nicht mehr kennt — die
 * Function reicht dafür ihren eigenen REST-Zugang herein. Ohne das Aufräumen
 * sammelt `push_subscriptions` mit jedem gelöschten Browserprofil eine Leiche
 * mehr, und jeder Lauf versucht sie erneut.
 */
export async function zustellen(
  zustellungen: readonly Zustellung[],
  abbestellen: (id: string) => Promise<void>,
): Promise<PushErgebnis> {
  const erg: PushErgebnis = { gesendet: 0, abgelaufen: 0, fehlgeschlagen: 0 }
  for (let i = 0; i < zustellungen.length; i += PUSH_PARALLEL) {
    const ergebnisse = await Promise.all(
      zustellungen.slice(i, i + PUSH_PARALLEL).map(async ({ abo, titel, body, url }) => {
        try {
          await webpush.sendNotification(
            { endpoint: abo.endpoint, keys: { p256dh: abo.p256dh, auth: abo.auth } },
            JSON.stringify({ title: titel, body, url }),
            { TTL: 24 * 3600 },
          )
          return 'gesendet' as const
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode
          if (status === 404 || status === 410) {
            await abbestellen(abo.id)
            return 'abgelaufen' as const
          }
          console.error(`web-push ${status}: ${(err as Error).message}`)
          return 'fehlgeschlagen' as const
        }
      }),
    )
    for (const e of ergebnisse) erg[e]++
  }
  return erg
}
