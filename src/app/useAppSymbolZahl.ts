import { useEffect } from 'react'
import type { MyTask } from '../data/types'
import { useAppSelector } from './context'

/**
 * Wie viele eigene Aufgaben noch auf eine Antwort warten — dieselbe Menge, die
 * „Meine Aufgaben" als offen führt, und dieselbe, die der Server in den Push
 * legt (`_shared/app-zahl.ts`, gehalten von `app-zahl-parity.test.ts`).
 */
export function offeneZusagenZahl(myTasks: readonly MyTask[]): number {
  return myTasks.filter((task) => task.status === 'offen').length
}

/** Das App-Symbol, so weit der Browser es kennt (Badging API). */
type MitSymbol = Navigator & {
  setAppBadge?: (zahl?: number) => Promise<void>
  clearAppBadge?: () => Promise<void>
}

/**
 * **Die Zahl am App-Symbol** (T184, Betreiber: „Zahl am App-Symbol für offene
 * Bestätigungen"): Ist die App offen, setzt sie die Zahl selbst — beim Laden
 * und nach jeder Antwort, denn beides ändert `myTasks`. Ist sie zu, setzt der
 * Service Worker sie aus dem Push (`public/sw.js`).
 *
 * Ohne Anmeldung ist das Symbol leer. Ein Browser ohne diese Möglichkeit
 * übergeht es still; zu sehen ist die Zahl ohnehin nur bei der installierten
 * App.
 */
export function useAppSymbolZahl(): void {
  const zahl = useAppSelector((s) => (s.userId ? offeneZusagenZahl(s.myTasks) : 0))
  useEffect(() => {
    // Eine Zugabe: Was das Symbol auch tut, die App darf daran nicht scheitern.
    // Ein Browser ohne diese Möglichkeit wirft beim Aufruf; dann eben ohne Zahl.
    try {
      const nav = navigator as MitSymbol
      Promise.resolve(zahl > 0 ? nav.setAppBadge!(zahl) : nav.clearAppBadge!()).catch(() => {})
    } catch {
      // nichts zu tun
    }
  }, [zahl])
}
