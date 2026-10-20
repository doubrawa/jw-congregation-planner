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

/** Eine Stilregel aus `cssRegeln`. */
export interface CssRegel {
  /** Die Selektoren, an den Kommas außerhalb von Klammern geteilt (`:is(.a, .b)` bleibt ganz). */
  selektoren: string[]
  /** Eigenschaft und Wert je Deklaration, in der Reihenfolge der Regel. */
  deklarationen: Array<readonly [string, string]>
  /** Die `@container`-, `@media`- und `@supports`-Abfragen darum — leer, wenn die Regel immer gilt. */
  abfragen: string
  /** Die Zeile, in der der Rumpf beginnt. */
  zeile: number
}

/** Eine Selektorliste an den Kommas, die nicht in Klammern stehen. */
function selektorenVon(liste: string): string[] {
  const out: string[] = []
  let tiefe = 0
  let stueck = ''
  for (const zeichen of liste) {
    if (zeichen === '(') tiefe++
    if (zeichen === ')') tiefe--
    if (zeichen === ',' && tiefe === 0) {
      out.push(stueck.trim())
      stueck = ''
    } else stueck += zeichen
  }
  return stueck.trim() ? [...out, stueck.trim()] : out
}

/**
 * **Die Stilregeln eines Stylesheets**, jede mit den Abfragen, in denen sie
 * steht. Kommentare und Zeichenketten zählen nicht mit — eine Daten-URI trägt
 * `;` und `:` —, die Zeilennummern stimmen trotzdem: Beide werden nur
 * ausgeblendet, nicht gekürzt.
 */
export function cssRegeln(css: string): CssRegel[] {
  const leer = (stueck: string) => stueck.replace(/[^\n]/g, ' ')
  const text = css
    .replace(/\/\*[\s\S]*?\*\//g, leer)
    .replace(/"[^"\n]*"|'[^'\n]*'/g, (s) => `${s[0]}${leer(s.slice(1, -1))}${s[0]}`)
  const out: CssRegel[] = []
  const offen: Array<{ kopf: string; ab: number }> = []
  let start = 0
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') {
      offen.push({ kopf: text.slice(start, i).trim(), ab: i + 1 })
      start = i + 1
    } else if (text[i] === '}') {
      const block = offen.pop()
      const rumpf = block ? text.slice(block.ab, i) : ''
      if (block && !block.kopf.startsWith('@') && !rumpf.includes('{')) {
        out.push({
          selektoren: selektorenVon(block.kopf),
          deklarationen: rumpf
            .split(';')
            .map((d) => [d.slice(0, d.indexOf(':')).trim(), d.slice(d.indexOf(':') + 1).trim()] as const)
            .filter(([eigenschaft]) => /^-?-?[a-z][-a-z0-9]*$/.test(eigenschaft)),
          abfragen: offen
            .map((b) => b.kopf)
            .filter((k) => /^@(container|media|supports)\b/.test(k))
            .join(' '),
          zeile: text.slice(0, block.ab).split('\n').length,
        })
      }
      start = i + 1
    } else if (text[i] === ';' && offen.length === 0) start = i + 1
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
