/*
 * PWA-Installation: fängt das `beforeinstallprompt`-Event (Chromium: Android,
 * Desktop) ab, damit wir zu einem passenden Zeitpunkt selbst „App installieren"
 * anbieten können, statt auf den Browser-Hinweis zu warten. Auf iOS gibt es das
 * Event nicht — dort führt nur „Teilen → Zum Home-Bildschirm" zum Ziel (siehe
 * pushNeedsInstall in push.ts). Beim Start per Seiteneffekt-Import registriert
 * (main.tsx), damit das Event auch dann ankommt, wenn es vor dem Mounten feuert.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: BeforeInstallPromptEvent | null = null
const listeners = new Set<() => void>()
const notify = (): void => listeners.forEach((l) => l())

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    // Standard-Mini-Infobar unterdrücken; wir bieten die Installation selbst an.
    e.preventDefault()
    deferred = e as BeforeInstallPromptEvent
    notify()
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    notify()
  })
}

/** Kann die App gerade per Klick installiert werden (Chromium)? */
export function installAvailable(): boolean {
  return deferred !== null
}

/** Auf Änderungen der Installierbarkeit reagieren (Abmelde-Funktion zurück). */
export function onInstallChange(cb: () => void): () => void {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

/** Nativen Installations-Dialog zeigen; Rückgabe: vom Nutzer angenommen? */
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false
  await deferred.prompt()
  const { outcome } = await deferred.userChoice
  deferred = null // Event ist verbraucht und lässt sich nicht erneut nutzen
  notify()
  return outcome === 'accepted'
}
