/**
 * **Abmelden** — vom Knopf im Profil und auf der Statusseite (`AbmeldenKnopf`).
 *
 * Stand bis zum 16.10.2026 in `lib/supabase.ts`. Hier, weil es seitdem auch das
 * Push-Abo des Geräts löst (`push-abo.ts`), und das schreibt selbst in die
 * Datenbank — aus `supabase.ts` heraus wäre das ein Kreis der Importe.
 */

import type { Dispatch } from 'react'
import type { AppAction } from '../app/context'
import { sitzungVergessen } from './gespeicherte-sitzung'
import { pushAboLoesen } from './push-abo'
import { schreibenAbwarten } from './schreiben-unterwegs'
import { supabase } from './supabase'

/**
 * Die Ansicht geht sofort zurück auf die Anmeldung (`logout` leert den
 * Bestand). Die Sitzung endet erst danach, wenn das Push-Abo gelöst ist: Die
 * eigene Zeile löschen darf nur, wer noch angemeldet ist (RLS).
 *
 * **Nur auf diesem Gerät** (`scope: 'local'`). Ohne Angabe meldet supabase-js
 * **global** ab, also jede Sitzung des Kontos auf jedem Gerät. Wer sich am
 * Tablet im Saal abmeldete, flog spätestens nach einer Stunde auch am eigenen
 * Handy hinaus. Ohne Kennwort kommt man dort nur mit einem neuen Link wieder
 * hinein, und der macht den alten samt Zettel ungültig (16.10.2026).
 *
 * `keineVersammlung`: Nicht der Nutzer meldet ab, sondern das Laden — das Konto
 * gehört keiner Versammlung mehr an (`hydrate.ts`). Die Anmeldung sagt es.
 */
export function performLogout(dispatch: Dispatch<AppAction>, { keineVersammlung = false }: { keineVersammlung?: boolean } = {}): void {
  dispatch({ type: 'logout', ...(keineVersammlung ? { keineVersammlung: true as const } : {}) })
  void sitzungBeenden()
}

/**
 * Wie lange das Abmelden höchstens auf das Netz wartet, bevor die App die
 * Sitzung selbst vom Gerät nimmt. Offline wartet auth-js bei jedem der Schritte
 * bis zu 25 s auf ein neues Token (`gespeicherte-sitzung.ts`). So lange bliebe
 * die Sitzung liegen, und wer die App inzwischen schließt, wäre beim nächsten
 * Öffnen wieder angemeldet. Was bis dahin losging, trägt sein Token schon; was
 * erst danach losginge, nähme die Datenbank nicht mehr an — offline ginge es
 * ohnehin nicht hinaus.
 */
const NETZ_FRIST_MS = 5000

async function sitzungBeenden(): Promise<void> {
  if (!supabase) return
  const frist = setTimeout(sitzungVergessen, NETZ_FRIST_MS)
  try {
    try {
      await pushAboLoesen()
    } catch (err) {
      // Ein Abo, das sich nicht lösen lässt, hält das Abmelden nicht auf.
      console.error('[abmelden] Push-Abo', err)
    }
    // Was `logout` eben noch hinausgeschickt hat (`persist`), braucht die
    // Sitzung bis zur Antwort — ohne sie wiese die Datenbank es ab (RLS).
    await schreibenAbwarten()
    const { error } = await supabase.auth.signOut({ scope: 'local' })
    // Offline mit abgelaufenem Token bleibt die Sitzung sonst auf dem Gerät.
    if (error) {
      console.error('[abmelden]', error.message)
      sitzungVergessen()
    }
  } finally {
    clearTimeout(frist)
  }
}
