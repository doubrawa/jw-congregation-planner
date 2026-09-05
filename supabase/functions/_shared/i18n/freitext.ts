/**
 * **Freitext, den kein Übersetzer anfassen darf** — Personennamen.
 *
 * Mitteilungen stehen kanonisch deutsch in der Datenbank; übersetzt wird erst
 * beim Anzeigen, und zwar Atom für Atom entlang der „ · “-Grenzen
 * (`buildTranslator`). Der Rumpf einer Mitteilung mischt dabei drei Welten:
 * eine Rolle oder einen Dienstnamen (Wörterbuch), einen Termin (Wörterbuch)
 * und den **Namen einer Person** (Freitext). Für den Übersetzer sehen alle drei
 * gleich aus.
 *
 * Das ging schief, und nicht selten: Sehr viele Bibelbücher heißen wie ein
 * Vorname — Daniel, Markus, Ruth, Titus, Judas, Hiob. Die Buch-Regel verlangt
 * seit T103 eine Ziffer hinter dem Namen, was Schriftstellen von Namen trennt
 * — bis auf die Schreibweise, mit der diese App **Doppelnamen** unterscheidet
 * (`displayName`: „Josef Mayer 1“). Aus „Markus 2“ wurde in englischer
 * Oberfläche „Mark 2“, in koreanischer „마가복음 2“. Und die Wörterbuch-Treffer
 * davor greifen genauso: Wer „Ton“ heißt, hieße dort „Sound“.
 *
 * Keine Textregel kann das lösen — die Auskunft „das ist ein Name“ hat nur,
 * wer den Rumpf **baut**. Also wird sie mitgeschickt.
 *
 * **Wie**: Der Name wird in ein Bidi-Isolat gefasst (U+2068 FSI … U+2069 PDI).
 * Zwei Gründe für ausgerechnet diese Zeichen:
 *
 *  - Sie sind unsichtbar — sie stehen in der Datenbank, gehen im Push mit
 *    hinaus und erscheinen nirgends auf dem Bildschirm.
 *  - Sie sind ohnehin das Richtige: Ein arabischer Name mitten in einem
 *    deutschen Satz lief bisher in die Umsortierung des Absatzes hinein. Das
 *    Isolat ist genau dafür da.
 *
 * Bestandszeilen tragen die Marke nicht und verhalten sich wie bisher; sie
 * verschwinden mit dem Ladefenster von selbst.
 *
 * Eigenes Modul, weil es beide Seiten brauchen: die Edge Functions beim Bauen
 * und der Client beim Anzeigen. Es hängt an nichts — `substitute` kann es
 * mitnehmen, ohne die Wörterbücher des Übersetzers mitzuladen.
 */

const AUF = '⁨' // FIRST STRONG ISOLATE
const ZU = '⁩' // POP DIRECTIONAL ISOLATE

/**
 * Einen Namen als unübersetzbar kennzeichnen. Leeres bleibt leer — eine Marke
 * um nichts wäre ein Atom, das es nicht gibt.
 */
export function alsFreitext(s: string): string {
  return s ? `${AUF}${s}${ZU}` : s
}

/** Ist dieses Atom gekennzeichneter Freitext? */
export function istFreitext(s: string): boolean {
  return s.startsWith(AUF) && s.endsWith(ZU) && s.length > AUF.length + ZU.length
}

/** Die Marke wieder abnehmen (der Übersetzer gibt den Namen unverändert weiter). */
export function ohneMarke(s: string): string {
  return istFreitext(s) ? s.slice(AUF.length, -ZU.length) : s
}

/**
 * **Sicherheitsnetz**: jede Marke abnehmen, wo immer sie steht.
 *
 * Der Übersetzer prüft Atom für Atom — aber eine Regel kann ein Atom samt
 * eingebettetem Namen verschlucken, bevor es zur Teilung kommt. „Bibellesung ·
 * Jeremia 32 — <Name>“ etwa trifft die Buch-Regel im **zweiten** Atom und wird
 * als Ganzes ersetzt; der Name bleibt darin unangetastet (genau richtig), nur
 * seine Marke käme mit heraus. Unsichtbar ist sie zwar, aber sie hat im DOM
 * nichts verloren — und wer den Text vergleicht, stolperte darüber.
 *
 * Deshalb geht sie am Ende jeder Übersetzung noch einmal pauschal herunter.
 */
export function ohneAlleMarken(s: string): string {
  return s.split(AUF).join('').split(ZU).join('')
}
