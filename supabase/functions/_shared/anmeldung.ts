// =============================================================================
// Geteilt: Anmelden per Link (T121, Phase 8)
// =============================================================================
// Ein Kennwort gibt es nicht mehr. Wer in die App soll, bekommt vom Admin einen
// **Link** — per E-Mail oder auf einem Zettel mit QR-Code und einem Code zum
// Eintippen. Ein Tipp darauf, und man ist angemeldet; das Gerät bleibt es.
//
// Hier steht, was die Functions (`send-invite` stellt aus, `anmelden` löst ein)
// und die App (liest `#anmelden=` aus der Adresse, nimmt den getippten Code
// an) gleich rechnen müssen — rein, ohne Netz und ohne `Deno`.
//
// **Gespeichert werden nur Prüfsummen.** Token und Code stehen im Klartext
// allein im Link und auf dem Zettel; die Datenbank kennt ihren SHA-256. Wer die
// Tabelle liest, kann sich damit nicht anmelden — und lesen darf sie ohnehin
// nur der Dienstschlüssel (die Spalten sind für die App gesperrt, siehe
// `anmelde_links` in `schema.sql`): Die 40 Bit des Codes hielten einem Angriff
// auf die Prüfsumme nicht lange stand.
// =============================================================================

/**
 * So lange gilt ein Link: ein Jahr (Entscheid des Betreibers, 31.10.2026; bis
 * dahin 30 Tage). Mit dem Zettel meldet man sich in dieser Zeit jederzeit selbst
 * wieder an — ein Kennwort gibt es nicht, und ohne E-Mail-Adresse auch kein
 * „Link senden" auf der Anmeldeseite. Ein neuer Link ersetzt ihn sofort.
 */
export const LINK_TAGE = 365

/** Der Name, unter dem der Link sein Token in der Adresse trägt: `…/#anmelden=<token>`. */
export const LINK_PARAMETER = 'anmelden'

/**
 * Die Zeichen des Codes: ohne 0/O und 1/I, die man auf Papier verwechselt.
 * 32 Zeichen teilen die 256 Byte-Werte glatt — der Zufall bleibt gleichverteilt.
 */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

/** Länge des Codes zum Eintippen: 8 Zeichen, 40 Bit. Angezeigt als `XXXX-XXXX`. */
export const CODE_LAENGE = 8

/** Ein neuer Code zum Eintippen, ohne Trennstrich. */
export function neuerCode(): string {
  const bytes = new Uint8Array(CODE_LAENGE)
  crypto.getRandomValues(bytes)
  return [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('')
}

/** Ein neues Link-Token: 32 Zufallsbytes, base64url (43 Zeichen, ohne `=`). */
export function neuesToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  let roh = ''
  for (const b of bytes) roh += String.fromCharCode(b)
  return btoa(roh).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Was jemand eintippt, so, wie es gespeichert ist: groß, ohne Trennstriche und
 * Leerzeichen. Was nicht ins Alphabet gehört, fällt heraus — ein „0" statt „O"
 * findet so zwar keinen Code, wirft aber auch nichts.
 */
export function codeNormal(eingabe: string): string {
  return eingabe
    .toUpperCase()
    .split('')
    .filter((z) => ALPHABET.includes(z))
    .join('')
}

/** Der Code zum Lesen: `K7RD2QWM` → `K7RD-2QWM`. */
export function codeAnzeige(code: string): string {
  const c = codeNormal(code)
  return c.length === CODE_LAENGE ? `${c.slice(0, 4)}-${c.slice(4)}` : c
}

/** Ist das ein vollständiger Code? (Prüft die Form, nicht ob es ihn gibt.) */
export function codeVollstaendig(eingabe: string): boolean {
  return codeNormal(eingabe).length === CODE_LAENGE
}

/** SHA-256 als Hex — die Form, in der Token und Code in der Datenbank stehen. */
export async function pruefsumme(text: string): Promise<string> {
  const daten = new TextEncoder().encode(text)
  const summe = new Uint8Array(await crypto.subtle.digest('SHA-256', daten))
  return [...summe].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Der Name, unter dem der QR-Code des Zettels seinen Code trägt: `…/#code=<code>`. */
export const CODE_PARAMETER = 'code'

/** Die App-Adresse ohne Fragment. */
function basisVon(appUrl: string): string {
  return appUrl.split('#')[0] ?? appUrl
}

/**
 * Der Link in der E-Mail. Das Token steht hinter `#`: Es geht nie an einen
 * Server mit, auch nicht in dessen Protokolle.
 */
export function anmeldeUrl(appUrl: string, token: string): string {
  return `${basisVon(appUrl)}#${LINK_PARAMETER}=${token}`
}

/**
 * Die Adresse im QR-Code des Zettels: mit dem **Code**, nicht mit dem Token.
 * Beides steht ohnehin auf demselben Zettel, und über den Code zeigt die App
 * erst, wem er gehört, bevor sie anmeldet (`pruefen` in `anmelden`) — wer den
 * Zettel eines anderen erwischt, merkt es.
 *
 * Hier stand bis zum 16.10.2026 außerdem, der Zettel überstehe ein „Link
 * senden" auf der Anmeldeseite. Das gilt seit dem 15.10.2026 nicht mehr: Die
 * Mail trägt den Code, also bringt jeder neue Link auch einen neuen, und der
 * Zettel gilt danach nicht mehr (Entscheid des Betreibers).
 */
export function codeUrl(appUrl: string, code: string): string {
  return `${basisVon(appUrl)}#${CODE_PARAMETER}=${codeNormal(code)}`
}

/** Ein Wert aus dem Fragment einer Adresse (`#name=wert&…`). */
function fragmentWert(hash: string, name: string): string | null {
  const roh = hash.startsWith('#') ? hash.slice(1) : hash
  for (const teil of roh.split('&')) {
    const [n, w] = teil.split('=')
    if (n === name && w) return w
  }
  return null
}

/** Das Token aus einer Adresse (`#anmelden=…`) — `null`, wenn keins darin steht. */
export function tokenAus(hash: string): string | null {
  const wert = fragmentWert(hash, LINK_PARAMETER)
  return wert && /^[A-Za-z0-9_-]{20,}$/.test(wert) ? wert : null
}

/** Der Code aus einer Adresse (`#code=…`, der QR-Code des Zettels) — `null`, wenn keiner darin steht. */
export function codeAus(hash: string): string | null {
  const wert = fragmentWert(hash, CODE_PARAMETER)
  return wert && codeVollstaendig(wert) ? codeNormal(wert) : null
}

/**
 * Bis wann ein Link gilt, der jetzt ausgestellt wird — als ISO-Zeitpunkt.
 * Gezählt in vollen Tagen ab jetzt.
 */
export function gueltigBis(jetzt: Date = new Date()): string {
  return new Date(jetzt.getTime() + LINK_TAGE * 864e5).toISOString()
}

/**
 * Die Anmeldeadresse eines Kontos, das zu keiner echten E-Mail gehört.
 *
 * Supabase braucht je Konto eine Kennung; ein Kennwort hat keins dieser Konten,
 * angemeldet wird nur über den Link. Die echte Adresse der Person (falls es eine
 * gibt) dient allein dem Versand des Links — so kann sie fehlen, sich ändern
 * oder von zweien geteilt werden, ohne dass ein Konto daran hängt.
 *
 * `.invalid` ist reserviert (RFC 2606): An diese Adressen geht nie etwas hinaus.
 */
export function interneAdresse(kontoId: string): string {
  return `${kontoId}@konten.invalid`
}
