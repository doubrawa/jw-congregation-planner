/**
 * **Das Push-Abo dieses Geräts und das Konto, dem es gehört** (16.10.2026).
 *
 * Ein Browser hat höchstens ein Abo, und die Datenbank führt es unter genau
 * einem Konto: `push_subscriptions.endpoint` ist eindeutig, die Zeile gehört
 * ihrem `user_id` (RLS). Wechselt auf dem Gerät das Konto, muss das Abo
 * mitwechseln. Bis dahin blieb es liegen: Die Mitteilungen des Vorgängers
 * gingen weiter an dieses Gerät, und der Neue sah „Push an", bekam aber
 * nichts — die fremde Zeile darf er weder ändern noch übernehmen.
 */

import { deletePushSubscription, pushAboEigen, pushAboEintragen } from './data'
import { subscriptionFields, vorhandenesAbo } from './push'

/** Beim Abmelden: die eigene Zeile löschen, dann das Abo im Browser beenden. */
export async function pushAboLoesen(): Promise<void> {
  const abo = await vorhandenesAbo()
  if (!abo) return
  await deletePushSubscription(abo.endpoint)
  await abo.unsubscribe()
}

/**
 * **Nach dem Anmelden: Ist das Abo dieses Geräts das eigene?**
 *
 *  - Ja: nichts zu tun.
 *  - Es fehlt in der Datenbank (etwa nach einem Neuaufbau der Versammlung):
 *    wieder eintragen — auf dem Gerät war Push ja an.
 *  - Ein anderes Konto führt es: das Abo im Browser beenden. Der Schalter
 *    zeigt dann „aus", und ein neues Abo bekommt einen neuen Endpoint. Die
 *    alte Zeile räumt der Versand ab, sobald der Dienst den Endpoint nicht mehr
 *    kennt (404/410, `_shared/push.ts`).
 *
 * Geht eine Frage nicht durch (Netz), bleibt alles, wie es ist — beim
 * nächsten Anmelden wird wieder gefragt.
 */
export async function pushAboAbgleichen(congregationId: string, userId: string, lang: string): Promise<void> {
  try {
    const abo = await vorhandenesAbo()
    const felder = abo && subscriptionFields(abo)
    if (!abo || !felder) return
    if ((await pushAboEigen(felder.endpoint)) !== false) return
    if ((await pushAboEintragen(congregationId, userId, felder, lang)) === 'fremd') await abo.unsubscribe()
  } catch (err) {
    console.error('[push] Abo abgleichen', err)
  }
}
