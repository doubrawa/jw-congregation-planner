import type { Dict } from '../i18n/ui'
import type { AuthFehler } from '../lib/supabase'

/**
 * Anmeldefehler in Worte fassen — in der eingestellten App-Sprache.
 *
 * Die Anbindungsschicht (lib/supabase.ts) ordnet den Fehler nur ein; sie läuft
 * vor der Anmeldung und hat keinen Zugriff auf den Zustand. Erst hier, wo das
 * Wörterbuch bekannt ist, entsteht der Text. Meldungen, die Supabase selbst
 * schickt und die wir nicht kennen, werden unverändert durchgereicht — lieber
 * eine fremdsprachige Originalmeldung als gar keine Auskunft.
 */
export function authFehlerText(fehler: AuthFehler, t: Dict): string {
  return 'key' in fehler ? t[fehler.key] : fehler.text
}
