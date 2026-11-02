/**
 * **Der Gerätespeicher, der nie wirft** — für Vorlieben und einfache Merker.
 *
 * `localStorage` wirft, wo der Browser ihn sperrt (Safari mit gesperrten
 * Website-Daten, manche eingebettete Ansicht), und `setItem` zusätzlich, wenn
 * das Kontingent erschöpft ist. Beim Start hieße das eine leere Seite. Hier
 * genügt weniger: Das Gerät merkt sich dann nichts, und die App läuft mit den
 * Vorgaben weiter; ohne Speicher liegt dort auch nichts zu vergessen.
 *
 * Die Momentaufnahme (`snapshot.ts`) und das Lesen der abgelegten Sitzung
 * (`gespeicherte-sitzung.ts`) fangen selbst ab — dort ist auch ein unlesbarer
 * Eintrag abzufangen, nicht nur ein fehlender Speicher.
 */

/** Der gemerkte Wert, oder `null` — auch, wenn es keinen Speicher gibt. */
export function gemerkt(schluessel: string): string | null {
  try {
    return localStorage.getItem(schluessel)
  } catch {
    return null
  }
}

/** Auf dem Gerät merken; ohne Speicher gilt die Wahl bis zum Neuladen. */
export function merken(schluessel: string, wert: string): void {
  try {
    localStorage.setItem(schluessel, wert)
  } catch {
    // Gesperrt oder voll — nichts zu tun, die App läuft weiter.
  }
}

/** Vom Gerät nehmen. */
export function vergessen(schluessel: string): void {
  try {
    localStorage.removeItem(schluessel)
  } catch {
    // Gesperrt — dann liegt dort auch nichts.
  }
}
