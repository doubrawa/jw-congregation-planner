/**
 * Programm-Fragment-Übersetzer — die Sicht des Clients.
 *
 * **Der Übersetzer selbst liegt in `supabase/functions/_shared/i18n/`.** Nicht,
 * weil er dorthin gehörte, sondern weil er an **zwei** Stellen gebraucht wird:
 * beim Anzeigen (hier) und beim Verschicken einer Push-Erinnerung
 * (`send-reminders`). Ein Push ist fertiger Text, sobald er das Gerät erreicht —
 * dort lässt sich nichts mehr übersetzen, und die Edge-Laufzeit kommt nicht an
 * `src/` heran. Vorher ging deshalb der Rumpf jeder Erinnerung kanonisch
 * deutsch hinaus, während ihr Titel längst übersetzt wurde.
 *
 * Diese Datei ist die **einzige** Zutat, die der Client hinzufügt: den Typ.
 * `Lang` wohnt in `src/data/types.ts` und kann drüben nicht bekannt sein; hier
 * wird die Signatur wieder eng gezogen, damit ein Tippfehler im Sprachcode
 * auffällt wie bisher. Es gibt **keine zweite Abschrift** der Wörterbücher.
 */

import type { Lang } from '../data/types'
import { makeTr as makeTrShared } from '../../supabase/functions/_shared/i18n/translate.ts'

export { bibelbuecherLaden } from '../../supabase/functions/_shared/i18n/translate.ts'

/** Übersetzer für eine App-Sprache; `de` liefert die Identität. */
export function makeTr(code: Lang): (s: string) => string {
  return makeTrShared(code)
}
