import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { istSyntaxfehler, tscBefund } from './check-index-access.mjs'

/**
 * **Die Sperrklinke misst — oder sie sagt, dass sie es nicht kann.**
 *
 * Am 26. September 2026 meldete `npm run typecheck:index` in einem Worktree
 * für alle 32 Dateien „Aufgeräumt — bitte die Grundlinie nachziehen", jede
 * „N → 0", und empfahl `--update`. Gemessen hatte es nichts: tsc lag nicht
 * unter dem festen Pfad `<wurzel>/node_modules/typescript/bin/tsc`, Node
 * endete an „Cannot find module", und das Skript sah nur nach, ob der Prozess
 * **startete**. Null gezählte Meldungen galten als aufgeräumt; ein `--update`
 * darauf hätte die Grundlinie geleert.
 *
 * Am selben Tag kam dieselbe falsche Meldung auf einem zweiten Weg heraus: Ein
 * Syntaxfehler in einer einzigen Datei lässt tsc die Typprüfung im ganzen
 * Projekt auslassen. tsc lief also, zählbare Meldungen gab es auch — nur eben
 * die falschen.
 *
 * Nachgestellt, ohne tsc zu starten: `tscBefund` bekommt, was `spawnSync`
 * zurückgibt. Wo es geht, in gemessenen Formen (26.9.2026, TypeScript 6.0):
 * Meldungen enden mit 2, eine fehlende tsconfig mit 1 und `error TS5058` ohne
 * Datei, Node ohne tsc mit 1 und leerem stdout.
 *
 * Wo tsc liegt, sucht `werkzeugPfad` aus `gemeinsam.mjs`, das auch der
 * Mutationsprobe ihr vitest findet; geprüft in `werkzeug-pfad.test.ts`.
 */

/** So kam es im Worktree zurück — Pfad neutralisiert, Aufrufkette gekürzt. */
const OHNE_TSC = {
  status: 1,
  signal: null,
  stdout: '',
  stderr: [
    'node:internal/modules/cjs/loader:1479',
    '  throw err;',
    '  ^',
    '',
    "Error: Cannot find module 'C:\\repo\\.claude\\worktrees\\x\\node_modules\\typescript\\bin\\tsc'",
    '    at Module._resolveFilename (node:internal/modules/cjs/loader:1476:15)',
    "  code: 'MODULE_NOT_FOUND',",
    '',
  ].join('\r\n'),
}

const lauf = (status: number | null, stdout = '', stderr = '') => ({ status, signal: null, stdout, stderr })

