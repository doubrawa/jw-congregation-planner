/** Was eine Function in einer Fehlerantwort mitschickt — die Felder, nach denen die App fragt. */
export interface FehlerAntwort {
  /** Der Grund als Kennung (`ungueltig`, `voll` …) oder eine Meldung für die Konsole. */
  error?: string
  /** Eine genauere Kennung, wo `error` ein Satz ist (Import: `sprache-fehlt`). */
  code?: string
  /** Import: Für diese Woche gibt es noch kein Programm. */
  ende?: boolean
}

/**
 * **Was eine Function zu einer Antwort mit Status ≠ 2xx sagt.**
 * `functions.invoke` meldet dann selbst nur einen festen englischen Satz und
 * legt die Antwort hinter `error.context`. Ohne lesbare Antwort — kein Netz,
 * kein JSON — bleibt `null`.
 *
 * Stand bis zum 16.10.2026 dreimal als Abschrift da: beim Import, bei den
 * Trolleys und beim Anmelden (Review, App #6).
 */
export async function fehlerAntwort(error: unknown): Promise<FehlerAntwort | null> {
  const antwort = (error as { context?: { json?: () => Promise<unknown> } } | null)?.context
  const body = await antwort?.json?.().catch(() => null)
  return body && typeof body === 'object' ? (body as FehlerAntwort) : null
}
