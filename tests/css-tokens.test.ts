import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { cssDateien } from './css-quellen'

/**
 * **Jedes Token, das das CSS liest, gibt es auch** (16.10.2026).
 *
 * Ein `var(--x)` ohne Rückfall, das nirgends gesetzt ist, ist ungültig: Die
 * Eigenschaft fällt still auf ihren Ausgangswert zurück. Gefunden im leeren
 * Zuteilen-Blatt — `--text-weak` und `--surface-2` gab es nicht, die Schrift
 * stand in der Farbe des Textes und der Knopf zeigte beim Darüberfahren nichts.
 *
 * Gesetzt ist ein Token, wenn eine CSS-Datei es definiert (`--x:`) oder der
 * Code es setzt (als Zeichenkette `'--x'`, etwa im `style`). Ein `var(--x, …)`
 * mit Rückfall ist immer in Ordnung.
 */

const SRC = fileURLToPath(new URL('../src', import.meta.url))
const ohneKommentare = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '')

/** Der Quelltext aller `.ts`/`.tsx` unter `src/` — dort setzt der Code Tokens. */
function codeQuellen(dir = SRC): string[] {
  const out: string[] = []
  for (const eintrag of readdirSync(dir, { withFileTypes: true })) {
    const pfad = join(dir, eintrag.name)
    if (eintrag.isDirectory()) out.push(...codeQuellen(pfad))
    else if (/\.tsx?$/.test(eintrag.name) && !/\.test\.tsx?$/.test(eintrag.name)) out.push(readFileSync(pfad, 'utf8'))
  }
  return out
}

/** Die Tokens, die irgendwo gesetzt werden. */
function gesetzteTokens(css: ReadonlyArray<[string, string]>, code: readonly string[]): Set<string> {
  const out = new Set<string>()
  for (const [, text] of css) for (const m of ohneKommentare(text).matchAll(/(--[\w-]+)\s*:/g)) out.add(m[1] ?? '')
  for (const text of code) for (const m of text.matchAll(/['"`](--[\w-]+)['"`]/g)) out.add(m[1] ?? '')
  return out
}

/** Gelesene Tokens ohne Rückfall, die nirgends gesetzt sind — als „datei: --x". */
function fehlende(css: ReadonlyArray<[string, string]>, gesetzt: ReadonlySet<string>): string[] {
  const out: string[] = []
  for (const [pfad, text] of css) {
    for (const m of ohneKommentare(text).matchAll(/var\(\s*(--[\w-]+)\s*\)/g)) {
      if (!gesetzt.has(m[1] ?? '')) out.push(`${pfad}: ${m[1]}`)
    }
  }
  return out
}

describe('Gelesene CSS-Tokens sind gesetzt', () => {
  const css = cssDateien()

  it('jedes `var(--x)` ohne Rückfall hat eine Definition', () => {
    expect(fehlende(css, gesetzteTokens(css, codeQuellen()))).toEqual([])
  })

  it('die Prüfung findet ein fehlendes Token auch wirklich — und lässt Rückfall und Code-Token gelten', () => {
    const probe: Array<[string, string]> = [
      ['a.css', ':root { --da: 1px; } .x { color: var(--fehlt); margin: var(--da); padding: var(--rueckfall, 2px); width: var(--vom-code); }'],
    ]
    expect(fehlende(probe, gesetzteTokens(probe, ["el.style.setProperty('--vom-code', '3px')"]))).toEqual(['a.css: --fehlt'])
  })
})
