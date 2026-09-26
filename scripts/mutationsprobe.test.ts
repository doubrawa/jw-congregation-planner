import { describe, expect, it } from 'vitest'
import { ankerFehler, KATALOG, testlaufBefund } from './mutationsprobe.mjs'

/**
 * **Zeigt der Katalog der Mutationsprobe noch dorthin, wo er hinzeigen soll?**
 *
 * Die Probe selbst (`npm run mutationsprobe`) kostet je Eintrag bis zu einen
 * vollen Testlauf und läuft deshalb nicht in der CI. Sie ist aber nur so viel
 * wert wie ihr Katalog: Findet ein `suchen` seine Stelle nicht mehr, bricht
 * sie ab — und zwar **bevor sie eine einzige Regel misst**.
 *
 * Genau das ist am 21. September 2026 aufgefallen (T112): 16 von 192 Einträgen
 * zeigten ins Leere, der älteste seit dem 5. September. Zweieinhalb Wochen
 * lang war keine der 192 Regeln gemessen worden, ohne dass irgendetwas rot
 * wurde. Die Umbauten, die die Stellen verschoben hatten, waren alle grün
 * durchgegangen — sie mussten es sein, denn der Katalog gehört zu keinem
 * Testlauf.
 *
 * Seither gehört er zu einem. Die Prüfung liest nur Dateien und mutiert
 * nichts; sie kostet Millisekunden und hält einen Umbau **am selben Tag** an,
 * statt beim nächsten Durchgang Wochen später.
 */
describe('Mutationsprobe: der Katalog zeigt auf vorhandene Stellen', () => {
  /**
   * **Innerhalb der Probe tritt diese Prüfung zurück.**
   *
   * Die Probe bricht je Eintrag absichtlich eine Stelle im Quelltext auf —
   * danach steht dessen `suchen` dort nicht mehr, und die Prüfung unten wäre
   * bei **jeder** Mutation der erste rote Test. Mit `--bail=1` bräche der Lauf
   * dort ab, und die Probe schriebe jeder Regel „bewacht" gut, ohne eine
   * einzige gemessen zu haben. Genau das ist am 21.9.2026 passiert: 14 von 14
   * angeblich bewacht, Wächter jedes Mal diese Datei hier.
   *
   * Ungeprüft bleibt dabei nichts: Die Probe selbst fährt dieselbe Prüfung
   * über den ganzen Katalog, bevor sie die erste Mutation setzt.
   */
  const imProbelauf = Boolean(process.env.MUTATIONSPROBE)

  it.skipIf(imProbelauf)('jeder Eintrag findet seine Stelle genau einmal', () => {
    // Lesbar statt als Objekt-Dump: Im roten Fall soll dastehen, welcher
    // Eintrag wohin zeigte — sonst sucht man es einzeln zusammen.
    const fehler = ankerFehler().map((f) => `${f.id}: ${f.treffer}× in ${f.datei}`)
    expect(
      fehler,
      'Der Katalog ist verrostet. Die Regel an ihrer neuen Stelle suchen und die ' +
        'Mutation so fassen, dass sie wieder denselben Fehler herstellt — oder den ' +
        'Eintrag mit Begründung streichen, wenn es die Regel nicht mehr gibt.',
    ).toEqual([])
  })

  it('keine Kennung kommt zweimal vor', () => {
    // Eine doppelte Kennung fiele im Bericht als „schon gemessen" durch: Der
    // zweite Eintrag stünde mit dem Ergebnis des ersten da.
    const alle: string[] = KATALOG.map((m) => m.id)
    expect(alle.filter((id, i) => alle.indexOf(id) !== i)).toEqual([])
  })
})

/**
 * **Ein Rot zählt nur, wenn vitest getestet hat.**
 *
 * Am 26. September 2026 meldete die Probe in einem Worktree jede Regel als
 * „bewacht (unbekannt, 0s)". Gemessen hatte sie nichts: vitest lag nicht unter
 * dem festen Pfad `<wurzel>/node_modules/vitest/vitest.mjs`, Node endete an
 * „Cannot find module" mit 1, und die Probe wertete jeden Rückgabewert ≠ 0 als
 * rot. Ein Häkchen je Regel, ohne einen einzigen Test.
 *
 * Nachgestellt, ohne vitest zu starten: `testlaufBefund` bekommt, was
 * `spawnSync` zurückgibt — in Formen, die am 26.9.2026 unter den Schaltern der
 * Probe gemessen wurden (vitest 4.1, Node 24). Pfade und Adresse
 * neutralisiert; Punktzeilen, Aufrufketten und Konsolenausgaben gekürzt. Wo
 * vitest liegt, prüft `werkzeug-pfad.test.ts`.
 */

