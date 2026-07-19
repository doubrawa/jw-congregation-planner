/*
 * Web-Push: Service-Worker-Registrierung und Abo-Verwaltung (Profil-Schalter).
 * Der Versand läuft serverseitig (supabase/functions/send-reminders) mit dem
 * privaten VAPID-Schlüssel; hier steht nur der öffentliche (unkritisch —
 * er ist ohnehin Teil jedes Push-Abos).
 */

/** Öffentlicher VAPID-Schlüssel (Gegenstück: Secret VAPID_PRIVATE_KEY). */
const VAPID_PUBLIC_KEY =
  'BHj1BeuR9U_8kwijYetMBWS2b91KbqO6Po4mzj3FRdC6nwwsSwob5Tra8_fAq7joqAVhlgU9ooOUdSkPRyMMxpg'

/** Push wird unterstützt (Browser-Features; iOS erst als Home-Bildschirm-App). */
export function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

/** Beim App-Start aufrufen (main.tsx) — registriert den Service Worker. */
export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return
  navigator.serviceWorker
    .register(`${import.meta.env.BASE_URL}sw.js`)
    .catch(() => {})
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

/** Bestehendes Push-Abo dieses Geräts (oder null). */
export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null
  const reg = await navigator.serviceWorker.ready
  return reg.pushManager.getSubscription()
}

/**
 * Fragt die Berechtigung an und erstellt das Push-Abo dieses Geräts.
 * Rückgabe null, wenn der Nutzer die Berechtigung verweigert.
 */
export async function subscribePush(): Promise<PushSubscription | null> {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return null
  const reg = await navigator.serviceWorker.ready
  return reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY).buffer as ArrayBuffer,
  })
}

/** Web-Push-Abo als speicherbare Felder (Tabelle push_subscriptions). */
export function subscriptionFields(
  sub: PushSubscription,
): { endpoint: string; p256dh: string; auth: string } | null {
  const json = sub.toJSON()
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return null
  return { endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth }
}
