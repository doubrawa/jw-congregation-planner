import { useContext, useEffect } from 'react'
import { blattOffen, nachDemSchliessen } from '../components/useBackDismiss'
import { AppStoreContext, useAppDispatch } from './context'
import { letztesLadenBegann, loadAndHydrate } from './hydrate'

/**
 * Frühestens so lange nach dem Beginn des letzten Ladens lädt eine Rückkehr
 * wieder. Am Handy kommen App-Wechsel im Sekundentakt, und jedes Laden holt
 * rund zwei Dutzend Tabellen.
 */
export const NACHLADEN_NACH_MS = 5 * 60_000

/** Felder, in die man nicht tippt — ein Fokus darauf hält nichts auf. */
const OHNE_TIPPEN: ReadonlySet<string> = new Set([
  'button',
  'checkbox',
  'color',
  'file',
  'image',
  'radio',
  'range',
  'reset',
  'submit',
])

/** Steht der Fokus in einem Feld, in das man tippt? Dann wird womöglich gerade getippt. */
function tippt(): boolean {
  const feld = document.activeElement
  if (feld instanceof HTMLInputElement) return !OHNE_TIPPEN.has(feld.type)
  return (
    feld instanceof HTMLTextAreaElement ||
    feld instanceof HTMLSelectElement ||
    (feld instanceof HTMLElement && feld.isContentEditable)
  )
}

/**
 * **Die offene App lädt nach, wenn man zu ihr zurückkehrt.** Sonst lädt sie nur
 * beim Start, nach einem Push-Tipp, beim Öffnen der Mitteilungen, nach „Plan
 * senden" und bei einem Konflikt — wer sie im Hintergrund liegen ließe und über
 * das Symbol zurückkäme, sähe den alten Stand: keine neue Aufgabe, keine neue
 * Zahl an der Glocke.
 *
 * - **Wann:** Die Seite wird wieder sichtbar (am Handy aus einer anderen App,
 *   am Computer zurück in den Tab), oder das Fenster bekommt den Fokus zurück
 *   (am Computer aus einem anderen Programm) — und das letzte Laden begann vor
 *   mindestens `NACHLADEN_NACH_MS`.
 * - **Nach einem Push ohne Frist:** Der Worker meldet jeden
 *   Push den offenen Fenstern (`fensternMelden` in `sw.js`). Kam einer seit dem
 *   Beginn des letzten Ladens, hat sich etwas geändert, und die Frist gilt
 *   nicht — sonst zeigte das Symbol eine Zahl, die „Meine Aufgaben" nicht
 *   kennt. Ist die App beim Push sichtbar, lädt sie gleich; sonst bei der
 *   Rückkehr. Ein Takt ist das nicht: Es lädt nur, wo ohnehin ein Push kam.
 * - **Wie:** still (`loadAndHydrate`): kein Startbild, das Blatt beim Öffnen
 *   kommt nicht noch einmal, eine selbst gewählte Woche bleibt. Scheitert es,
 *   sagt es nichts (`ohneHinweis`) — die nächste Rückkehr versucht es wieder.
 * - **Nicht, solange ein Blatt offen ist oder ein Feld den Fokus hat:** Was
 *   während des Ladens getippt und noch nicht gespeichert ist, verwirft das
 *   Einspielen (`wartendesVerwerfen` in `persist.ts`). Dann holt es nach,
 *   sobald das Blatt zu ist (`nachDemSchliessen`) oder das Feld verlassen.
 * - **Nicht ohne Netz und nicht über dem letzten Stand:** Dort lädt
 *   `store.tsx` selbst, sobald das Netz zurück ist.
 *
 * Auf die Anmelde-Meldung von supabase-js hört es nicht: Die kommt bei jedem
 * Zurückwechseln, und auf sie hin ganz zu laden hieße jedes Mal Startbild und
 * ein neu vorgelegtes Blatt (`store.tsx`, „Geladen wird je Konto einmal").
 */
export function useNachladenBeiRueckkehr(): void {
  const store = useContext(AppStoreContext)
  const dispatch = useAppDispatch()
  useEffect(() => {
    if (!store) return
    /** Eine Rückkehr kam, als ein Blatt offen war oder ein Feld den Fokus hatte. */
    let faellig = false
    /** Wann zuletzt ein Push kam, den der Worker gemeldet hat — 0: keiner. */
    let pushUm = 0
    const versuchen = (): void => {
      const { userId, dataStatus, staleAt } = store.holen()
      const begann = letztesLadenBegann()
      const neuerStand = pushUm > begann || Date.now() - begann >= NACHLADEN_NACH_MS
      if (!userId || dataStatus !== 'ready' || staleAt !== null || navigator.onLine === false || !neuerStand) {
        faellig = false
        return
      }
      if (blattOffen() || tippt()) {
        faellig = true
        return
      }
      faellig = false
      void loadAndHydrate(dispatch, userId, { silent: true, ohneHinweis: true })
    }
    const zurueck = (): void => {
      if (document.visibilityState === 'visible') versuchen()
    }
    // Erst danach steht fest, ob noch ein Blatt offen ist und wo der Fokus hinging.
    const nachholen = (): void => {
      if (faellig) setTimeout(versuchen, 0)
    }
    const nachPush = (e: MessageEvent): void => {
      if ((e.data as { type?: unknown } | null)?.type !== 'push') return
      pushUm = Date.now()
      zurueck()
    }
    const sw = navigator.serviceWorker
    document.addEventListener('visibilitychange', zurueck)
    window.addEventListener('focus', zurueck)
    document.addEventListener('focusout', nachholen)
    sw?.addEventListener('message', nachPush)
    // Ohne das stellt der Browser keine Nachricht des Workers zu (siehe `AppShell`).
    sw?.startMessages?.()
    const abmelden = nachDemSchliessen(nachholen)
    return () => {
      document.removeEventListener('visibilitychange', zurueck)
      window.removeEventListener('focus', zurueck)
      document.removeEventListener('focusout', nachholen)
      sw?.removeEventListener('message', nachPush)
      abmelden()
    }
  }, [store, dispatch])
}
