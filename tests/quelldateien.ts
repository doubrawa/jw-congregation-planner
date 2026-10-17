import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * **Die Quelldateien für die Quelltext-Proben** — eine Stelle statt einer
 * Abschrift je Probe. Bis zum 17.10.2026 trug jede ihren eigenen Läufer;
 * mit T124 kam der fünfte gleichartige dazu (Review).
 *
 * Die Pfade stehen relativ zur Wurzel und mit `/` — so erscheinen sie in den
 * Meldungen der Proben, auf jedem Rechner gleich. `node_modules` bleibt draußen.
 */

/** Die Wurzel des Repos; `join(WURZEL, pfad)` liest eine gefundene Datei. */
export const WURZEL = fileURLToPath(new URL('../', import.meta.url))

export interface Auswahl {
  /** Verzeichnisse relativ zur Wurzel, rekursiv durchsucht. */
  orte: readonly string[]
  /** Die Endungen, die zählen (`.ts`, `.tsx`, …). */
  endungen: readonly string[]
  /** Die Prüfstände selbst (`*.test.*`) auslassen. */
  ohneTests?: boolean
}

export function quelldateien({ orte, endungen, ohneTests = false }: Auswahl): string[] {
  const out: string[] = []
  const gehe = (rel: string): void => {
    for (const eintrag of readdirSync(join(WURZEL, rel))) {
      if (eintrag === 'node_modules') continue
      const pfad = `${rel}/${eintrag}`
      if (statSync(join(WURZEL, pfad)).isDirectory()) gehe(pfad)
      else if (endungen.some((e) => eintrag.endsWith(e)) && !(ohneTests && eintrag.includes('.test.'))) out.push(pfad)
    }
  }
  for (const ort of orte) gehe(ort)
  return out
}
