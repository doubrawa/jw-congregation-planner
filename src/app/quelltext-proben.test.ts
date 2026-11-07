import { describe, expect, it } from 'vitest'
import { aktionsArten, reducerFaelle, setztFeld } from './quelltext-proben'

/**
 * **Das Werkzeug der Quelltext-Proben muss selbst geprüft sein.**
 *
 * `persist.test.ts` und `readonly.test.ts` entscheiden damit, ob eine Aktion
 * einen Schreibweg braucht. Antwortet `setztFeld` zu knapp, gehen genau die
 * Fälle still durch, gegen die beide Proben stehen — und niemand merkt es,
 * weil die Proben dann grün sind. Der Anlass ist echt: Die Kurzform
 * `{ ...state, weeks }` zählte anfangs nicht, und `lacAdd`/`lacMove` galten
 * damit als Aktionen, die nichts ändern.
 */
describe('setztFeld', () => {
  it('findet die ausgeschriebene Form', () => {
    expect(setztFeld('return { ...state, weeks: neu }', 'weeks')).toBe(true)
  })

  it('findet die Kurzform — am Ende und mitten im Objekt', () => {
    expect(setztFeld('return { ...state, weeks }', 'weeks')).toBe(true)
    expect(setztFeld("return { ...state, weeks, toast: 'x' }", 'weeks')).toBe(true)
    expect(setztFeld('return {\n  ...state,\n  weeks,\n}', 'weeks')).toBe(true)
  })

  it('verwechselt verwandte Namen nicht', () => {
    expect(setztFeld('return { ...state, fsWeeks }', 'weeks')).toBe(false)
    expect(setztFeld('return { ...state, fsWeeks: neu }', 'weeks')).toBe(false)
  })

  it('hält Zugriffe und lokale Namen auseinander', () => {
    expect(setztFeld('const neu = lacAdd(state.weeks, i)', 'weeks')).toBe(false)
    expect(setztFeld('const weeks = lacAdd(state.weeks, i)\nreturn state', 'weeks')).toBe(false)
    expect(setztFeld('if (weeks === state.weeks) return state', 'weeks')).toBe(false)
    expect(setztFeld('for (const w of weeks) zaehle(w)', 'weeks')).toBe(false)
  })

  it('bloßes Durchreichen setzt nichts — ein neuer Wert daraus schon', () => {
    // So reicht `addImportedWeek` den Grundplan an `neueWocheEinordnen` weiter
    // (16.10.2026): gelesen, nicht gesetzt.
    expect(setztFeld('neueWocheEinordnen(w, { fsRules: state.fsRules, persons: state.persons })', 'fsRules')).toBe(false)
    expect(setztFeld('return { ...state, fsRules: state.fsRules }', 'fsRules')).toBe(false)
    expect(setztFeld('return { ...state, fsRules: state.fsRules.filter(behalten) }', 'fsRules')).toBe(true)
    expect(setztFeld('return { ...state, fsRules: state.fsRulesNeu }', 'fsRules')).toBe(true)
    expect(setztFeld('return { ...state, weeks: state.weeks[0] ? neu : alt }', 'weeks')).toBe(true)
    expect(setztFeld('return { ...state, weeks: state.weeks ? neu : alt }', 'weeks')).toBe(true)
  })
})

describe('aktionsArten', () => {
  /** Eine Union wie in `context.ts`, mit so vielen Gliedern, dass die Untergrenze hält. */
  const union = (glieder: string[]) =>
    ['', 'export type AppAction =', ...glieder, ...Array.from({ length: 100 }, (_, i) => `  | { type: 'a${i}' }`), '', 'export x'].join('\n')

  it('findet auch Glieder über mehrere Zeilen — ein Muster für `{ type:` auf einer Zeile übersah `navigate`', () => {
    const arten = aktionsArten(union(["  | { type: 'login'; welcome?: boolean }", '  | {', "      type: 'navigate'", '      screen: Screen', '    }']))
    expect(arten.slice(0, 2)).toEqual(['login', 'navigate'])
  })

  it('wirft, wenn die Union nicht mehr so aussieht — sonst prüfte jede Probe darüber still weniger', () => {
    expect(() => aktionsArten("export type AppAction = { type: 'a' }")).toThrow(/Aktionsliste nicht gefunden/)
  })
})

