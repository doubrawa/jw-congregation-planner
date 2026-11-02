// =============================================================================
// Geteilt: Web-Push zustellen
// =============================================================================
// Jede Function, die Push-Nachrichten schickt, stellt hier zu: gebündelt
// **über alle Empfänger hinweg** — der Aufrufer baut die fertigen
// Zustellungen, das Bündeln ist Sache dieses Moduls. Je Empfänger gebündelt
// griffe es bei gut zwei Dutzend Personen mit je ein, zwei Geräten nie, und es
// summierten sich Sekunden, für die eine Edge Function kein Zeitbudget hat.
// Jede Zustellung hat eine Frist, und ein Abo, das der Dienst nicht mehr kennt
// (404/410), wird über seine `id` abbestellt.
// =============================================================================

// `npm:` löst die Deno-Edge-Runtime auf; für den Typprüfer steht der Ausschnitt
// in `supabase/functions/deno.d.ts`.
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

/**
 * Wie lange eine Zustellung dauern darf. Ein Push-Dienst, der die Verbindung
 * annimmt und nicht antwortet, hielte sonst den ganzen Lauf auf, bis die Edge
 * Function an ihrer Zeitgrenze abbricht — und mit ihr alles, was nach dem
 * Zustellen kommt: die Glocken, das Versand-Tagebuch.
 */
export const PUSH_FRIST_MS = 10_000

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
  /**
   * **Womit sich diese Meldung auf dem Sperrbildschirm bündelt** (`tag` im
   * Service Worker).
   *
   * Ohne Angabe bündelt der Worker nach dem Titel: Eine tägliche Erinnerung
   * ersetzt damit die vorige, statt sich siebenmal zu stapeln — genau dafür ist
   * das gedacht. Für Meldungen, die **jede für sich** gelten, ist es aber
   * falsch: Zwei offene Ersatzgesuche tragen beide den Titel „Ersatz gesucht",
   * und das zweite löschte das erste vom Sperrbildschirm. Die Glocke führte
   * beide weiter — nur anstoßen tut der Push.
   *
   * Wer eine solche Sorte schickt, gibt hier etwas an, das die einzelne Sache
   * benennt (der Aufgabenschlüssel).
   */
  tag?: string
}

export interface PushErgebnis {
  gesendet: number
  /** Abo war beim Dienst nicht mehr bekannt (404/410) und wurde abbestellt. */
  abgelaufen: number
  fehlgeschlagen: number
}

/**
 * Abgelaufenes Push-Abo entfernen — das Gegenstück, das `zustellen` braucht.
 * Für alle Functions dieselbe Zeile: gelöscht wird über `id`, kodiert im Pfad.
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
      zustellungen.slice(i, i + PUSH_PARALLEL).map(async ({ abo, titel, body, url, tag }) => {
        try {
          await mitFrist(
            webpush.sendNotification(
              { endpoint: abo.endpoint, keys: { p256dh: abo.p256dh, auth: abo.auth } },
              JSON.stringify({ title: titel, body, url, ...(tag ? { tag } : {}) }),
              { TTL: 24 * 3600 },
            ),
            PUSH_FRIST_MS,
          )
          return 'gesendet' as const
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode
          if (status === 404 || status === 410) {
            // Für sich gefangen: Scheitert das Aufräumen, ist das Abo trotzdem
            // abgelaufen — und die übrigen Zustellungen gehen weiter hinaus.
            try {
              await abbestellen(abo.id)
            } catch (fehler) {
              console.error(`web-push: Abo ${abo.id} nicht abbestellt: ${(fehler as Error).message}`)
            }
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

/** Ein Versprechen mit Frist: Kommt bis `ms` keine Antwort, gilt es als gescheitert. */
function mitFrist<T>(arbeit: Promise<T>, ms: number): Promise<T> {
  let wecker: ReturnType<typeof setTimeout> | undefined
  const frist = new Promise<never>((_, scheitern) => {
    wecker = setTimeout(() => scheitern(new Error(`keine Antwort nach ${ms} ms`)), ms)
  })
  return Promise.race([arbeit, frist]).finally(() => clearTimeout(wecker))
}
