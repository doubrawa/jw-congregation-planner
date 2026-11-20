import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { builtinModules } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, posix } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { quelldateien, WURZEL } from './quelldateien'

/**
 * **Jeder `vi.mock`-Pfad trifft eine Datei** (T172).
 *
 * Zeigt `vi.mock` auf einen Pfad, den es nicht gibt, sagt vitest nichts: Die
 * Attrappe wartet auf ein Modul, das niemand lädt, und der Test läuft gegen das
 * echte. Rot wird er nur, wenn er die Attrappe selbst befragt. Eine Fabrik, die
 * etwa den Supabase-Client abschaltet, fällt dagegen still weg, und der Test
 * redet mit dem echten.
 *
 * Anlass war das Aufteilen von `src/data/planning.ts` in die Module unter
 * `src/data/planung/` (T172): Zwei Proben legten eine Fabrik über genau diese
 * Datei. Der Pfad in `vi.mock` ist eine Zeichenkette, kein Import — `tsc` prüft
 * ihn nicht, und ein Umzug, der die Importe umstellt, nimmt ihn nicht mit.
 *
 * Geprüft werden `vi.mock` und `vi.doMock` in `src/`, `tests/` und `scripts/`.
 * Relative Pfade gelten von der Datei aus, die sie nennt, mit den Endungen, die
 * auch ein Import weglassen darf — und **in der Schreibweise des Dateisystems**:
 * Unter Windows fände `../lib/Supabase` die Datei, die CI unter Linux nicht
 * (siehe `modulnamen-gross-klein.test.ts`). Node-Module und Pakete zählen, wenn
 * es sie gibt. Pakete sucht die Probe wie Node im `node_modules` der Wurzel und
 * darüber: Ein Worktree unter `.claude/worktrees/` hat keins und nimmt das des
 * Hauptcheckouts.
 */

/** Endungen, die ein Import weglassen darf. */
const ENDUNGEN = ['.ts', '.tsx', '.mts', '.mjs', '.js', '.jsx', '.json']

/**
 * Ein Aufruf am Zeilenanfang. Kommentare beginnen dort mit `*` oder `//` und
 * zählen so nicht mit; ein Pfad, der nicht als Zeichenkette dasteht, kommt als
 * `null` an und gilt als nicht prüfbar.
 */
