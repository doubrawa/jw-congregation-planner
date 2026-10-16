import { useRef, useState } from 'react'

/**
 * So lange nach dem Schärfen zählt ein Tipp noch nicht als Bestätigung.
 *
 * Ein Doppelklick liefert zwei Klicks kurz hintereinander, und ohne Sperre
 * schärfte und bestätigte er in einem. Gemessen im Review vom 16.10.2026:
 * „Entfernen" im Zuteilen-Blatt leerte den Platz, und wer zugesagt hatte,
 * bekam sofort „Zuteilung zurückgezogen". Wer die Frage liest, braucht länger
 * als 400 ms, ein Doppelklick ist schneller.
 */
export const ZWEI_TIPP_SPERRE_MS = 400

/**
 * Zwei-Tipp-Bestätigung für einen zerstörenden Knopf: Der erste Tipp bewaffnet
 * ihn (er nennt dann die Folge), erst der zweite führt aus. Verlässt der Fokus
 * den Knopf, entschärft er sich wieder. Ein zweiter Tipp innerhalb von
 * `ZWEI_TIPP_SPERRE_MS` zählt nicht; der Knopf bleibt dann geschärft.
 *
 * Der native `window.confirm` war der einzige im Projekt — er sieht auf jedem
 * Gerät anders aus, ignoriert Farbschema und Schriftgröße und lässt sich nicht
 * übersetzen, wo der Browser es nicht tut. Das Muster stand danach viermal
 * ausgeschrieben (Zuteilungen leeren, Treffpunkte leeren, Gruppe löschen,
 * Person löschen); hier steht es einmal.
 *
 * `entschaerfen` ist für den Nachbarknopf gedacht: Wer „Automatisch" tippt,
 * will das bewaffnete „Leeren" daneben nicht scharf stehen lassen.
 */
export function useZweiTipp(ausfuehren: () => void): {
  armed: boolean
  onClick: () => void
  onBlur: () => void
  entschaerfen: () => void
} {
  const [armed, setArmed] = useState(false)
  // `performance.now()` statt `Date.now()`: Sie läuft gleichmäßig weiter, auch
  // wenn jemand die Uhr stellt (die Entwicklerseite tut das, `uhrStellen`).
  const geschaerftUm = useRef(0)
  return {
    armed,
    onClick: () => {
      if (!armed) {
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
