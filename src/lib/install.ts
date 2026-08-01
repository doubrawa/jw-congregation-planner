/*
 * PWA-Installation: fängt das `beforeinstallprompt`-Event (Chromium: Android,
 * Desktop) ab, damit wir zu einem passenden Zeitpunkt selbst „App installieren"
 * anbieten können, statt auf den Browser-Hinweis zu warten. Auf iOS gibt es das
 * Event nicht — dort führt nur „Teilen → Zum Home-Bildschirm" zum Ziel (siehe
 * pushNeedsInstall in push.ts). Beim Start per Seiteneffekt-Import registriert
 * (main.tsx), damit das Event auch dann ankommt, wenn es vor dem Mounten feuert.
 */

import { isStandalone } from './push'

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

/**
 * Ist die App auf diesem Gerät bereits installiert? Zwei Fälle:
 *
 *  1. Wir laufen selbst als installierte App (Standalone) — sofort erkennbar.
 *  2. Wir laufen im Browser-Tab, die App ist aber installiert. Das weiß nur der
 *     Browser; `getInstalledRelatedApps()` (Chromium) verrät es, wenn sich das
 *     Manifest unter `related_applications` selbst aufführt.
 *
 * Wichtig: Installation gilt pro Gerät UND Browserprofil. Auf dem Handy
 * installiert heißt nicht auf dem Desktop installiert — dort ist das Angebot
 * dann zu Recht sichtbar.
 */
export async function appInstalled(): Promise<boolean> {
  if (isStandalone()) return true
  const nav = navigator as { getInstalledRelatedApps?: () => Promise<unknown[]> }
  if (typeof nav.getInstalledRelatedApps !== 'function') return false
  try {
    return (await nav.getInstalledRelatedApps()).length > 0
  } catch {
    return false // ältere/abweichende Browser: lieber anbieten als fälschlich verstecken
  }
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
