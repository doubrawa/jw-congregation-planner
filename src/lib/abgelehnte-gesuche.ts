import type { SubstituteReq } from '../data/types'

/**
 * **Ersatzgesuche, auf die das Konto „Nein, danke" gesagt hat** (1.11.2026),
 * als Kennungen (`gesuchKennung`).
 *
 * Bis dahin kannte das Blatt beim Öffnen nur „Später", und das legt es beim
 * nächsten Öffnen wieder vor. Wer nicht einspringen konnte, wurde bis zum
 * Termin bei jedem Laden gefragt. Abgelehnt fällt das Gesuch aus dem Blatt;
 * unter „Freie Plätze" steht es weiter, wer es sich anders überlegt, übernimmt
 * es dort.
 *
 * **Am Konto, nicht am Gerät** (Tabelle `abgelehnte_gesuche`): Für ein paar
 * Stunden stand die Antwort nur im Speicher des Geräts, und am Tablet fragte
 * das Blatt, was am Handy schon beantwortet war. Lesen kann sie nur das Konto
 * selbst — sie ändert für niemanden sonst etwas, gesucht wird weiter.
 */
export type AbgelehnteGesuche = readonly string[]

/**
 * Welcher Platz, für wen.
 *
 * **Mit dem Absagenden**: Teilt der Planer den Platz jemand anderem zu und sagt
 * der auch ab, ist das ein neues Gesuch und liegt wieder vor. Zieht derselbe
 * seine Absage zurück und sagt erneut ab, bleibt es abgelehnt.
 *
 * Als JSON, damit kein Trennzeichen in Schlüssel oder Namen zwei Gesuche
 * verwechseln kann.
 */
export function gesuchKennung(req: Pick<SubstituteReq, 'key' | 'declinedBy'>): string {
  return JSON.stringify([req.key, req.declinedBy])
}
