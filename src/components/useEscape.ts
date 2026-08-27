import { useEffect, useRef } from 'react'

/**
 * Schließt ein Overlay mit der Escape-Taste.
 *
 * Stand bis hierher als derselbe `useEffect` in fünf Dateien — und eben nicht
 * überall: `MyTaskSheet` und `ConfirmDialog` fehlte er, was beim Lesen einer
 * einzelnen Datei nicht auffällt. Als Aufruf neben `useBackDismiss` ist die
 * Lücke sichtbar.
 *
 * Über eine Ref, damit ein bei jedem Render neu erzeugtes `onEscape` den
 * Effekt nicht ab- und wieder anmeldet.
 */
export function useEscape(onEscape: () => void): void {
  const handler = useRef(onEscape)
  handler.current = onEscape

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') handler.current()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