describe('reducerFaelle', () => {
  /** Der Kopf einer Teilfunktion, wie sie unter `app/aktionen/` stehen. */
  const KOPF = 'export function teil(state: AppState, action: TeilAktion): AppState {'

  /** Fülltext: `n` Fälle, die nichts setzen. */
  const fuellung = (n: number, praefix = 'f'): string[] =>
    Array.from({ length: n }, (_, i) => `    case '${praefix}${i}':\n      return state`)

  /** Eine Teilfunktion mit diesen Fällen. */
  const teil = (...faelle: string[]): string => [KOPF, '  switch (action.type) {', ...faelle, '  }', '}'].join('\n')

  /** Eine Quelle mit genug Fällen — die Untergrenze soll hier nicht greifen. */
  const quelle = (...faelle: string[]): string => teil(...faelle, ...fuellung(60))

  it('löst das Durchreichen auf: der leere Zweig erbt den nächsten Rumpf', () => {
    const faelle = new Map(
      reducerFaelle([quelle("    case 'zwei':", "    case 'drei':", '      return { ...state, weeks }')]),
    )
    expect(faelle.get('zwei')).toBe(faelle.get('drei'))
    expect(setztFeld(faelle.get('zwei')!, 'weeks')).toBe(true)
  })

  it('hält die Rümpfe auseinander', () => {
    const faelle = new Map(
      reducerFaelle([
        quelle(
          "    case 'eins': {",
          '      return { ...state, weeks }',
          '    }',
          "    case 'zwei':",
          '      return { ...state, persons: [] }',
        ),
      ]),
    )
    expect(setztFeld(faelle.get('eins')!, 'weeks')).toBe(true)
    expect(setztFeld(faelle.get('zwei')!, 'weeks')).toBe(false)
  })

  it('liest die Fälle aller Teile — die Untergrenze gilt über alle zusammen', () => {
    const a = teil(...fuellung(30, 'a'), "    case 'letzterVonA':\n      return { ...state, weeks }")
    const b = teil(...fuellung(30, 'b'))
    const faelle = new Map(reducerFaelle([a, b]))
    expect(faelle.size).toBe(61)
    expect(setztFeld(faelle.get('letzterVonA')!, 'weeks')).toBe(true)
    // Jeder Teil für sich bliebe unter der Grenze.
    expect(() => reducerFaelle([b])).toThrow(/Fälle nicht gefunden \(30\)/)
  })

  it('eine Quelle ohne Teilfunktion trägt nichts bei — wie die Helfer in `gemeinsam.ts`', () => {
    const helfer = 'export function toastKey(state: AppState): AppState {\n  return { ...state, weeks }\n}'
    expect(reducerFaelle([helfer, quelle()])).toEqual(reducerFaelle([quelle()]))
  })

  it('was hinter der Teilfunktion steht, gehört nicht zum letzten Fall', () => {
    const danach = '\n\nfunction helfer(state) {\n  return { ...state, weeks }\n}\n'
    const faelle = reducerFaelle([quelle() + danach])
    expect(setztFeld(faelle.at(-1)![1], 'weeks')).toBe(false)
  })

  it('wirft, wenn keine Quelle eine Teilfunktion hat', () => {
    expect(() => reducerFaelle(['function anders() {}'])).toThrow(/keine Teilfunktion/)
    expect(() => reducerFaelle([])).toThrow(/keine Teilfunktion/)
  })

  it('wirft, wenn ein switch über die Aktion an keinem erkannten Kopf hängt', () => {
    // Sonst fielen seine Fälle still heraus, und die Proben prüften weniger.
    const anders = quelle().replace(KOPF, 'export function teil(state: AppState, action: AppAction) {')
    expect(() => reducerFaelle([anders, quelle()])).toThrow(/Teilfunktion nicht erkannt/)
  })

  it('wirft, wenn das Muster der Fälle nicht mehr passt', () => {
    expect(() => reducerFaelle([`${KOPF}\n}`])).toThrow(/Fälle nicht gefunden/)
  })
})
