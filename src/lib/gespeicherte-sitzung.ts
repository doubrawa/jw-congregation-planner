/**
 * **Die Sitzung, die supabase-js auf dem Gerät abgelegt hat**, gelesen, ohne
 * auf Supabase zu warten (19.10.2026).
 *
 * Jede Frage an supabase-js nach der Sitzung wartet, bis seine
 * Initialisierung durch ist: `getSession()` ebenso wie jede Datenabfrage, die
 * ihr Token über `_getAccessToken()` holt. Muss das Token dabei erneuert
 * werden, weil die letzte Nutzung über eine Stunde zurückliegt, geht das übers
 * Netz. Offline versucht auth-js 2.110.2 es 25 s lang (8 Versuche, gemessen);
 * hängt die Anfrage, ohne zu scheitern, wartet es, bis der Browser aufgibt.
 *
 * Der Provider will vorher wissen, ob ein Konto auf dem Gerät liegt, um dann
 * den letzten Stand zu zeigen statt der Anmeldung (`store.tsx`). Das liest er
 * hier, direkt aus dem Speicher.
 */

/**
 * Wo supabase-js die Sitzung ablegt: sein Standardschlüssel
 * (`sb-<projekt>-auth-token`, supabase-js 2.110.2). `lib/supabase.ts` gibt ihn
 * dem Client ausdrücklich mit, damit beide Seiten denselben lesen. Ein anderer
 * Wert meldete jeden ab, der gerade angemeldet ist.
 */
export function sitzungsSchluessel(supabaseUrl: string): string {
  return `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`
}

const url = import.meta.env.VITE_SUPABASE_URL

/** Der Schlüssel dieser Umgebung; leer ohne Datenbank. */
export const SITZUNG_SCHLUESSEL = url ? sitzungsSchluessel(url) : ''

/** Was der Provider vorab wissen muss: wem die Sitzung gehört und wann ihr Token abläuft. */
export interface GespeicherteSitzung {
  userId: string
  /** Ablauf des Zugangs-Tokens in Millisekunden (abgelegt ist `expires_at` in Sekunden). */
  laeuftAb: number
}

type Abgelegt = { access_token: string; refresh_token: string; expires_at: number; user: { id: string } }

/** Eine Sitzung, wie auth-js sie gelten lässt (`_isValidSession`), dazu die Kennung des Kontos. */
function istSitzung(wert: unknown): wert is Abgelegt {
  const s = wert as Partial<Abgelegt> | null
  return (
    typeof s?.access_token === 'string' &&
    typeof s.refresh_token === 'string' &&
    typeof s.expires_at === 'number' &&
    typeof s.user?.id === 'string'
  )
}

/**
 * Die abgelegte Sitzung, oder `null`. Ohne eigenen Benutzerspeicher
 * (`userStorage`, hier nicht eingerichtet) steht das Konto im selben Eintrag.
 * Was nicht passt, gilt nicht als Sitzung; gelöscht wird hier nichts, das
 * bleibt auth-js überlassen.
 */
export function gespeicherteSitzung(schluessel = SITZUNG_SCHLUESSEL): GespeicherteSitzung | null {
  if (!schluessel) return null
  try {
    const abgelegt: unknown = JSON.parse(localStorage.getItem(schluessel) ?? 'null')
    return istSitzung(abgelegt) ? { userId: abgelegt.user.id, laeuftAb: abgelegt.expires_at * 1000 } : null
  } catch {
    // Kein Speicher (privater Modus, gesperrt) oder kein JSON.
    return null
  }
}

/**
 * So knapp vor dem Ablauf erneuert auth-js ein Token schon (`EXPIRY_MARGIN_MS`
 * in auth-js 2.110.2). Exportiert wird es dort nicht; die Probe vergleicht mit
 * dem Paket, damit ein Update es nicht still verschiebt.
 */
export const ERNEUERN_VOR_MS = 90_000

/**
 * Erneuert auth-js das Token, bevor es antwortet? Ja, wenn es in weniger als
 * `ERNEUERN_VOR_MS` abläuft; dann geht die erste Frage nach der Sitzung übers
 * Netz. Sonst antwortet es sofort aus dem Speicher.
 */
export function mussErneuern(sitzung: GespeicherteSitzung, jetzt = Date.now()): boolean {
  return sitzung.laeuftAb - jetzt < ERNEUERN_VOR_MS
}
