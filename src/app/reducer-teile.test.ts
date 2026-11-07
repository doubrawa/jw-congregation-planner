import { describe, expect, it } from 'vitest'
import { aktionsArten, reducerFaelle } from './quelltext-proben'

/**
 * **Jede Aktion hat genau einen Fall — und die Verteilstelle leitet sie dorthin.**
 *
 * Der Reducer ist nach Fachbereich geteilt (`aktionen/*`): Jeder Teil hat
 * seinen eigenen `switch`, und `baseReducer` in `reducer.ts` leitet jede Aktion
 * an ihren Teil. tsc fängt davon schon viel — eine Aktion ohne Marke, eine
 * Marke ohne Fall im Teil, einen Teil ohne Fall für eine seiner Aktionen —,
 * nicht aber eine Aktion mit Fällen in **zwei** Teilen. Einer davon ist dann
 * toter Code: Wer ihn ändert, ändert nichts — und ohne diese Probe merkte er
 * es nicht.
 *
 * Gelesen wird der Quelltext, wie in `readonly.test.ts`: Die Aktionsliste ist
 * ein Typ und existiert zur Laufzeit nicht.
 */

const text = (q: unknown): string => String(q).split('\r\n').join('\n')
const CONTEXT = import.meta.glob('./context.ts', { query: '?raw', import: 'default', eager: true })
const REDUCER = import.meta.glob('./reducer.ts', { query: '?raw', import: 'default', eager: true })
const AKTIONEN = import.meta.glob(['./aktionen/*.ts', '!./aktionen/*.test.ts'], { query: '?raw', import: 'default', eager: true })

const kontext = text(Object.values(CONTEXT)[0] ?? '')
const reducer = text(Object.values(REDUCER)[0] ?? '')
const quellen = Object.entries(AKTIONEN).map(([datei, q]) => [datei, text(q)] as const)

/** Jede Aktionsart der Union `AppAction` — auch die über mehrere Zeilen (`navigate`). */
const alleArten = (): string[] => aktionsArten(kontext)

interface Teil {
  datei: string
  name: string
  faelle: string[]
}

/** Die Teilfunktionen einer Quelle mit ihren Fällen — je bis zur schließenden Klammer in Spalte 0. */
function teileIn(datei: string, quelle: string): Teil[] {
  return [...quelle.matchAll(/^export function (\w+)\(state: AppState, action: \w+Aktion\): AppState \{$/gm)].map((kopf) => {
    const ende = quelle.indexOf('\n}', kopf.index)
    const rumpf = quelle.slice(kopf.index, ende < 0 ? undefined : ende)
    return { datei, name: kopf[1]!, faelle: [...rumpf.matchAll(/^ {4}case '(\w+)':/gm)].map((m) => m[1]!) }
  })
}

/** Die Marken der Verteilstelle als Paare `[Aktion, Teil]`. */
function verteilung(quelle: string): Array<[string, string]> {
  const ab = quelle.indexOf('\nfunction baseReducer(')
  if (ab < 0) throw new Error('baseReducer nicht gefunden — Muster nachziehen')
  const out: Array<[string, string]> = []
  let offen: string[] = []
  for (const zeile of quelle.slice(ab, quelle.indexOf('\n}', ab + 1)).split('\n')) {
    const marke = /^ {4}case '(\w+)':$/.exec(zeile)
    if (marke) offen.push(marke[1]!)
    const ziel = /^ {6}return (\w+)\(state, action\)$/.exec(zeile)
    if (ziel) {
      out.push(...offen.map((art) => [art, ziel[1]!] as [string, string]))
      offen = []
    }
  }
  return out
}

/** Was nicht stimmt — leer, wenn jede Aktion genau einen Fall hat und genau dorthin geleitet wird. */
function befunde(arten: readonly string[], verteilstelle: string, teile: readonly Teil[]): string[] {
  const out: string[] = []
  const ort = new Map<string, string[]>()
  for (const teil of teile) {
    if (!teil.datei.endsWith(`/${teil.name}.ts`)) out.push(`Teil ${teil.name} steht in ${teil.datei}`)
    for (const art of teil.faelle) ort.set(art, [...(ort.get(art) ?? []), teil.name])
  }
  const wo = (art: string): string[] => [...(ort.get(art) ?? [])].sort()
  for (const art of arten) {
    if (wo(art).length !== 1) out.push(`${art}: Fall in ${wo(art).length} Teilen (${wo(art).join(', ')})`)
  }
  for (const art of ort.keys()) if (!arten.includes(art)) out.push(`${art}: Fall ohne Aktion`)
  const ziele = new Map<string, string[]>()
  for (const [art, teil] of verteilung(verteilstelle)) ziele.set(art, [...(ziele.get(art) ?? []), teil])
  for (const art of arten) {
    const ziel = ziele.get(art) ?? []
    if (ziel.length !== 1) out.push(`${art}: ${ziel.length} Marken in der Verteilstelle`)
    else if (!wo(art).includes(ziel[0]!)) out.push(`${art}: Verteilstelle → ${ziel[0]}, Fall in ${wo(art).join(', ') || 'keinem Teil'}`)
  }
  return out
}

const echteTeile = (): Teil[] => quellen.flatMap(([datei, quelle]) => teileIn(datei, quelle))

describe('Die Teile des Reducers und ihre Verteilstelle', () => {
  it('die Probe liest alle Aktionen, alle Teile und die Verteilstelle', () => {
    // Ohne Treffer prüfte sie nichts — jedes Muster muss greifen.
    const arten = alleArten()
    expect(arten.length, 'Aktionsliste nicht gefunden — Muster nachziehen').toBeGreaterThan(100)
    expect(arten).toEqual(expect.arrayContaining(['login', 'navigate', 'hideToast']))
    expect(echteTeile().length, 'Teilfunktionen unter aktionen/').toBeGreaterThanOrEqual(9)
    expect(verteilung(reducer).length, 'Marken der Verteilstelle').toBe(arten.length)
  })

  it('jede Aktion steht in genau einem Teil, und die Verteilstelle leitet sie dorthin', () => {
    expect(befunde(alleArten(), reducer, echteTeile())).toEqual([])
  })

  it('die Quelltext-Proben (`reducerFaelle`) sehen jede Aktion genau einmal', () => {
    // Darauf bauen persist.test.ts und readonly.test.ts: Fehlte ein Teil, prüften sie still weniger.
    const namen = reducerFaelle(quellen.map(([, quelle]) => quelle)).map(([name]) => name)
    expect([...namen].sort()).toEqual([...alleArten()].sort())
  })

  it('Gegenprobe: eine Aktion mit Fällen in zwei Teilen fällt auf', () => {
    const teile = quellen.flatMap(([datei, quelle]) =>
      teileIn(datei, datei.endsWith('/plaene.ts') ? quelle.replace('  switch (action.type) {\n', "  switch (action.type) {\n    case 'login':\n      return state\n") : quelle),
    )
    expect(befunde(alleArten(), reducer, teile)).toEqual(['login: Fall in 2 Teilen (plaene, sitzung)'])
  })

  it('Gegenprobe: eine Marke, die an einen anderen Teil leitet, fällt auf', () => {
    const umgeleitet = reducer
      .replace("    case 'login':\n", '')
      .replace('      return plaene(state, action)', "    case 'login':\n      return plaene(state, action)")
    expect(befunde(alleArten(), umgeleitet, echteTeile())).toEqual(['login: Verteilstelle → plaene, Fall in sitzung'])
  })
})