const AUFRUF = /^[ \t]*vi\.(?:mock|doMock)\(\s*(?:(['"`])([^'"`\n]*)\1)?/gm

interface Aufruf {
  datei: string
  pfad: string | null
}

function aufrufe(datei: string, text: string): Aufruf[] {
  return [...text.matchAll(AUFRUF)].map((m) => ({ datei, pfad: m[2] ?? null }))
}

/** Verzeichnisinhalte je Ordner (absoluter Pfad) — einmal gelesen je Lauf. */
const inhalte = new Map<string, Set<string>>()
function inhalt(ordner: string): Set<string> {
  let namen = inhalte.get(ordner)
  if (!namen) {
    try {
      namen = new Set(readdirSync(ordner))
    } catch {
      namen = new Set()
    }
    inhalte.set(ordner, namen)
  }
  return namen
}

/** Gibt es diese Datei (relativ zu `basis`, mit `/`) — in genau dieser Schreibweise? */
function istDateiUnter(basis: string, rel: string): boolean {
  if (rel.startsWith('..') || posix.isAbsolute(rel)) return false
  let ordner = basis
  for (const teil of rel.split('/')) {
    if (!inhalt(ordner).has(teil)) return false
    ordner = join(ordner, teil)
  }
  return statSync(ordner).isFile()
}

const istDatei = (rel: string): boolean => istDateiUnter(WURZEL, rel)

/** Liegt das Paket im `node_modules` der Wurzel oder eines Ordners darüber? */
function paketDa(paket: string, wurzel = WURZEL): boolean {
  for (let ordner = wurzel; ; ordner = dirname(ordner)) {
    if (istDateiUnter(ordner, `node_modules/${paket}/package.json`)) return true
    if (dirname(ordner) === ordner) return false
  }
}

/** Löst `pfad` aus `datei` auf, wie vitest es täte? */
function trifft(datei: string, pfad: string): boolean {
  if (pfad.startsWith('.')) {
    const basis = posix.normalize(posix.join(posix.dirname(datei), pfad))
    const kandidaten = [basis, ...ENDUNGEN.map((e) => basis + e), ...ENDUNGEN.map((e) => `${basis}/index${e}`)]
    return kandidaten.some(istDatei)
  }
  if (builtinModules.includes(pfad)) return true
  if (pfad.startsWith('node:')) return builtinModules.includes(pfad.slice('node:'.length))
  const teile = pfad.split('/')
  const paket = pfad.startsWith('@') ? teile.slice(0, 2).join('/') : (teile[0] ?? '')
  return paketDa(paket)
}

describe('Jeder vi.mock-Pfad trifft eine Datei', () => {
  const alle = quelldateien({ orte: ['src', 'tests', 'scripts'], endungen: ['.ts', '.tsx', '.mts', '.mjs', '.js'] }).flatMap(
    (datei) => aufrufe(datei, readFileSync(join(WURZEL, datei), 'utf8')),
  )

  it('kein vi.mock zeigt ins Leere', () => {
    const insLeere = alle
      .filter((a) => a.pfad === null || !trifft(a.datei, a.pfad))
      .map((a) => `${a.datei}: ${a.pfad ?? '(kein fester Pfad)'}`)
    expect(insLeere).toEqual([])
  })

  it('die Probe findet die Aufrufe überhaupt', () => {
    // Stand T172: 147 Aufrufe. Fände das Muster keinen mehr, wäre die Probe
    // darüber grün und blind.
    expect(alle.length).toBeGreaterThan(100)
  })

  it('ein vertippter, verwaister oder falsch geschriebener Pfad fällt auf', () => {
    // Die Aufrufe stehen in Zeichenketten, damit die Probe sie in dieser Datei
    // selbst nicht findet — sie beginnen hier nicht am Zeilenanfang.
    const quelle = [
      "vi.mock('../lib/supabase', () => ({ supabase: null }))",
      "vi.mock('../data/planning', async (orig) => ({ ...(await orig()) }))",
      "vi.mock('../lib/supabse')",
      "vi.mock('../lib/Supabase')",
      "  vi.doMock('./gibt-es-nicht')",
      "vi.mock('node:child_process')",
      "vi.mock('@supabase/supabase-js', () => ({}))",
      "vi.mock('@supabase/supabase-jss')",
      "vi.mock(pfad)",
      " * vi.mock('../im-kommentar')",
      "// vi.mock('../auch-im-kommentar')",
    ].join('\n')
    const gefunden = aufrufe('src/planen/beispiel.test.tsx', quelle)
    expect(gefunden.map((a) => a.pfad)).toEqual([
      '../lib/supabase',
      '../data/planning',
      '../lib/supabse',
      '../lib/Supabase',
      './gibt-es-nicht',
      'node:child_process',
      '@supabase/supabase-js',
      '@supabase/supabase-jss',
      null,
    ])
    const daneben = gefunden.filter((a) => a.pfad !== null && !trifft(a.datei, a.pfad)).map((a) => a.pfad)
    expect(daneben).toEqual(['../data/planning', '../lib/supabse', '../lib/Supabase', './gibt-es-nicht', '@supabase/supabase-jss'])
  })
})

describe('Pakete sucht die Probe wie Node, von der Wurzel aufwärts', () => {
  // Ein nachgebauter Hauptcheckout mit `node_modules`, darin ein Worktree
  // ohne eigenes — so liegt jeder Worktree unter `.claude/worktrees/`. Die
  // Paketnamen gibt es sonst nirgends: Die Suche geht bis zum Laufwerk hinauf,
  // und ein `node_modules` über dem Temp-Ordner darf nicht mitzählen.
  let temp = ''
  let haupt = ''
  let zweig = ''
  beforeAll(() => {
    temp = mkdtempSync(join(tmpdir(), 'vi-mock-pfade-'))
    haupt = join(temp, 'haupt')
    zweig = join(haupt, '.claude', 'worktrees', 'zweig')
    const pakete: [string, string][] = [
      [haupt, 'vi-mock-probe-oben'],
      [haupt, '@vi-mock-probe/bereich'],
      [zweig, 'vi-mock-probe-hier'],
    ]
    for (const [unter, name] of pakete) {
      const ordner = join(unter, 'node_modules', ...name.split('/'))
      mkdirSync(ordner, { recursive: true })
      writeFileSync(join(ordner, 'package.json'), '{}')
    }
  })
  afterAll(() => rmSync(temp, { recursive: true, force: true }))

  it('ein Paket im node_modules darüber zählt: Der Worktree nimmt das des Hauptcheckouts', () => {
    expect(paketDa('vi-mock-probe-oben', zweig)).toBe(true)
    expect(paketDa('@vi-mock-probe/bereich', zweig)).toBe(true)
  })

  it('das node_modules der Wurzel selbst zählt, wie in der CI', () => {
    expect(paketDa('vi-mock-probe-hier', zweig)).toBe(true)
  })

  it('ein fehlendes, falsch geschriebenes oder tiefer liegendes Paket zählt nicht', () => {
    expect(paketDa('vi-mock-probe-fehlt', zweig)).toBe(false)
    // Unter Windows fände das Dateisystem beide, Linux in der CI nicht.
    expect(paketDa('Vi-mock-probe-oben', zweig)).toBe(false)
    expect(paketDa('@vi-mock-probe/Bereich', zweig)).toBe(false)
    // Node sucht nur aufwärts: Was im Worktree liegt, sieht der Hauptcheckout nicht.
    expect(paketDa('vi-mock-probe-hier', haupt)).toBe(false)
  })
})
