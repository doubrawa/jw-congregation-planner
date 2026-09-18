/**
 * **Werkzeug für die Quelltext-Proben um Reducer und Persistenz.**
 *
 * Zwei Proben fragen dasselbe auf zwei Seiten: `persist.test.ts` prüft, dass
 * jede dauerhafte Änderung des Reducers auch geschrieben wird;
 * `readonly.test.ts` prüft die Gegenrichtung — was nichts schreibt, darf
 * offline laufen. Beide müssen dafür wissen, **welches Feld welcher Fall des
 * Reducers setzt**, und das steht im Rückgabewert und nirgends zur Laufzeit:
 * Die Aktionsliste ist ein Typ.
 *
 * Reine Zeichenketten-Arbeit, ohne Dateizugriff — den Quelltext reichen die
 * Proben selbst herein (`import.meta.glob(..., '?raw')`). Damit lässt sich das
 * Werkzeug hier auch selbst prüfen.
 */

const WORTZEICHEN = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_.'

/**
 * Setzt dieser Fall das Feld — als **eigene** Eigenschaft des zurückgegebenen
 * Zustands?
 *
 * Zwei Schreibweisen zählen: `weeks: …` und die Kurzform `{ ...state, weeks }`.
 * Die Kurzform fehlte anfangs, und das fiel erst auf, als `lacAdd`/`lacMove`
 * ihren eigenen `case` in `persist.ts` verloren — sie schreiben `{ ...state,
 * weeks }` und galten damit als Aktionen, die nichts ändern.
 *
 * Nicht zählen: Zugriffe (`state.weeks`), verwandte Namen (`fsWeeks`) und
 * lokale Variablen (`const weeks = …`, `return weeks`).
 */
export function setztFeld(text: string, feld: string): boolean {
  for (let i = text.indexOf(feld); i >= 0; i = text.indexOf(feld, i + 1)) {
    // Ein Wortzeichen davor heißt: anderer Name (`fsWeeks`) oder Zugriff
    // (`state.weeks`).
    if (i > 0 && WORTZEICHEN.includes(text[i - 1]!)) continue
    const rest = text.slice(i + feld.length)
    if (rest.startsWith(':')) return true
    // Kurzform: `{ …, weeks }` oder `{ …, weeks, … }` — davor eine öffnende
    // Klammer oder ein Komma, danach ein Komma oder die schließende Klammer.
    const danach = rest.trimStart()[0]
    if (danach !== ',' && danach !== '}') continue
    const davor = text.slice(0, i).trimEnd().at(-1)
    if (davor === '{' || davor === ',') return true
  }
  return false
}

/**
 * Die `case`-Zweige von `baseReducer` als Paare `[Aktionsart, Rumpf]` —
 * Durchreichen aufgelöst: `case 'a': case 'b': <Rumpf>` gibt beiden denselben
 * Rumpf.
 */
export function reducerFaelle(quelle: string): Array<[string, string]> {
  const ab = quelle.indexOf('function baseReducer(')
  if (ab < 0) throw new Error('baseReducer nicht gefunden')
  const teile = quelle.slice(ab).split('\n    case ')
  const rohe: Array<[string, string]> = []
  for (const teil of teile.slice(1)) {
    const ende = teil.indexOf("':")
    if (ende < 0 || teil[0] !== "'") continue
    rohe.push([teil.slice(1, ende), teil.slice(ende + 2)])
  }
  if (rohe.length < 60) throw new Error(`Fälle nicht gefunden (${rohe.length})`)
  return rohe.map(([name], i) => {
    let j = i
    while (rohe[j]![1].trim() === '' && j + 1 < rohe.length) j++
    return [name, rohe[j]![1]] as [string, string]
  })
}
