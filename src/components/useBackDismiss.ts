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
 * **Mehrere Overlays übereinander** bringen jedes seinen eigenen Eintrag mit,
 * und Zurück nimmt davon genau einen — so weit stimmte es. Die Horcher hängen
 * aber alle am selben Fenster, und ein `popstate` erreicht **jeden**: Das
 * S-89-Formular wird aus dem Zuteilungs-Sheet heraus geöffnet, beide lagen
 * danach übereinander, und ein Zurück räumte den ganzen Stapel ab. Auf dem
 * Handy ist Zurück die meistgenutzte Geste überhaupt — wer sich das Formular
 * ansah und zurückging, landete nicht bei der Zuteilung, aus der er kam,
 * sondern im Plan.
 *
 * Deshalb der Stapel unten: Angesprochen ist immer nur das oberste Blatt.
 * Dieselbe Regel wie bei `useEscape`, und aus demselben Grund — ein Blatt weiß
 * nicht, ob über ihm noch eines liegt.
 */
const MARKER = 'cpOverlay'

/**
 * Die offenen Overlays, von unten nach oben. Eine Marke je Einhängung: Zwei
 * Blätter mit demselben Verhalten wären sonst nicht zu unterscheiden.
 */
const stapel: Array<object> = []

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
    const marke = {}
    stapel.push(marke)
    history.pushState({ ...history.state, [MARKER]: true }, '')
    const onPop = () => {
      // Nur das oberste Blatt ist gemeint. Die Prüfung steht **vor** dem
      // Zähler: Sonst zöge der erste Horcher ihn herunter und der zweite hielte
      // dasselbe Ereignis für ein echtes Zurück.
      if (stapel[stapel.length - 1] !== marke) return
      if (pendingBacks > 0) {
        pendingBacks-- // unser eigenes Aufräumen, kein Zurück des Nutzers
        return
      }
      dismiss.current()
    }
    window.addEventListener('popstate', onPop)
    return () => {
      window.removeEventListener('popstate', onPop)
      // Aus dem Stapel **vor** dem eigenen `history.back()`: Das darauf
      // folgende `popstate` gehört dem Blatt darunter, und das muss dann schon
      // obenauf liegen, um den Zähler abzuräumen.
      const i = stapel.lastIndexOf(marke)
      if (i >= 0) stapel.splice(i, 1)
      const state = history.state as Record<string, unknown> | null
      if (state?.[MARKER]) {
        // Eigener Eintrag liegt noch obenauf → selbst abräumen.
        pendingBacks++
        history.back()
      }
    }
  }, [active])
}
