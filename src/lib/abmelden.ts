/**
 * **Abmelden** — vom Knopf im Profil und auf der Statusseite (`AbmeldenKnopf`).
 *
 * Stand bis zum 16.10.2026 in `lib/supabase.ts`. Hier, weil es seitdem auch das
 * Push-Abo des Geräts löst (`push-abo.ts`), und das schreibt selbst in die
 * Datenbank — aus `supabase.ts` heraus wäre das ein Kreis der Importe.
 */

import type { Dispatch } from 'react'
import type { AppAction } from '../app/context'
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
 */
export function performLogout(dispatch: Dispatch<AppAction>): void {
  dispatch({ type: 'logout' })
  void sitzungBeenden()
}

async function sitzungBeenden(): Promise<void> {
  if (!supabase) return
  try {
    await pushAboLoesen()
  } catch (err) {
    // Ein Abo, das sich nicht lösen lässt, hält das Abmelden nicht auf.
    console.error('[abmelden] Push-Abo', err)
  }
  // Was `logout` eben noch hinausgeschickt hat (`persist`), braucht die
  // Sitzung bis zur Antwort — ohne sie wiese die Datenbank es ab (RLS).
  await schreibenAbwarten()
  await supabase.auth.signOut({ scope: 'local' })
}
