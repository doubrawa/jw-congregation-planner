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

/** So viele Aktionen hat die Union mindestens — fänden sich weniger, hätte sich die Schreibweise geändert. */
const MINDEST_AKTIONEN = 100

/**
 * **Jede Aktionsart der Union `AppAction`** aus dem Quelltext von `context.ts`
 * — auch die über mehrere Zeilen (`| {` und darunter `type: 'navigate'`). Ein
 * Muster, das `{ type: '…'` auf einer Zeile verlangt, übersieht sie, und jede
 * Probe darüber prüft still eine Aktion weniger.
 */
export function aktionsArten(kontext: string): string[] {
  const union = /\nexport type AppAction =\n([\s\S]*?)\n\n/.exec(kontext.split('\r\n').join('\n'))?.[1] ?? ''
  const arten = [...new Set([...union.matchAll(/\|\s*\{\s*type: '(\w+)'/g)].map((m) => m[1]!))]
  if (arten.length < MINDEST_AKTIONEN) throw new Error(`Aktionsliste nicht gefunden (${arten.length}) — Muster nachziehen`)
  return arten
}

/**
 * Setzt dieser Fall das Feld — als **eigene** Eigenschaft des zurückgegebenen
 * Zustands?
 *
 * Zwei Schreibweisen zählen: `weeks: …` und die Kurzform `{ ...state, weeks }`.
 * Die Kurzform fehlte anfangs, und das fiel erst auf, als `lacAdd`/`lacMove`
 * ihren eigenen `case` in `persist.ts` verloren — sie schreiben `{ ...state,
 * weeks }` und galten damit als Aktionen, die nichts ändern.
 *
 * Nicht zählen: Zugriffe (`state.weeks`), verwandte Namen (`fsWeeks`), lokale
 * Variablen (`const weeks = …`, `return weeks`) und das bloße Durchreichen
 * `fsRules: state.fsRules` — als Argument (`neueWocheEinordnen(w, { fsRules:
 * state.fsRules })`) oder im Rückgabewert: Der Wert ist dann der alte. Bis zum
 * 16.10.2026 zählte es, und `addImportedWeek` galt als Fall, der Personen und
 * Grundplan ändert.
 */
export function setztFeld(text: string, feld: string): boolean {
  for (let i = text.indexOf(feld); i >= 0; i = text.indexOf(feld, i + 1)) {
    // Ein Wortzeichen davor heißt: anderer Name (`fsWeeks`) oder Zugriff
    // (`state.weeks`).
    if (i > 0 && WORTZEICHEN.includes(text[i - 1]!)) continue
    const rest = text.slice(i + feld.length)
    if (rest.startsWith(':')) {
      const wert = rest.slice(1).trimStart()
      const alt = `state.${feld}`
      // Endet der Wert gleich danach (Komma, Klammer), ist es der alte. Folgt
      // etwas — Zugriff, Aufruf, Index, `? :` —, entsteht ein neuer.
      if (wert.startsWith(alt) && /^\s*([,})]|$)/.test(wert.slice(alt.length))) continue
      return true
    }
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
 * Der Kopf einer Teilfunktion des Reducers (`app/aktionen/*`):
 * `export function <teil>(state: AppState, action: <Teil>Aktion): AppState {`.
 */
const TEIL_KOPF = /^export function \w+\(state: AppState, action: \w+Aktion\): AppState \{$/gm

/**
 * Die `case`-Zweige der Teile des Reducers als Paare `[Aktionsart, Rumpf]` —
 * je Quelle aus `app/aktionen/` der `switch` ihrer Teilfunktion. Durchreichen
 * aufgelöst: `case 'a': case 'b': <Rumpf>` gibt beiden denselben Rumpf.
 *
 * Nicht die Verteilstelle `baseReducer` in `reducer.ts`: Ihr Rumpf
 * `return personen(state, action)` setzt kein Feld, und die Proben sähen
 * nichts. Eine Quelle ohne Teilfunktion (`gemeinsam.ts`) trägt nichts bei; die
 * Untergrenze gilt über alle Quellen zusammen.
 */
export function reducerFaelle(quellen: readonly string[]): Array<[string, string]> {
  const faelle: Array<[string, string]> = []
  let teile = 0
  for (const quelle of quellen) {
    const koepfe = [...quelle.matchAll(TEIL_KOPF)]
    // Ein `switch` über die Aktion ohne erkannten Kopf: Seine Fälle fielen still heraus.
    if (koepfe.length === 0 && quelle.includes('switch (action.type)')) {
      throw new Error('Teilfunktion nicht erkannt — Muster nachziehen')
    }
    for (const kopf of koepfe) {
      teile++
      // Bis zur schließenden Klammer in Spalte 0: Was danach in der Datei steht,
      // gehört nicht zum letzten Fall.
      const ende = quelle.indexOf('\n}', kopf.index)
      faelle.push(...durchgereicht(quelle.slice(kopf.index, ende < 0 ? undefined : ende)))
    }
  }
  if (teile === 0) throw new Error('keine Teilfunktion gefunden')
  if (faelle.length < 60) throw new Error(`Fälle nicht gefunden (${faelle.length})`)
  return faelle
}

/** Die Fälle eines `switch` — der leere Zweig erbt den nächsten Rumpf. */
function durchgereicht(teilfunktion: string): Array<[string, string]> {
  const rohe: Array<[string, string]> = []
  for (const teil of teilfunktion.split('\n    case ').slice(1)) {
    const ende = teil.indexOf("':")
    if (ende < 0 || teil[0] !== "'") continue
    rohe.push([teil.slice(1, ende), teil.slice(ende + 2)])
  }
  return rohe.map(([name], i) => {
    let j = i
    while (rohe[j]![1].trim() === '' && j + 1 < rohe.length) j++
    return [name, rohe[j]![1]] as [string, string]
  })
}
