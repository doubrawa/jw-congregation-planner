import { onTestFinished, vi } from 'vitest'

/**
 * **Ein Spion auf `localStorage`, der in happy-dom wie in jsdom greift.**
 *
 * happy-dom bindet die Methoden des Speichers beim ersten Zugriff an die
 * Instanz. Ein Spion auf `Storage.prototype` sieht danach nichts mehr: Er
 * wirft nicht, er zählt nicht, und die Probe bleibt grün, ohne zu prüfen
 * (31.10.2026: „voller Speicher" schrieb trotzdem, „gar nicht erst gelesen"
 * hätte jedes Lesen übersehen). Dort sitzt der Spion deshalb auf der Instanz —
 * nur räumt vitest ihn da nicht wieder ab, weil sich am Speicher keine
 * Eigenschaft löschen lässt; das übernimmt `onTestFinished`. jsdom dagegen
 * ruft die Methode am Prototyp auf.
 */
export function speicherSpion<M extends 'getItem' | 'setItem'>(methode: M) {
  if (!('happyDOM' in window)) return vi.spyOn(Storage.prototype, methode)
  const vorher = localStorage[methode]
  onTestFinished(() => {
    Object.defineProperty(localStorage, methode, { configurable: true, writable: true, value: vorher })
  })
  return vi.spyOn(localStorage, methode)
}
