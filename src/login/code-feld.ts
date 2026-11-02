import { CODE_LAENGE, codeGruppiert, codeNormal } from '../../supabase/functions/_shared/anmeldung.ts'

/**
 * **Das Feld für den Code vom Zettel** zeigt ihn so wie der Zettel: zwei
 * Gruppen zu vier Zeichen mit einer Lücke dazwischen. Die Lücke setzt das Feld
 * selbst, schon mit dem vierten Zeichen — so kommt niemand auf die Idee, sie
 * mitzutippen. Beim Löschen setzt es sie nicht, sonst ließe sie sich nicht
 * zurücknehmen. Was nicht zum Alphabet des Codes gehört, fällt heraus.
 */
export function codeImFeld(roh: string, loeschen: boolean): string {
  const gruppiert = codeGruppiert(roh)
  return !loeschen && gruppiert.length === CODE_LAENGE / 2 ? `${gruppiert} ` : gruppiert
}

/** Wie viele Zeichen des Codes vor der Schreibmarke stehen. */
export function zeichenVor(roh: string, stelle: number): number {
  return codeNormal(roh.slice(0, stelle)).length
}

/**
 * Wohin die Schreibmarke nach dem Umformen gehört: hinter dasselbe Zeichen des
 * Codes wie vorher. Folgt ihm nur noch die Lücke am Ende, kommt sie dahinter —
 * dort geht das Tippen weiter.
 */
export function stelleImFeld(text: string, zeichenDavor: number): number {
  let gezaehlt = 0
  for (let i = 0; i < text.length; i++) {
    if (gezaehlt === zeichenDavor) return text[i] === ' ' && i === text.length - 1 ? text.length : i
    if (text[i] !== ' ') gezaehlt++
  }
  return text.length
}
