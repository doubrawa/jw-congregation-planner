import { useEffect, useRef } from 'react'

/**
 * **Wer gerade obenauf liegt.**
 *
 * Blätter können übereinanderliegen: Das S-89-Formular wird *aus* dem
 * Zuteilungs-Sheet heraus geöffnet, und `openS89` lässt `slotSel` stehen. Beide
 * horchten am Fenster, und ein Tastendruck erreichte beide — der Planer sah
 * sich das Formular an, drückte Escape, um zur Zuteilung zurückzukommen, und
 * stand wieder im Plan. Über das ✕ des Formulars kam er dagegen richtig zurück:
 * zwei Wege, zwei Ergebnisse.
 *
 * Deshalb ein Stapel statt einzelner Horcher. React meldet den zuletzt
 * eingehängten Baustein zuletzt an, und genau der liegt oben — er allein
 * bekommt die Taste. Beim Abmelden fällt er wieder heraus, und der darunter ist
 * wieder dran.
 *
 * Die Regel steht hier, nicht bei den Aufrufern: Ein Blatt weiß nicht, ob über
 * ihm noch eines liegt, und müsste es sonst erraten.
 */
const stapel: Array<object> = []

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
    // Eine Marke je Einhängung — sie sagt, an welcher Stelle des Stapels dieses
    // Blatt liegt. Die Funktion selbst taugte dafür nicht: Zwei Blätter mit
    // demselben Verhalten wären dieselbe Marke.
    const marke = {}
    stapel.push(marke)
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (stapel[stapel.length - 1] !== marke) return // darunter — nicht gemeint
      handler.current()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      const i = stapel.lastIndexOf(marke)
      if (i >= 0) stapel.splice(i, 1)
    }
  }, [])
}
