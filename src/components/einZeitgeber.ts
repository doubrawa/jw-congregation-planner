/**
 * **Ein einziger Zeitgeber je Geste** — jeder neue löscht den alten, und das
 * Abmelden löscht ihn ebenfalls.
 *
 * Beide Wischgesten setzen nach einer Animation eine Aufräum-Frist, die die
 * Übergangsdauer wieder wegnimmt. Beide hatten dabei denselben Fehler, und
 * beide auf dieselbe Weise: Die Frist wurde nur **überschrieben**, nie
 * abgebrochen.
 *
 *  - Wer nach einem Zurückfedern sofort weiterwischt, bekommt den Aufräum-Schlag
 *    der vorigen Bewegung mitten in die neue: `transition` wird auf leer
 *    gesetzt, und was gleiten sollte, springt. Die 200 ms sind kürzer als eine
 *    zügige zweite Geste — es passiert also nicht selten, sondern regelmäßig.
 *  - Beim Abmelden konnte die Hülle nur die **zuletzt** gemerkte Frist
 *    abbrechen. Jede ältere lief weiter und griff auf ein Element zu, das
 *    längst aus dem Baum war.
 *
 * Repariert wurde das zunächst nur in `useSwipeWeek`; der Zwilling
 * `useSwipeDown` blieb liegen — obwohl beide sich das An- und Abmelden längst
 * teilen (`bindTouch`). Deshalb liegt die Frist jetzt ebenso hier: Es gibt
 * keine zweite Fassung mehr, die man vergessen kann.
 */
export interface Zeitgeber {
  /** Frist setzen — bricht eine noch laufende ab. */
  spaeter: (fn: () => void, ms: number) => void
  /** Laufende Frist abbrechen (auch aufzurufen, wenn keine läuft). */
  stoppen: () => void
}

export function einZeitgeber(): Zeitgeber {
  let timer: number | undefined
  const stoppen = (): void => {
    if (timer !== undefined) window.clearTimeout(timer)
    timer = undefined
  }
  return {
    stoppen,
    spaeter: (fn, ms) => {
      stoppen()
      timer = window.setTimeout(fn, ms)
    },
  }
}
