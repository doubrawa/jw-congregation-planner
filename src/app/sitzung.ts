/**
 * **Die laufende Sitzung**, gezählt (16.10.2026). Jedes Abmelden beginnt eine
 * neue (`sitzungBeendet`, vom Provider beim `logout`).
 *
 * Ein Laden, das beim Abmelden noch unterwegs ist, spielt danach nichts mehr
 * ein und legt keine Momentaufnahme ab (`hydrate.ts`). Bis dahin tat es beides:
 * Der eben geleerte Zustand bekam die Daten des Abgemeldeten zurück, und die
 * gelöschte Momentaufnahme stand wieder im Speicher des Geräts.
 *
 * Ein eigenes Modul, kein Teil von `hydrate.ts`: Die Proben ersetzen das Laden
 * gern durch eine Attrappe, der Zähler soll dabei echt bleiben.
 */
let sitzung = 0

export function aktuelleSitzung(): number {
  return sitzung
}

export function sitzungBeendet(): void {
  sitzung++
}
