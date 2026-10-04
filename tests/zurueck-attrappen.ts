/**
 * **Was jsdom zur Zurück-Taste fehlt** — `CloseWatcher` und
 * `navigator.userActivation`, so weit `useBackDismiss` sie befragt.
 *
 * Seit dem 4.10.2026 legt eine Ebene, die ohne Geste aufgeht, keinen
 * Verlaufseintrag an, sondern einen Wächter: Chromium überspränge den Eintrag
 * mit der Zurück-Taste (siehe „Ohne Geste kein Eintrag" in
 * `src/components/useBackDismiss.ts`). jsdom kennt beides nicht; ohne die
 * Attrappen liefe jeder Test auf dem Weg, den Firefox und Safari gehen.
 *
 * Nachgebaut ist, was im Browser gemessen ist (4.10.2026, Esc als „close
 * request" am Desktop): Ein abgebauter Wächter hört nichts mehr, die Taste
 * bedient die Wächter vor dem Verlauf, und ohne Geste dazwischen bilden sie eine
 * Gruppe — ein Druck schließt alle. Nach Gesten getrennte Gruppen bildet die
 * Attrappe nicht nach; in den Prüfungen hier steht nie mehr als eine.
 *
 * Den Chromium-Schutz selbst (überspringbare Einträge) kennt jsdom auch nicht.
 * Wer prüft, dass ohne Geste **kein** Eintrag entsteht, prüft deshalb den
 * Verlauf, nicht das Springen.
 */

/** Ein `CloseWatcher` der Attrappe. */
export class WaechterAttrappe {
  /** Die aufgestellten Wächter, die weder abgebaut noch geschlossen sind — älteste zuerst. */
  static aufgestellt: WaechterAttrappe[] = []
  onclose: (() => void) | null = null

  constructor() {
    WaechterAttrappe.aufgestellt.push(this)
  }

  destroy(): void {
    WaechterAttrappe.aufgestellt = WaechterAttrappe.aufgestellt.filter((w) => w !== this)
  }

  /** Eine „close request" trifft ihn: Er ist danach weg, dann kommt `close` — wie im Browser. */
  schliessen(): void {
    this.destroy()
    this.onclose?.()
  }
}

/** Was `navigator.userActivation` meldet; `mitGeste` stellt es um. */
export const aktivierung = { isActive: false, hasBeenActive: false }

/** Beide Attrappen einsetzen. `ohneWaechter` spielt einen Browser ohne `CloseWatcher` (Firefox, Safari). */
export function attrappenEinsetzen({ ohneWaechter = false } = {}): void {
  WaechterAttrappe.aufgestellt = []
  aktivierung.isActive = false
  aktivierung.hasBeenActive = false
  Object.defineProperty(navigator, 'userActivation', { configurable: true, get: () => aktivierung })
  if (ohneWaechter) delete (globalThis as { CloseWatcher?: unknown }).CloseWatcher
  else Object.defineProperty(globalThis, 'CloseWatcher', { configurable: true, writable: true, value: WaechterAttrappe })
}

export function attrappenEntfernen(): void {
  delete (navigator as { userActivation?: unknown }).userActivation
  delete (globalThis as { CloseWatcher?: unknown }).CloseWatcher
}

/**
 * `tun` als Geste: `isActive` steht, bis die Effekte und das eigene Aufräumen
 * durch sind — im Browser hält es einige Sekunden.
 */
export async function mitGeste(tun: () => void): Promise<void> {
  aktivierung.isActive = true
  aktivierung.hasBeenActive = true
  try {
    tun()
    for (let i = 0; i < 8; i++) await new Promise<void>((fertig) => setTimeout(fertig, 0))
  } finally {
    aktivierung.isActive = false
  }
}

/**
 * Die Zurück-Taste, wie Chromium sie bedient: Stehen Wächter, schließt sie die
 * (die jüngsten zuerst); sonst geht es einen Schritt im Verlauf zurück — dann
 * erst, wenn dessen `popstate` da ist. Meldet, welcher Weg es war.
 */
export async function zurueckTaste(): Promise<'waechter' | 'verlauf'> {
  const stehen = [...WaechterAttrappe.aufgestellt].reverse()
  if (stehen.length > 0) {
    for (const waechter of stehen) waechter.schliessen()
    return 'waechter'
  }
  await new Promise<void>((fertig) => {
    window.addEventListener('popstate', () => fertig(), { once: true })
    history.back()
  })
  return 'verlauf'
}