describe('tscBefund: Zahlen nur von einem tsc, das geprüft hat', () => {
  it('Node findet tsc nicht — kein Befund statt 32 Nullen', () => {
    const befund = tscBefund(OHNE_TSC)
    expect(befund.je).toBeUndefined()
    expect(befund.fehler).toContain("Cannot find module 'C:\\repo\\")
  })

  it('stirbt tsc wortlos, gibt es ebenso keinen', () => {
    const befund = tscBefund(lauf(1))
    expect(befund.je).toBeUndefined()
    expect(befund.fehler).toContain('(keine Ausgabe)')
  })

  it('eine Meldung ohne Datei heißt: tsc kam nicht zum Prüfen', () => {
    // Gemessen mit `-p gibtsnicht.json`. Die Zeile trägt keinen Dateinamen und
    // zählt deshalb nicht — ohne diese Regel wären es wieder 32 Nullen.
    const befund = tscBefund(lauf(1, "error TS5058: The specified path does not exist: 'tsconfig.index.json'.\r\n"))
    expect(befund.je).toBeUndefined()
    expect(befund.fehler).toContain('error TS5058')
  })

  it('abgebrochen oder gar nicht gestartet: kein Befund', () => {
    expect(tscBefund({ ...lauf(null), signal: 'SIGTERM' }).fehler).toContain('SIGTERM')
    expect(tscBefund({ ...lauf(null), error: new Error('spawnSync node ENOENT') }).fehler).toContain('ENOENT')
  })

  it('zählt je Datei, wenn tsc geprüft hat — Folgezeilen nicht mit', () => {
    const ausgabe = [
      "src/app/reducer.test.ts(94,19): error TS2345: Argument of type 'ProgramItem | undefined' is not assignable to parameter of type 'ProgramItem'.",
      "  Type 'undefined' is not assignable to type 'ProgramItem'.",
      "src/app/reducer.test.ts(426,31): error TS2345: Argument of type 'Week | undefined' is not assignable to parameter of type 'Week'.",
      "src/app/persist.test.ts(498,95): error TS18048: 'p' is possibly 'undefined'.",
      '',
    ].join('\r\n')
    expect(tscBefund(lauf(2, ausgabe))).toEqual({
      je: { 'src/app/reducer.test.ts': 2, 'src/app/persist.test.ts': 1 },
    })
  })

  it('ein „Cannot find module" von tsc selbst ist ein Befund, kein Absturz', () => {
    // TS2307 steht auf stdout. Nur was Node nach stderr schreibt, heißt, dass
    // tsc nicht lief — sonst bräche die Sperrklinke an einem fehlenden Import
    // ab, statt ihn zu zählen.
    const ausgabe = "src/x.test.ts(1,19): error TS2307: Cannot find module './weg' or its corresponding type declarations.\r\n"
    expect(tscBefund(lauf(2, ausgabe))).toEqual({ je: { 'src/x.test.ts': 1 } })
  })

  it('ein sauberer Lauf bleibt zulässig: Rückgabewert 0, keine Meldung', () => {
    // Das Ziel der Sperrklinke. Eine Wache, die jede leere Zählung verwürfe,
    // ließe die letzte aufgeräumte Datei nie aus der Grundlinie.
    expect(tscBefund(lauf(0))).toEqual({ je: {} })
  })

  it('ein Syntaxfehler irgendwo: keine Zahlen, obwohl Meldungen zu Dateien dastehen', () => {
    // Gemessen mit `const = 1`. Die Typmeldungen **aller** Dateien fehlen dann —
    // gezählt würden nur diese zwei, und die Sperrklinke meldete den Rest als
    // aufgeräumt. Die Regel darüber greift hier nicht: Es gibt ja Meldungen.
    const ausgabe = [
      'src/app/x.test.ts(1,7): error TS1134: Variable declaration expected.',
      'src/app/x.test.ts(1,9): error TS1134: Variable declaration expected.',
      '',
    ].join('\r\n')
    const befund = tscBefund(lauf(2, ausgabe))
    expect(befund.je).toBeUndefined()
    expect(befund.fehler).toContain('src/app/x.test.ts(1,7): error TS1134')
  })

  it.each([
    ['ein nicht geschlossener JSX-Tag', "src/x.tsx(1,30): error TS17008: JSX element 'span' has no corresponding closing tag."],
    ['zwei JSX-Wurzeln nebeneinander', 'src/x.tsx(1,25): error TS2657: JSX expressions must have one parent element.'],
  ])('%s kommt ohne einen 1000er daneben — und zählt trotzdem als Syntaxfehler', (_, zeile) => {
    // Beide gemessen: tsc meldet jeweils nur diese eine Zeile. Eine Wache, die
    // nur auf TS1xxx sähe, ließe sie durch.
    expect(tscBefund(lauf(2, `${zeile}\r\n`)).je).toBeUndefined()
  })
})

/**
 * **Die Liste der Syntax-Codes ist von Hand gepflegt — also misst diese Probe
 * sie an der Quelle.** Die Quelle ist das, was Parser und Scanner des
 * installierten TypeScript melden können, abgelesen an ihren Abschnitten im
 * Bündel. Bringt ein Update einen neuen Parserfehler, wird es hier rot, statt
 * dass die Sperrklinke wieder „aufgeräumt" meldet.
 */
describe('istSyntaxfehler', () => {
  const quelle = readFileSync(createRequire(import.meta.url).resolve('typescript'), 'utf8')
  const codeVon = new Map(
    [...quelle.matchAll(/^\s*(\w+): diag\((\d+), 1 \/\* Error \*\//gm)].map((t) => [t[1], Number(t[2])]),
  )
  const gemeldet = (datei: string) => {
    const marke = `// src/compiler/${datei}`
    const start = quelle.indexOf(marke)
    if (start < 0) return []
    const ende = quelle.indexOf('\n// src/', start + marke.length)
    const namen = new Set([...quelle.slice(start, ende).matchAll(/Diagnostics\.(\w+)/g)].map((t) => t[1]))
    return [...namen].flatMap((n) => codeVon.get(n) ?? [])
  }
  const PARSER = [...new Set([...gemeldet('scanner.ts'), ...gemeldet('parser.ts')])]

  it('die Probe greift überhaupt', () => {
    // Am 26.9.2026 (TypeScript 6.0) waren es 144 Codes. Findet sie deutlich
    // weniger, hat sich das Bündel verändert, und sie misst nicht mehr.
    expect(PARSER.length).toBeGreaterThan(100)
  })

  it('kennt jeden Code, den Parser und Scanner melden können', () => {
    expect(PARSER.filter((c) => !istSyntaxfehler(c)).sort((a, b) => a - b)).toEqual([])
  })

  it('lässt die Meldungen durch, die die Sperrklinke zählt', () => {
    // Das sind alle Codes der 642 Meldungen vom 26.9.2026 — TS18048 eingeschlossen,
    // weshalb die Liste keinen ganzen 18000er-Block nehmen darf.
    expect([2322, 2345, 2532, 2769, 18048].filter((c) => istSyntaxfehler(c))).toEqual([])
  })
})
