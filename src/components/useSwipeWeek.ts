import { useEffect, useRef, type RefObject } from 'react'

/**
 * Waagerecht wischen, um eine Woche zu blättern (Programm und Planen).
 *
 * Bewusst NUR die Woche: waagerecht bedeutet in dieser App sonst nichts
 * anderes: die drei Reiter bleiben Antippen. Zwei Bedeutungen für dieselbe
 * Richtung müsste man raten.
 *
 * Zwei Fallstricke, die hier gelöst sind:
 *
 *  1. Im Browser-Tab löst ein Wisch vom Bildschirmrand die Zurück-/Vorwärts-
 *     Navigation des Browsers aus. Gesten, die in den äußeren EDGE_PX beginnen,
 *     werden daher ignoriert.
 *  2. Der Inhalt darunter scrollt senkrecht. Die Geste greift erst, wenn die
 *     Bewegung klar waagerecht ist (ANGLE), und das CSS überlässt dem Browser
 *     `pan-y` — senkrechtes Scrollen bleibt also unangetastet.
 *
 * Die Pfeile bleiben erhalten (WCAG 2.5.1: eine Geste ist nie der einzige Weg).
 * Während des Ziehens wandert der Inhalt mit (gedämpft); beim Loslassen wird
 * entweder geblättert oder zurückgefedert.
 */
const EDGE_PX = 24 // Randzone des Browsers
const START_PX = 10 // ab hier gilt die Geste als begonnen
const COMMIT_PX = 60 // so weit gezogen: blättern
const ANGLE = 1.4 // |dx| muss so viel größer sein als |dy|
const DAMP = 0.35 // der Inhalt folgt gedämpft, nicht 1:1

interface Options {
  onPrev: () => void
  onNext: () => void
  canPrev: boolean
  canNext: boolean
}

export function useSwipeWeek(ref: RefObject<HTMLElement | null>, opts: Options): void {
  const o = useRef(opts)
  o.current = opts

  useEffect(() => {
    const el = ref.current
    if (!el) return

    let id: number | null = null
    let startX = 0
    let startY = 0
    let active = false // Geste als waagerecht erkannt
    let dx = 0

    const setShift = (px: number) => el.style.setProperty('--week-shift', `${px}px`)
    const release = (animate: boolean) => {
      el.style.transition = animate ? 'transform 200ms ease-out' : ''
      setShift(0)
      if (animate) window.setTimeout(() => (el.style.transition = ''), 220)
    }

    const onDown = (e: PointerEvent) => {
      if (id !== null || !e.isPrimary) return
      // Randzone dem Browser überlassen (Zurück-/Vorwärts-Wisch).
      if (e.clientX < EDGE_PX || e.clientX > window.innerWidth - EDGE_PX) return
      id = e.pointerId
      startX = e.clientX
      startY = e.clientY
      active = false
      dx = 0
      el.style.transition = ''
    }

    const onMove = (e: PointerEvent) => {
      if (e.pointerId !== id) return
      dx = e.clientX - startX
      const dy = e.clientY - startY
      if (!active) {
        // Senkrecht dominant → das ist Scrollen, Geste verwerfen.
        if (Math.abs(dy) > START_PX && Math.abs(dy) >= Math.abs(dx)) {
          id = null
          return
        }
        if (Math.abs(dx) < START_PX || Math.abs(dx) < Math.abs(dy) * ANGLE) return
        active = true
      }
      // Am Anfang/Ende der Wochen zäher ziehen — signalisiert „hier ist Schluss".
      const blocked = (dx > 0 && !o.current.canPrev) || (dx < 0 && !o.current.canNext)
      setShift(dx * (blocked ? DAMP * 0.3 : DAMP))
    }

    const onUp = (e: PointerEvent) => {
      if (e.pointerId !== id) return
      const wasActive = active
      const moved = dx
      id = null
      active = false
      release(true)
      if (!wasActive || Math.abs(moved) < COMMIT_PX) return
      if (moved > 0 && o.current.canPrev) o.current.onPrev()
      else if (moved < 0 && o.current.canNext) o.current.onNext()
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
      el.style.removeProperty('--week-shift')
      el.style.transition = ''
    }
  }, [ref])
}
