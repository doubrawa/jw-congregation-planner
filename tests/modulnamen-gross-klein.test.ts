import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * **Zwei Module dürfen sich nicht nur in der Groß-/Kleinschreibung unterscheiden.**
 *
 * Gefunden am 21.9.2026: In `src/components/` lagen `Zeitleiste.tsx` (die
 * Komponente) und `zeitleiste.ts` (die gemeinsame Rechnung beider Leisten)
 * nebeneinander. Importiert wird ohne Endung, und der Auflöser probiert `.ts`
 * vor `.tsx`. Unter Linux gibt es `Zeitleiste.ts` nicht, er landet richtig bei
 * der Komponente. Unter Windows und macOS unterscheidet das Dateisystem die
 * Schreibweise nicht: `import { Zeitleiste } from '../components/Zeitleiste'`
 * fand die Rechnung, die Komponente war `undefined`, und der Start-Bildschirm
 * wie das Personen-Detail zeigten nur noch die Fehleransicht. 97 Tests waren
 * rot — aber nur auf dem Rechner des Betreibers. Die CI läuft unter Linux und
 * blieb grün, der Deploy auch.
 *
 * Geprüft wird deshalb der Dateibestand selbst: Kein Ordner darf zwei Module
 * führen, deren Namen ohne Endung nur in der Schreibweise auseinandergehen.
 * Stylesheets zählen nicht — sie werden immer mit Endung eingebunden
 * (`import './datepicker.css'`), da gibt es nichts zu verwechseln.
 */

/** Endungen, die ein Import weglassen darf — nur zwischen ihnen wird gesucht. */
const MODUL_ENDUNG = /\.(tsx?|jsx?|mjs|cjs|mts|cts)$/

/** Die Quellwurzeln, in denen importiert wird. */
const WURZELN = ['src', 'supabase/functions', 'scripts', 'tests']

const REPO = fileURLToPath(new URL('..', import.meta.url))

/** Alle Dateien unter `dir`, mit Pfad relativ zum Repo und `/` als Trenner. */
function dateien(dir: string): string[] {
  const out: string[] = []
  for (const eintrag of readdirSync(dir, { withFileTypes: true })) {
    if (eintrag.name === 'node_modules') continue
    const pfad = join(dir, eintrag.name)
    if (eintrag.isDirectory()) out.push(...dateien(pfad))
    else out.push(relative(REPO, pfad).replaceAll('\\', '/'))
  }
  return out
}

/**
 * Gruppen von Modulen, die ein Import ohne Endung auf einem Dateisystem ohne
 * Groß-/Kleinschreibung nicht auseinanderhalten kann.
 */
function kollisionen(pfade: readonly string[]): string[][] {
  const gruppen = new Map<string, Set<string>>()
  for (const pfad of pfade) {
    if (!MODUL_ENDUNG.test(pfad)) continue
    const ohneEndung = pfad.replace(MODUL_ENDUNG, '')
    const schluessel = ohneEndung.toLowerCase()
    const gruppe = gruppen.get(schluessel) ?? new Set<string>()
    gruppe.add(pfad)
    gruppen.set(schluessel, gruppe)
  }
  return [...gruppen.values()]
    .filter((g) => new Set([...g].map((p) => p.replace(MODUL_ENDUNG, ''))).size > 1)
    .map((g) => [...g].sort())
}

describe('Modulnamen unterscheiden sich nicht nur in der Schreibweise', () => {
  const alle = WURZELN.flatMap((w) => dateien(join(REPO, w)))

  it('kein Ordner führt zwei Module, die nur Groß-/Kleinschreibung trennt', () => {
    expect(kollisionen(alle)).toEqual([])
  })

  it('die Prüfung erkennt den Fall, an dem sie entstanden ist', () => {
    // Ohne diese Gegenprobe wäre eine Prüfung, die gar nichts mehr findet,
    // nicht von „alles sauber" zu unterscheiden.
    expect(
      kollisionen(['src/components/Zeitleiste.tsx', 'src/components/zeitleiste.ts', 'src/components/zeitleiste.css']),
    ).toEqual([['src/components/Zeitleiste.tsx', 'src/components/zeitleiste.ts']])
  })

  it('Komponente und gleichnamiges Stylesheet sind kein Fall — CSS kommt mit Endung', () => {
    expect(kollisionen(['src/components/DatePicker.tsx', 'src/components/datepicker.css'])).toEqual([])
  })

  it('gleicher Name in verschiedenen Ordnern ist kein Fall', () => {
    expect(kollisionen(['src/a/Liste.tsx', 'src/b/liste.ts'])).toEqual([])
  })

  it('ein Test neben seinem Modul ist kein Fall — die Namen unterscheiden sich wirklich', () => {
    expect(kollisionen(['src/data/plaetze.ts', 'src/data/plaetze.test.ts'])).toEqual([])
  })

  it('die Prüfung sieht den ganzen Bestand', () => {
    const module = alle.filter((p) => MODUL_ENDUNG.test(p))
    expect(module.length).toBeGreaterThan(300)
    expect(module).toContain('src/components/Zeitleiste.tsx')
    expect(module).toContain('supabase/functions/_shared/aufgaben-schluessel.ts')
  })
})
