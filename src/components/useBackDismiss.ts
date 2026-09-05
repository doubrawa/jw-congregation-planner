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
 * Angekündigte eigene `history.back()`, die noch auf ihr `popstate` warten.
 *
 * Auch unser eigenes Aufräumen erzeugt ein `popstate` — ohne diese Ankündigung
 * hielte ein anderer (oder neu registrierter) Horcher es für einen echten
 * Zurück-Druck und schlösse sein Overlay gleich mit. Modulweit, weil das
 * Ereignis am window hängt und jeden Horcher erreicht.
 *
 * **Eine Marke je Ankündigung, keine bloße Zahl.** Hier stand ein Zähler, den
 * nur ein *anderes*, noch offenes Blatt wieder herunterzog — und im
 * Normalfall gibt es keines: Wer das einzige offene Blatt per ✕, Escape oder
 * Hintergrund-Tipp schließt, kündigt an, ruft `history.back()`, und das
 * folgende `popstate` erreicht **niemanden** mehr. Der Zähler blieb stehen,
 * und das nächste geöffnete Blatt verschluckte damit den ersten echten
 * Zurück-Druck des Nutzers: Das Blatt blieb liegen, sein Verlaufseintrag war
 * aber schon weg, und der zweite Druck verließ die App. Mit jedem ✕ wuchs der
 * Zähler um eins weiter.
 *
 * Jede Ankündigung räumt sich deshalb selbst wieder ab (`eigenesZurueck`).
 */
const angekuendigt = new Set<object>()

/**
 * Gehört dieses `popstate` zu einem eigenen Aufräumen? Dann verbrauchen.
 *
 * Verbraucht wird die **älteste** offene Ankündigung: Welche es genau war,
 * spielt keine Rolle — es geht nur darum, dass eine davon jetzt beantwortet
 * ist.
 */
function warEigenesZurueck(): boolean {
  const erste = angekuendigt.values().next()
  if (erste.done) return false
  angekuendigt.delete(erste.value)
  return true
}

/**
 * Den eigenen Verlaufseintrag abräumen — angekündigt und mit Verfallsdatum.
 *
 * Die Ankündigung verfällt beim nächsten `popstate`, aber erst **einen
 * Durchlauf später**: Alle Horcher dieses Ereignisses sollen sie noch sehen.
 * Der eigene Horcher hier ist zwangsläufig der zuletzt angemeldete und käme
 * sonst vor einem Blatt an die Reihe, das sich nach ihm angemeldet hat — genau
 * das tut React im Strict-Modus, wenn es einen Effekt doppelt einhängt.
 */
function eigenesZurueck(): void {
  const marke = {}
  angekuendigt.add(marke)
  const verfallen = (): void => {
    window.removeEventListener('popstate', verfallen)
    window.setTimeout(() => angekuendigt.delete(marke), 0)
  }
  window.addEventListener('popstate', verfallen)
  history.back()
}

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
      if (warEigenesZurueck()) return // unser eigenes Aufräumen, kein Zurück des Nutzers
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
      // Eigener Eintrag liegt noch obenauf → selbst abräumen.
      if (state?.[MARKER]) eigenesZurueck()
    }
  }, [active])
}
