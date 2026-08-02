import { useEffect, useRef, type RefObject } from 'react'

/**
 * Bottom-Sheet nach unten wischen zum Schließen.
 *
 * Nur auf dem Handy: ab 920 px ist das Sheet ein mittiges Fenster, dort ergibt
 * die Geste keinen Sinn. Der Schließen-Knopf bleibt überall erhalten — die
 * Geste kommt nur dazu (WCAG 2.5.1: nie der einzige Weg).
 *
 * Touch- statt Zeiger-Ereignisse, aus demselben Grund wie beim Wochenwischen
 * (ausführlich in useSwipeWeek.ts): Sobald die Bewegung nach unten geht, hält
 * der Browser sie für Scrollen, übernimmt die Geste und schickt
 * `pointercancel`. Ab da kommt kein `pointermove` mehr, und das Sheet bleibt
 * offen — egal wie weit der Finger noch zieht. Hier trifft das noch schneller
 * zu als beim Wochenwischen: nach unten ist genau die Richtung, die `pan-y`
 * dem Browser erlaubt. Die Touch-Ereignisse laufen weiter.
 *
 * Heikel ist die Abgrenzung zum Scrollen: im Zuteilungs-Sheet scrollt die
 * Kandidatenliste. Deshalb startet der Zug nur, wenn im angefassten Bereich
 * nichts nach oben zu scrollen ist (scrollTop === 0) — sonst gehört die
 * Bewegung der Liste.
 */
const DESKTOP = '(min-width: 920px)'
const START_PX = 8 // ab hier gilt es als Ziehen (darunter: Wackeln)
const CLOSE_PX = 90 // so weit gezogen: schließen
const FLING_PX = 32 // kürzer, aber schnell geworfen
const FLING_SPEED = 0.5 // px/ms

/** Nächster scrollbarer Vorfahr innerhalb des Sheets (oder null). */
function scrollableUnder(start: Element | null, root: Element): Element | null {
  let el: Element | null = start
  while (el && el !== root.parentElement) {
    if (el.scrollHeight > el.clientHeight + 1) return el
    el = el.parentElement
  }
  return null
}

export function useSwipeDown(ref: RefObject<HTMLElement | null>, onClose: () => void): void {
  // Über eine Ref: onClose ist bei jedem Render neu, würde die Handler sonst
  // mitten in einer Geste neu aufsetzen.
  const close = useRef(onClose)
  close.current = onClose

  useEffect(() => {
    const el = ref.current
    if (!el || window.matchMedia(DESKTOP).matches) return

    let aktiv = false
    let ziehen = false
    let startY = 0
    let startedAt = 0
    let dy = 0

    const setDrag = (px: number) => el.style.setProperty('--sheet-drag', `${px}px`)
    const reset = (animate: boolean) => {
      el.style.transition = animate ? 'transform 180ms ease-out' : ''
      setDrag(0)
      if (animate) window.setTimeout(() => (el.style.transition = ''), 200)
    }

    const onStart = (e: TouchEvent) => {
      if (aktiv || e.touches.length !== 1) return
      const scroller = scrollableUnder(e.target as Element, el)
      if (scroller && scroller.scrollTop > 0) return // gehört der Liste
      aktiv = true
      ziehen = false
      startY = e.touches[0].clientY
      startedAt = e.timeStamp
      dy = 0
      el.style.transition = ''
    }

    const onMove = (e: TouchEvent) => {
      if (!aktiv) return
      if (e.touches.length !== 1) {
        // Zweiter Finger dazu → Zoom, nicht ziehen.
        aktiv = false
        reset(true)
        return
      }
      dy = e.touches[0].clientY - startY
      if (!ziehen) {
        if (dy <= START_PX) return // nach oben oder noch zu wenig
        ziehen = true
      }
      // Scrollen unterbinden, solange der Browser es noch zulässt.
      if (e.cancelable) e.preventDefault()
      setDrag(dy)
    }

    const onEnd = (e: TouchEvent) => {
      if (!aktiv) return
      const gezogen = ziehen ? dy : 0
      const speed = gezogen / Math.max(1, e.timeStamp - startedAt)
      aktiv = false
      ziehen = false
      if (gezogen > CLOSE_PX || (gezogen > FLING_PX && speed > FLING_SPEED)) {
        reset(false)
        close.current()
      } else {
        reset(true)
      }
    }

    /* Vom System abgebrochen (Anruf, System-Geste): zurückfedern, nicht schließen. */
    const onCancel = () => {
      if (!aktiv) return
      aktiv = false
      ziehen = false
      reset(true)
    }

    // `passive: false` bei touchmove — ohne das darf preventDefault() nicht
    // greifen und die Seite scrollt beim Ziehen mit.
    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd)
    el.addEventListener('touchcancel', onCancel)
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('touchcancel', onCancel)
      el.style.removeProperty('--sheet-drag')
      el.style.transition = ''
    }
  }, [ref])
}
