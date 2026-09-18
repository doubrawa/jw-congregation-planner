import { describe, expect, it } from 'vitest'
import { reducerFaelle, setztFeld } from './quelltext-proben'

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
})

describe('reducerFaelle', () => {
  /** Eine Quelle mit genug Fällen — die Untergrenze soll hier nicht greifen. */
  const quelle = (...faelle: string[]): string =>
    [
      'function baseReducer(state, action) {',
      '  switch (action.type) {',
      ...faelle,
      // Fülltext, damit die Untergrenze von 60 Fällen erreicht ist.
      ...Array.from({ length: 60 }, (_, i) => `    case 'f${i}':\n      return state`),
      '  }',
      '}',
    ].join('\n')

  it('löst das Durchreichen auf: der leere Zweig erbt den nächsten Rumpf', () => {
    const faelle = new Map(
      reducerFaelle(quelle("    case 'zwei':", "    case 'drei':", '      return { ...state, weeks }')),
    )
    expect(faelle.get('zwei')).toBe(faelle.get('drei'))
    expect(setztFeld(faelle.get('zwei')!, 'weeks')).toBe(true)
  })

  it('hält die Rümpfe auseinander', () => {
    const faelle = new Map(
      reducerFaelle(
        quelle(
          "    case 'eins': {",
          '      return { ...state, weeks }',
          '    }',
          "    case 'zwei':",
          '      return { ...state, persons: [] }',
        ),
      ),
    )
    expect(setztFeld(faelle.get('eins')!, 'weeks')).toBe(true)
    expect(setztFeld(faelle.get('zwei')!, 'weeks')).toBe(false)
  })

  it('wirft, wenn `baseReducer` nicht mehr so heißt', () => {
    expect(() => reducerFaelle('function anders() {}')).toThrow(/baseReducer/)
  })

  it('wirft, wenn das Muster der Fälle nicht mehr passt', () => {
    expect(() => reducerFaelle('function baseReducer() {}')).toThrow(/Fälle nicht gefunden/)
  })
})
