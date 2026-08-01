import { useEffect, useRef } from 'react'

/**
 * Lässt die Zurück-Geste (bzw. die Zurück-Taste) ein Overlay schließen, statt
 * die App zu verlassen.
 *
 * Auf dem Handy ist Zurück die meistgenutzte Geste überhaupt. Ohne das hier
 * würde sie bei offenem Sheet die ganze App verlassen — die App führt sonst
 * keinen Verlauf (kein Routing).
 *
 * Solange das Overlay offen ist, liegt ein zusätzlicher Verlaufseintrag auf dem
 * Stapel. Zurück entfernt ihn und schließt damit das Overlay. Wird das Overlay
 * anders geschlossen (Knopf, Escape, Hintergrund-Tipp), räumen wir den Eintrag
 * selbst wieder ab — aber nur, wenn er noch obenauf liegt. Genau diese Prüfung
 * unterscheidet die beiden Fälle zuverlässig: nach einem echten Zurück ist
 * unser Eintrag bereits weg.
 *
 * Mehrere Overlays übereinander funktionieren von selbst, weil jedes seinen
 * eigenen Eintrag mitbringt — Zurück schließt sie der Reihe nach von oben.
 */
const MARKER = 'cpOverlay'

/**
 * Wie viele selbst ausgelöste history.back() noch unbeantwortet sind.
 *
 * Auch unser eigenes Aufräumen erzeugt ein `popstate` — ohne diesen Zähler
 * hielte ein anderer (oder neu registrierter) Listener das für einen echten
 * Zurück-Druck und schlösse sein Overlay gleich mit. Modulweit, weil das
 * Ereignis am window hängt und jeden Listener erreicht.
 */
let pendingBacks = 0

export function useBackDismiss(active: boolean, onDismiss: () => void): void {
  // Über eine Ref, damit ein neu erzeugtes onDismiss den Effekt nicht neu
  // startet (das würde den Verlaufseintrag doppeln).
  const dismiss = useRef(onDismiss)
  dismiss.current = onDismiss

  useEffect(() => {
    if (!active) return
    history.pushState({ ...history.state, [MARKER]: true }, '')
    const onPop = () => {
      if (pendingBacks > 0) {
        pendingBacks-- // unser eigenes Aufräumen, kein Zurück des Nutzers
        return
      }
      dismiss.current()
    }
    window.addEventListener('popstate', onPop)
    return () => {
      window.removeEventListener('popstate', onPop)
      const state = history.state as Record<string, unknown> | null
      if (state?.[MARKER]) {
        // Eigener Eintrag liegt noch obenauf → selbst abräumen.
        pendingBacks++
        history.back()
      }
    }
  }, [active])
}
