import { describe, expect, it } from 'vitest'
import { deklarationen } from './css-quellen'

/**
 * **Das Ladebild beim Start blitzt selbst nicht auf** (19.10.2026).
 *
 * Solange offen ist, ob jemand angemeldet ist, zeigt die App das Ladebild statt
 * der Anmeldung (`sitzungPruefen`, `AppShell.tsx`). Meist ist das nach
 * Millisekunden entschieden: Wer nicht angemeldet ist, sah die Anmeldung nach
 * 9 ms (gemessen in Chrome). Stünde das Logo sofort da, blitzte es für diese
 * Millisekunden auf, genau wie vorher die Anmeldung. Deshalb wartet es
 * unsichtbar eine Pause ab und erscheint erst, wenn die Prüfung dauert, weil
 * Supabase das Token übers Netz erneuert.
 *
 * jsdom rechnet kein CSS, und unter vitest kommt es leer an. Gesichert ist
 * hier, dass die Regeln dastehen, die es im Browser richten.
 */

const DATEI = 'app/shell.css'

/** Die `animation` des Ladebilds, in Name, Dauer und Pause zerlegt. */
function animation(): { name: string; zeiten: number[]; wert: string } {
  const wert = /^\s*animation:\s*([^;]+);/m.exec(deklarationen(DATEI, '.ladebild'))?.[1] ?? ''
  const zeiten = [...wert.matchAll(/(\d+(?:\.\d+)?)(ms|s)\b/g)].map(([, zahl, einheit]) => Number(zahl) * (einheit === 's' ? 1000 : 1))
  return { name: wert.trim().split(/\s+/)[0] ?? '', zeiten, wert }
}

describe('Das Ladebild erscheint erst nach einer Pause', () => {
  it('die Pause dauert mindestens 300 ms — kürzer, und es blitzt schon bei schneller Prüfung auf', () => {
    const { zeiten, wert } = animation()
    // In `animation` ist die erste Zeitangabe die Dauer, die zweite die Pause.
    expect(zeiten.length, wert).toBeGreaterThanOrEqual(2)
    expect(zeiten[1], wert).toBeGreaterThanOrEqual(300)
  })

  it('während der Pause ist es unsichtbar: Die Animation gilt schon davor und beginnt bei Deckkraft 0', () => {
    const { name, wert } = animation()
    // Ohne `backwards` oder `both` stünde das Logo während der Pause voll da.
    expect(wert).toMatch(/\b(both|backwards)\b/)
    expect(deklarationen(DATEI, 'from', `@keyframes ${name} {`)).toMatch(/opacity:\s*0;/)
  })
})
