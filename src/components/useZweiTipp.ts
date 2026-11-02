import { useEffect, useRef, useState, type MouseEvent } from 'react'

/**
 * So lange nach dem Schärfen zählt ein Tipp noch nicht als Bestätigung.
 *
 * Ein Doppelklick liefert zwei Klicks kurz hintereinander; ohne Sperre schärfte
 * und bestätigte er in einem — „Entfernen" im Zuteilen-Blatt leerte den Platz,
 * und wer zugesagt hatte, bekäme sofort „Zuteilung zurückgezogen". Wer die
 * Frage liest, braucht länger als 400 ms, ein Doppelklick ist schneller.
 */
export const ZWEI_TIPP_SPERRE_MS = 400

/**
 * Zwei-Tipp-Bestätigung für einen zerstörenden Knopf: Der erste Tipp bewaffnet
 * ihn (er nennt dann die Folge), erst der zweite führt aus. Ein zweiter Tipp
 * innerhalb von `ZWEI_TIPP_SPERRE_MS` zählt nicht; der Knopf bleibt dann
 * geschärft.
 *
 * Entschärft wird er, sobald der Fokus ihn verlässt **oder jemand daneben
 * tippt**. Das Tippen daneben braucht es eigens: Safari am iPhone gibt einem
 * angetippten Knopf keinen Fokus, `blur` kommt dort nie. Gelauscht wird in der
 * Capture-Phase, damit es auch ein Ziel bemerkt, das das Ereignis nicht
 * weiterreicht.
 *
 * Statt `window.confirm`: Das sieht auf jedem Gerät anders aus, ignoriert
 * Farbschema und Schriftgröße und lässt sich nicht übersetzen, wo der Browser
 * es nicht tut.
 *
 * `entschaerfen` ist für den Nachbarknopf gedacht: Wer „Automatisch" tippt,
 * will das bewaffnete „Leeren" daneben nicht scharf stehen lassen.
 */
export function useZweiTipp(ausfuehren: () => void): {
  armed: boolean
  onClick: (e: MouseEvent<HTMLElement>) => void
  onBlur: () => void
  entschaerfen: () => void
} {
  const [armed, setArmed] = useState(false)
  // `performance.now()` statt `Date.now()`: Sie läuft gleichmäßig weiter, auch
  // wenn jemand die Uhr stellt (die Entwicklerseite tut das, `uhrStellen`).
  const geschaerftUm = useRef(0)
  const knopf = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!armed) return
    const daneben = (e: PointerEvent) => {
      if (!knopf.current?.contains(e.target as Node)) setArmed(false)
    }
    document.addEventListener('pointerdown', daneben, true)
    return () => document.removeEventListener('pointerdown', daneben, true)
  }, [armed])

  return {
    armed,
    onClick: (e) => {
      if (!armed) {
        knopf.current = e.currentTarget
        geschaerftUm.current = performance.now()
        setArmed(true)
        return
      }
      if (performance.now() - geschaerftUm.current < ZWEI_TIPP_SPERRE_MS) return
      setArmed(false)
      ausfuehren()
    },
    onBlur: () => setArmed(false),
    entschaerfen: () => setArmed(false),
  }
}
