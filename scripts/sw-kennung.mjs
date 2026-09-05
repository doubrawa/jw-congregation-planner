/**
 * Die Stand-Kennung in den Service Worker eintragen.
 *
 * **Warum das einen Bauschritt braucht.** `public/` geht unverändert nach
 * `dist/` — Vites `define` erreicht die Datei nicht. Und der Worker braucht die
 * Kennung nicht bloß als Schmuck: Sein Cache-Name entscheidet, ob `activate`
 * aufräumt (es löscht jeden Cache mit *anderem* Namen), und `activate` läuft
 * überhaupt nur, wenn sich `sw.js` **selbst** geändert hat. Die Kennung im Namen
 * ist deshalb beides zugleich — der Grund fürs Aufräumen und sein Auslöser.
 *
 * Ohne sie hieß der Cache immer `shell-v1`: Es wurde nie etwas gelöscht, und
 * die gehashten Assets jedes Builds blieben unbegrenzt liegen. Irgendwann räumt
 * der Browser unter Speicherdruck die ganze Herkunft ab — samt der
 * Offline-Momentaufnahme im `localStorage`, also samt dem, wofür der Cache da
 * ist (V9).
 */

/** Steht im ausgelieferten `public/sw.js` und wird beim Bauen ersetzt. */
export const SW_PLATZHALTER = '__BUILD_ID__'

/**
 * Kennung in den Quelltext eintragen.
 *
 * Rein und ohne Datei-Zugriff, damit sie prüfbar ist. Fehlt der Platzhalter,
 * bleibt der Text unverändert — der Aufrufer erfährt es an der Rückgabe
 * `ersetzt`, statt dass es stillschweigend nichts täte.
 */
export function swMitKennung(quelle, kennung) {
  const ersetzt = quelle.includes(SW_PLATZHALTER)
  return { quelle: quelle.split(SW_PLATZHALTER).join(kennung), ersetzt }
}

/**
 * Nur Zeichen, die in einem Cache-Namen nicht stören.
 *
 * Der Name landet in der Cache-Storage-API und in Entwicklerwerkzeugen; ein
 * Datum mit Leerzeichen und Mittelpunkt („2026-09-05 · a1b2c3d") wäre dort nur
 * schwer zu lesen. Der Commit allein identifiziert den Stand ohnehin.
 */
export function alsCacheName(kennung) {
  return String(kennung).replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'unbekannt'
}
