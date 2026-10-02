import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, relative } from 'node:path'

/**
 * **Das CSS der App, wie es im Repo liegt** — für die Quelltext-Proben, die
 * prüfen, was jsdom nicht rechnet (Leserichtung, Schriftstufe).
 *
 * Gelesen wird über `node:fs`: Unter vitest kommt CSS auch mit `?raw` leer an.
 */
const CSS_WURZEL = fileURLToPath(new URL('../src', import.meta.url))

/** Alle `.css` unter `src/` als [Pfad relativ zu `src/`, Inhalt]. */
export function cssDateien(dir = CSS_WURZEL): Array<[string, string]> {
  const out: Array<[string, string]> = []
  for (const eintrag of readdirSync(dir, { withFileTypes: true })) {
    const pfad = join(dir, eintrag.name)
    if (eintrag.isDirectory()) out.push(...cssDateien(pfad))
    else if (eintrag.name.endsWith('.css')) {
      out.push([relative(CSS_WURZEL, pfad).replaceAll('\\', '/'), readFileSync(pfad, 'utf8')])
    }
  }
  return out
}
