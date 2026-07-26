import { useEffect, type RefObject } from 'react'

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

/**
 * Fokus-Verwaltung für modale Dialoge (role="dialog" aria-modal): setzt den
 * Fokus beim Öffnen in den Dialog, hält ihn per Tab-Falle darin und gibt ihn
 * beim Schließen an das zuvor fokussierte Element zurück. Escape/Backdrop-Klick
 * regeln die Komponenten selbst weiter.
 */
export function useDialogFocus(ref: RefObject<HTMLElement | null>, active = true): void {
  useEffect(() => {
    const node = active ? ref.current : null
    if (!node) return
    const prev = document.activeElement as HTMLElement | null
    const focusable = (): HTMLElement[] =>
      Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null)

    const first = focusable()[0]
    if (first) first.focus()
    else {
      node.tabIndex = -1
      node.focus()
    }

    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Tab') return
      const els = focusable()
      if (els.length === 0) {
        e.preventDefault()
        return
      }
      const firstEl = els[0]
      const lastEl = els[els.length - 1]
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault()
        lastEl.focus()
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault()
        firstEl.focus()
      }
    }
    node.addEventListener('keydown', onKey)
    return () => {
      node.removeEventListener('keydown', onKey)
      prev?.focus?.()
    }
  }, [ref, active])
}
