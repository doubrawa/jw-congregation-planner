// =============================================================================
// Gerüst der REST-Attrappen in den Edge-Function-Tests
// =============================================================================
// Jede Function-Prüfung stellt `fetch` durch eine eigene Attrappe ruhig, und
// jede trug dieselben drei Hilfen für sich: eine JSON-Antwort bauen, einen
// Filterwert aus dem Pfad lesen, das Fragment abschneiden. Vier Abschriften von
// `jsonRes`, zwei von `filterWert` — und sie waren schon auseinander:
// `send-reminders` kennt keinen Status, und die jüngste Abschrift von
// `filterWert` kam **ohne** den Absatz an, der erklärt, warum die Attrappe
// Filter überhaupt auswertet. Ein Helfer, dessen Begründung beim Kopieren
// verlorengeht, wird beim nächsten Umbau als überflüssig gelöscht.
//
// Hier steht nur, was in jeder Prüfung gleich ist. Was eine Function eigens
// braucht (welche Tabelle was zurückgibt, der Zustand zwischen den Fällen),
// bleibt bei ihr — das ist der Gegenstand der Prüfung, nicht ihr Gerüst.
// =============================================================================

/** JSON-Antwort, wie PostgREST sie liefert. */
export function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/**
 * Wert eines `spalte=eq.…`-Filters aus dem Pfad, dekodiert — oder null.
 *
 * Die Attrappe wertet Filter aus, statt jede Tabelle pauschal auszugeben. Erst
 * dadurch kann ein fehlender oder abgeschnittener Filter im Test überhaupt
 * auffallen: Gäbe sie weiterhin alles zurück, sähe „Filter weg" genauso aus
 * wie „Filter da".
 */
export function filterWert(path: string, spalte: string): string | null {
  const m = new RegExp(`[?&]${spalte}=eq\\.([^&]*)`).exec(path)
  return m ? decodeURIComponent(m[1]) : null
}

/**
 * Pfad ohne Fragment.
 *
 * `fetch` bekommt hier immer eine Zeichenkette; ein rohes `#` darin ist genau
 * das, was der echte URL-Parser als Fragment abschneidet und **nie mitsendet**.
 * Damit der Test dieselbe Wirkung sieht wie der Server, wird hier ebenso
 * abgeschnitten — dadurch fällt ein nicht kodierter Filterwert überhaupt auf.
 */
export const ohneFragment = (input: unknown): string => String(input).split('#')[0] ?? ''

/**
 * Lesezugriff auf die mitgeschriebenen Schreib-Aufrufe.
 *
 * Die Liste wird je Fall neu gesetzt (`beforeEach`), deshalb kommt sie als
 * Funktion herein und nicht als Wert: Ein einmal übergebenes Array zeigte nach
 * dem ersten Zurücksetzen ins Leere.
 */
export function schreibZugriff<W extends { path: string; body: unknown }>(writes: () => W[]) {
  const writesTo = (table: string): W[] => writes().filter((w) => w.path.startsWith(table))
  return {
    writesTo,
    /** Die geschriebenen Zeilen einer Tabelle, Stapel aufgelöst. */
    zeilenIn: (table: string): Record<string, unknown>[] =>
      writesTo(table).flatMap(
        (w) => (Array.isArray(w.body) ? w.body : [w.body]) as Record<string, unknown>[],
      ),
  }
}
