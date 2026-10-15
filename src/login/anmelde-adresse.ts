import { codeAus, tokenAus } from '../../supabase/functions/_shared/anmeldung.ts'

/**
 * **Was die Adresse zum Anmelden mitbringt** (T121, Phase 8): das Token aus dem
 * Link der E-Mail (`#anmelden=…`) oder den Code aus dem QR-Code des Zettels
 * (`#code=…`), gescannt mit der Kamera des Handys.
 *
 * Einmal gelesen, beim ersten Fragen — und dann aus der Adresse genommen: Ein
 * Neuladen soll nicht noch einmal anmelden, und in der Leiste des Browsers soll
 * nicht stehen bleiben, womit man hereinkommt. Gefragt wird zweimal: von
 * `store.tsx` (der Link meldet gleich an) und von der Anmeldeseite (der Code
 * füllt das Feld, angemeldet wird erst auf den Knopf).
 */
interface AnmeldeAdresse {
  token: string | null
  code: string | null
}

let gelesen: AnmeldeAdresse | null = null

export function anmeldeAdresse(): AnmeldeAdresse {
  if (gelesen) return gelesen
  const hash = globalThis.location?.hash ?? ''
  gelesen = { token: tokenAus(hash), code: codeAus(hash) }
  if (gelesen.token || gelesen.code) {
    // Den Zustand des Eintrags behalten (`useBackDismiss`), wie bei `#go=`.
    history.replaceState(history.state, '', location.pathname + location.search)
  }
  return gelesen
}

/** Der Code ist verbraucht (angemeldet oder verworfen) — beim nächsten Öffnen der Seite steht er nicht mehr da. */
export function anmeldeCodeVerbraucht(): void {
  if (gelesen) gelesen = { ...gelesen, code: null }
}

/** Nur für Tests: die Adresse beim nächsten Fragen neu lesen. */
export function anmeldeAdresseVergessen(): void {
  gelesen = null
}
