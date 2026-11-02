/**
 * **Ein Teil, einmal nachgeladen** — für die Wörterbücher (`ui.ts`) und die
 * Sprachnamen (`langnames.ts`). Fragen mehrere zugleich, teilen sie sich einen
 * Ladevorgang.
 *
 * Ein Fehlschlag wird nicht gemerkt: Bliebe die abgelehnte Zusage stehen,
 * bekäme jeder weitere Versuch dieselbe Ablehnung, bis die Seite neu lädt —
 * auch wenn das Netz längst zurück ist. Nach einem Wechsel auf Polnisch im
 * Funkloch bliebe die App so auf Englisch.
 */
export function einmalNachladen<K, T>(laufend: Map<K, Promise<T>>, schluessel: K, laden: () => Promise<T>): Promise<T> {
  let zusage = laufend.get(schluessel)
  if (!zusage) {
    zusage = laden().finally(() => laufend.delete(schluessel))
    laufend.set(schluessel, zusage)
  }
  return zusage
}
