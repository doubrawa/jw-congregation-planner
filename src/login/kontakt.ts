/**
 * Der Weg zum Betreiber, wenn eine **neue Versammlung** die App nutzen will
 * (T113).
 *
 * Eine Versammlung legt allein der Betreiber an
 * (`scripts/versammlung-anlegen.mjs`). Wer die Anmeldeseite ohne Einladung
 * aufruft, braucht deshalb eine Adresse, an die er schreiben kann.
 *
 * Sie steht **genau hier** und nirgends sonst — nicht in den Wörterbüchern, wo
 * sie 34-mal stünde und beim nächsten Wechsel auseinanderliefe.
 * `kontakt.test.ts` hält das fest. Im Klartext mit Absicht: Als Autor jedes
 * Commits ist sie ohnehin öffentlich, ein Verstecken im Bündel schützte nichts.
 */
export const KONTAKT_MAIL = 'doubrawa@gmx.de'

/**
 * `mailto:`-Verweis mit vorbelegtem Betreff in der Sprache des Lesers, damit
 * die Anfrage im Posteingang als solche auffällt.
 *
 * Der Betreff wird kodiert: Leerzeichen, Doppelpunkt und fremde Schrift
 * („新会众：…") zerbrächen den Verweis sonst, und ein `&` oder `#` in einer
 * Übersetzung schnitte ihn still ab.
 */
export function kontaktVerweis(betreff: string): string {
  return `mailto:${KONTAKT_MAIL}?subject=${encodeURIComponent(betreff)}`
}
