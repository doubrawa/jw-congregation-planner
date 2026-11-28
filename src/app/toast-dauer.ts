/**
 * **Wie lange ein Toast steht** (T187): mindestens 4 s, je Zeichen 60 ms
 * dazu, höchstens 8 s. Eine feste Dauer von 2,4 s reichte für „Gespeichert",
 * aber nicht für „Nicht übernommen · für diesen Hilfsdienst wird kein Ersatz
 * mehr gesucht".
 *
 * Trägt er einen Knopf („Rückgängig"), steht er 10 s: lesen, verstehen, was
 * der Knopf zurücknimmt, und ihn treffen — auch mit unsicherer Hand.
 */
export function toastDauer(text: string, mitHandlung = false): number {
  if (mitHandlung) return 10_000
  return Math.min(8000, Math.max(4000, text.length * 60))
}
