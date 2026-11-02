/**
 * Derselbe JSON-Inhalt. Die Reihenfolge der Schlüssel zählt nicht — `jsonb`
 * ordnet sie beim Speichern selbst, und ein neu zusammengesetztes Objekt kann
 * sie anders tragen —, die der Listen schon.
 *
 * Für Werte, wie sie über die Leitung gehen: Ein `undefined` müssen Aufrufer
 * vorher selbst abstreifen (`JSON.parse(JSON.stringify(…))`), hier zählt es
 * als eigener Wert.
 */
export function gleicherInhalt(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => gleicherInhalt(x, b[i]))
  }
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  const links = a as Record<string, unknown>
  const rechts = b as Record<string, unknown>
  const schluessel = Object.keys(links)
  return (
    schluessel.length === Object.keys(rechts).length &&
    schluessel.every((k) => Object.hasOwn(rechts, k) && gleicherInhalt(links[k], rechts[k]))
  )
}

/**
 * Die Felder von `nachher`, deren Inhalt sich gegenüber `vorher` geändert hat
 * (`gleicherInhalt`) — leer, wenn sich nichts geändert hat. Eine Ebene tief:
 * Ein geändertes Feld geht ganz hinaus.
 */
export function geaenderteFelder<T extends object>(vorher: T, nachher: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(nachher).filter(([k, v]) => !gleicherInhalt(vorher[k as keyof T], v)),
  ) as Partial<T>
}