/** So kam es im Worktree zurück: Node findet vitest nicht. */
const OHNE_VITEST = {
  status: 1,
  signal: null,
  stdout: '',
  stderr: [
    'node:internal/modules/cjs/loader:1479',
    '  throw err;',
    '  ^',
    '',
    "Error: Cannot find module 'C:\\repo\\.claude\\worktrees\\x\\node_modules\\vitest\\vitest.mjs'",
    '    at Module._resolveFilename (node:internal/modules/cjs/loader:1476:15)',
    '    at node:internal/main/run_main_module:33:47 {',
    "  code: 'MODULE_NOT_FOUND',",
    '  requireStack: []',
    '}',
    '',
    'Node.js v24.15.0',
    '',
  ].join('\r\n'),
}

const lauf = (status: number | null, stdout = '', stderr = '') => ({ status, signal: null, stdout, stderr })

/** vitest startet, findet aber nichts zu testen — gemessen mit einem Filter ohne Treffer. */
const KEINE_TESTDATEIEN = lauf(
  1,
  '\n RUN  v4.1.10 C:/repo\n\n\n',
  'No test files found, exiting with code 1\n\nfilter: gibtsnichtxyz\n' +
    'include: **/*.{test,spec}.?(c|m)[jt]s?(x)\nexclude:  **/node_modules/**, **/.git/**\n\n',
)

/**
 * Eine gefangene Mutation (`kontakt-betreff-kodiert`); `--bail=1` bricht nach
 * dem ersten roten Test ab. Davor schrieb ein anderer Test auf die Konsole —
 * dessen Datei ist nicht der Wächter.
 */
const ROT = lauf(
  1,
  '\n RUN  v4.1.10 C:/repo\n\n··········\n\n' +
    ' Test Files  1 failed | 31 passed | 5 skipped (194)\n' +
    '      Tests  1 failed | 2272 passed | 25 skipped (2401)\n' +
    '   Start at  15:15:48\n' +
    '   Duration  23.68s (transform 46.12s, setup 0ms, import 59.48s, tests 74.31s, environment 62.79s)\n\n',
  'stderr | supabase/functions/_test/send-reminders.test.ts > send-reminders: Hilfsdienste erinnern (Slot-Objekte) > ein Punkt ohne Kennung erinnert gar nicht — statt endlos\n' +
    '[zuteilungen] Punkt ohne Kennung (2026-09-07|mid): "Schatzgraben"\n\n' +
    '\n⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯\n\n' +
    ' FAIL  src/login/login.test.tsx > Wofür die App da ist und wo man eine Versammlung anfragt > auf Japanisch kommt alles japanisch an, auch der Betreff — kodiert, damit der Verweis hält\n' +
    "AssertionError: expected 'mailto:…?subject=新しい会衆：…' to match /^[\\x21-\\x7e]+$/\n\n" +
    ' ❯ src/login/login.test.tsx:345:53\n',
)

/**
 * Dieselbe Mutation, wie sie im eigenen Terminal ankommt: Ohne `CLAUDECODE`
 * und `AI_AGENT` färbt vitest, auch in die Pipe der Probe.
 */
const ROT_FARBIG = lauf(
  1,
  '\n\u001b[1m\u001b[30m\u001b[46m RUN \u001b[49m\u001b[39m\u001b[22m \u001b[36mv4.1.10 \u001b[39m\u001b[90mC:/repo\u001b[39m\n\n' +
    '\u001b[33m\u001b[39m\u001b[32m·\u001b[39m\u001b[33m\u001b[39m\u001b[32m·\u001b[39m\n\n' +
    '\u001b[2m Test Files \u001b[22m \u001b[1m\u001b[31m1 failed\u001b[39m\u001b[22m\u001b[2m | \u001b[22m\u001b[1m\u001b[32m11 passed\u001b[39m\u001b[22m\u001b[2m | \u001b[22m\u001b[33m7 skipped\u001b[39m\u001b[90m (194)\u001b[39m\n' +
    '\u001b[2m      Tests \u001b[22m \u001b[1m\u001b[31m1 failed\u001b[39m\u001b[22m\u001b[2m | \u001b[22m\u001b[1m\u001b[32m397 passed\u001b[39m\u001b[22m\u001b[2m | \u001b[22m\u001b[33m13 skipped\u001b[39m\u001b[90m (1329)\u001b[39m\n' +
    '\u001b[2m   Start at \u001b[22m 15:18:06\n' +
    '\u001b[2m   Duration \u001b[22m 8.72s\u001b[2m (transform 35.02s, setup 0ms, import 37.87s, tests 27.21s, environment 30.47s)\u001b[22m\n\n',
  '\u001b[31m⎯⎯⎯⎯⎯⎯⎯\u001b[39m\u001b[1m\u001b[41m Failed Tests 1 \u001b[49m\u001b[22m\u001b[31m⎯⎯⎯⎯⎯⎯⎯\u001b[39m\n\n' +
    '\u001b[41m\u001b[1m FAIL \u001b[22m\u001b[49m src/login/login.test.tsx\u001b[2m > \u001b[22mWofür die App da ist und wo man eine Versammlung anfragt\u001b[2m > \u001b[22mauf Japanisch kommt alles japanisch an, auch der Betreff — kodiert, damit der Verweis hält\n' +
    '\u001b[36m \u001b[2m❯\u001b[22m src/login/login.test.tsx:\u001b[2m345:53\u001b[22m\u001b[39m\n',
)

