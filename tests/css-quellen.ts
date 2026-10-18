import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, relative } from 'node:path'
import { expect } from 'vitest'

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

/** Einmal gelesen, für alle Proben einer Datei. */
let cssJePfad: Record<string, string> | undefined

/**
 * **Die Deklarationen der ersten Regel mit genau diesem Selektor** in `datei`
 * (Pfad relativ zu `src/`) — mit `nach` erst ab dieser Stelle der Datei, etwa
 * einem `@media`-, `@container`- oder `@supports`-Block. Fehlt die Stelle oder
 * die Regel, wird die Probe rot, statt still gegen nichts zu prüfen.
 *
 * Für die Proben, die Regeln für ein Layout festhalten, das jsdom nicht rechnet
 * (`schmale-spalte`, `bereich-leiste`, `planen-leiste`). Bis zum 18.10.2026
 * stand die Funktion in jeder davon als eigene Abschrift.
 */
export function deklarationen(datei: string, selektor: string, nach = ''): string {
  cssJePfad ??= Object.fromEntries(cssDateien())
  const text = cssJePfad[datei] ?? ''
  const ab = text.indexOf(nach)
  expect(ab, `„${nach}" in ${datei}`).toBeGreaterThanOrEqual(0)
  const zeilen = text.slice(ab).split('\n')
  const kopf = zeilen.findIndex((z) => z.trim() === `${selektor} {`)
  expect(kopf, `${selektor} in ${datei}`).toBeGreaterThanOrEqual(0)
  const rumpf = zeilen.slice(kopf + 1)
  return rumpf.slice(0, rumpf.findIndex((z) => z.trim() === '}')).join('\n')
}
