/**
 * Die vier Touch-Ereignisse einer Wischgeste an- und wieder abmelden.
 *
 * Klein, aber die Stelle, an der es auf echten Geräten weh tut: `touchmove`
 * MUSS `passive: false` sein, sonst darf `preventDefault()` das Scrollen nicht
 * stoppen und der Inhalt rutscht beim Wischen mit. `touchstart` bleibt bewusst
 * passiv — dort wird nie abgebrochen, und passiv erspart dem Browser das
 * Warten auf den Handler.
 *
 * Beide Wischgesten (Woche blättern, Sheet schließen) hatten diesen Block
 * wortgleich doppelt. Beim Umstieg von Zeiger- auf Touch-Ereignisse musste er
 * deshalb zweimal nachgezogen werden — genau die Art Arbeit, die man einmal
 * vergisst.
 */
export interface TouchHandler {
  start: (e: TouchEvent) => void
  move: (e: TouchEvent) => void
  end: (e: TouchEvent) => void
  cancel: (e: TouchEvent) => void
}

/** Meldet an und gibt die Abmelde-Funktion zurück. */
export function bindTouch(el: HTMLElement, h: TouchHandler): () => void {
  el.addEventListener('touchstart', h.start, { passive: true })
  el.addEventListener('touchmove', h.move, { passive: false })
  el.addEventListener('touchend', h.end)
  el.addEventListener('touchcancel', h.cancel)
  return () => {
    el.removeEventListener('touchstart', h.start)
    el.removeEventListener('touchmove', h.move)
    el.removeEventListener('touchend', h.end)
    el.removeEventListener('touchcancel', h.cancel)
  }
}