/** Ein Test, der an einem fehlenden Modul scheitert: Die Wendung steht dann in vitests Bericht auf stderr. */
const ROT_FEHLENDES_MODUL = lauf(
  1,
  '\n RUN  v4.1.10 C:/repo\n\nx\n\n' +
    ' Test Files  1 failed (1)\n' +
    '      Tests  1 failed (1)\n' +
    '   Start at  15:21:41\n' +
    '   Duration  1.53s (transform 82ms, setup 0ms, import 126ms, tests 14ms, environment 0ms)\n\n',
  '\n⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯\n\n' +
    ' FAIL  src/x.test.ts > lädt ein Modul, das es nicht gibt\n' +
    "Error: Cannot find module './gibts-nicht.cjs'\n" +
    'Require stack:\n' +
    '- C:\\repo\\src\\x.test.ts\n' +
    ' ❯ src/x.test.ts:7:33\n',
)

/** Die ganze Suite ohne Mutation — auch ein grüner Lauf schreibt nach stderr. */
const GRUEN = lauf(
  0,
  '\n RUN  v4.1.10 C:/repo\n\n······-·····\n\n' +
    ' Test Files  194 passed (194)\n' +
    '      Tests  5516 passed | 3 skipped (5519)\n' +
    '   Start at  15:14:50\n' +
    '   Duration  41.84s (transform 104.13s, setup 0ms, import 171.34s, tests 128.57s, environment 168.28s)\n\n',
  'stderr | src/lib/week-konflikt.test.ts > Echte Schreibfehler bleiben Schreibfehler > ein Datenbankfehler meldet nicht fälschlich einen Konflikt\n' +
    '[persistenz] RLS\n\n',
)

describe('testlaufBefund: ein Rot zählt nur, wenn vitest getestet hat', () => {
  it('Node findet vitest nicht — Abbruch statt Häkchen', () => {
    const befund = testlaufBefund(OHNE_VITEST)
    expect(befund.rot).toBeUndefined()
    expect(befund.fehler).toContain("Cannot find module 'C:\\repo\\")
  })

  it('vitest findet nichts zu testen — Rückgabewert 1 ohne Testergebnis ist kein Rot', () => {
    const befund = testlaufBefund(KEINE_TESTDATEIEN)
    expect(befund.rot).toBeUndefined()
    expect(befund.fehler).toContain('No test files found')
  })

  it('auch ein Rückgabewert 0 zählt nur mit Testergebnis', () => {
    // Sonst stünde die Regel als „UNBEWACHT" da — ebenso ungemessen.
    const befund = testlaufBefund(lauf(0))
    expect(befund.rot).toBeUndefined()
    expect(befund.fehler).toContain('(keine Ausgabe)')
  })

  it('abgeschossen oder gar nicht gestartet: kein Befund', () => {
    // ENOBUFS: mehr Ausgabe als `maxBuffer` — spawnSync bricht den Lauf ab.
    expect(testlaufBefund({ ...lauf(null), signal: 'SIGTERM' }).fehler).toContain('SIGTERM')
    expect(testlaufBefund({ ...lauf(null), error: new Error('spawnSync node ENOBUFS') }).fehler).toContain('ENOBUFS')
  })

  it('ein roter Lauf nennt seinen Wächter — nicht die Datei, die nur auf die Konsole schrieb', () => {
    expect(testlaufBefund(ROT)).toEqual({ rot: true, waechter: 'src/login/login.test.tsx' })
  })

  it('farbig wie im eigenen Terminal: dasselbe Rot, derselbe Wächter', () => {
    // Ohne Entfärben fände `TESTERGEBNIS` die Summenzeile nicht, und der
    // Wächter hieße „unbekannt" — so stand es bis zum 26.9.2026 im eigenen
    // Terminal bei jeder Regel.
    expect(testlaufBefund(ROT_FARBIG)).toEqual({ rot: true, waechter: 'src/login/login.test.tsx' })
  })

  it('ein „Cannot find module" im Bericht eines roten Tests ist ein Rot, kein Absturz', () => {
    // Anders als tsc schreibt vitest seinen Fehlerbericht nach stderr. Hieße
    // die Wendung dort immer „vitest lief nicht", bräche die Probe an jeder
    // Regel ab, deren Wächter an einem fehlenden Modul scheitert.
    expect(testlaufBefund(ROT_FEHLENDES_MODUL)).toEqual({ rot: true, waechter: 'src/x.test.ts' })
  })

  it('ein grüner Lauf bleibt ein Befund: unbewacht', () => {
    // Die eigentliche Auskunft der Probe. Eine Wache, die jeden Lauf mit
    // Ausgabe auf stderr verwürfe, ließe keine Lücke mehr sehen.
    expect(testlaufBefund(GRUEN)).toEqual({ rot: false, waechter: null })
  })
})
