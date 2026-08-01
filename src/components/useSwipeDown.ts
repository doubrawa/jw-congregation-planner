import { useEffect, useRef, type RefObject } from 'react'

/**
 * Bottom-Sheet nach unten wischen zum Schließen.
 *
 * Nur auf dem Handy: ab 920 px ist das Sheet ein mittiges Fenster, dort ergibt
 * die Geste keinen Sinn. Der Schließen-Knopf bleibt überall erhalten — die
 * Geste kommt nur dazu (WCAG 2.5.1: nie der einzige Weg).
 *
 * Heikel ist die Abgrenzung zum Scrollen: im Zuteilungs-Sheet scrollt die
 * Kandidatenliste. Deshalb startet der Zug nur, wenn im angefassten Bereich
 * nichts nach oben zu scrollen ist (scrollTop === 0) — sonst gehört die
 * Bewegung der Liste.
 */
const DESKTOP = '(min-width: 920px)'
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
  // Über eine Ref: onClose ist bei jedem Render neu, würde die Zeiger-Handler
  // sonst mitten in einer Geste neu aufsetzen.
  const close = useRef(onClose)
  close.current = onClose

  useEffect(() => {
    const el = ref.current
    if (!el || window.matchMedia(DESKTOP).matches) return

    let id: number | null = null
    let startY = 0
    let startedAt = 0
    let dy = 0

    const setDrag = (px: number) => el.style.setProperty('--sheet-drag', `${px}px`)
    const reset = (animate: boolean) => {
      el.style.transition = animate ? 'transform 180ms ease-out' : ''
      setDrag(0)
      if (animate) window.setTimeout(() => (el.style.transition = ''), 200)
    }

    const onDown = (e: PointerEvent) => {
      if (id !== null || !e.isPrimary) return
      const scroller = scrollableUnder(e.target as Element, el)
      if (scroller && scroller.scrollTop > 0) return // gehört der Liste
      id = e.pointerId
      startY = e.clientY
      startedAt = e.timeStamp
      dy = 0
      el.style.transition = ''
    }

    const onMove = (e: PointerEvent) => {
      if (e.pointerId !== id) return
      dy = e.clientY - startY
      if (dy <= 0) {
        setDrag(0)
        return
      }
      // Ab einer klaren Bewegung den Zeiger übernehmen, damit die Liste
      // darunter nicht gleichzeitig scrollt.
      if (dy > 6 && !el.hasPointerCapture(e.pointerId)) el.setPointerCapture(e.pointerId)
      setDrag(dy)
    }

    const onUp = (e: PointerEvent) => {
      if (e.pointerId !== id) return
      const speed = dy / Math.max(1, e.timeStamp - startedAt)
      id = null
      if (dy > CLOSE_PX || (dy > FLING_PX && speed > FLING_SPEED)) {
        reset(false)
        close.current()
      } else {
        reset(true)
      }
    }

    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onUp)
    return () => {
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onUp)
      el.style.removeProperty('--sheet-drag')
      el.style.transition = ''
    }
  }, [ref])
}
