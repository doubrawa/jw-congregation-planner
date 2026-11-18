/**
 * **Wie lange ein Toast steht** (T187): mindestens 4 s, je Zeichen 60 ms
 * dazu, höchstens 8 s. Eine feste Dauer von 2,4 s reichte für „Gespeichert",
 * aber nicht für „Nicht übernommen · für diesen Hilfsdienst wird kein Ersatz
 * mehr gesucht".
 */
export function toastDauer(text: string): number {
  return Math.min(8000, Math.max(4000, text.length * 60))
}
