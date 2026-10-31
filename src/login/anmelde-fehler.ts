import type { Dict } from '../i18n/ui'
import type { AnmeldeFehler } from '../lib/anmelden'

/**
 * Der Satz zu jedem Grund, an dem eine Anmeldung scheitert — beim
 * Anmelde-Link (`store.tsx`) wie beim Code vom Zettel (Anmeldeseite). Ein unbekannter
 * und ein abgelaufener Link heißen gleich: Für den, der ihn öffnet, ist beides
 * dasselbe, er braucht einen neuen.
 */
export function anmeldeFehlerText(fehler: AnmeldeFehler, t: Dict, wie: 'link' | 'code'): string {
  if (fehler === 'zu-viele') return t.zuVieleVersuche
  if (fehler === 'abgelaufen') return wie === 'code' ? t.codeAbgelaufen : t.linkUngueltig
  if (fehler === 'ungueltig') return wie === 'code' ? t.codeUnbekannt : t.linkUngueltig
  return t.anmeldenFehler
}
