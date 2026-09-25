import { useState } from 'react'

/**
 * Zwei-Tipp-Bestätigung für einen zerstörenden Knopf: Der erste Tipp bewaffnet
 * ihn (er nennt dann die Folge), erst der zweite führt aus. Verlässt der Fokus
 * den Knopf, entschärft er sich wieder.
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
  return {
    armed,
    onClick: () => {
      if (!armed) {
        setArmed(true)
        return
      }
      setArmed(false)
      ausfuehren()
    },
    onBlur: () => setArmed(false),
    entschaerfen: () => setArmed(false),
  }
}
