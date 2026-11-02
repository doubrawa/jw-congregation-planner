import { useEffect, useRef } from 'react'

/**
 * **Was im Blatt getippt ist, geht nicht verloren.**
 *
 * Die Blätter mit Namensfeldern übernehmen erst beim Schließen — ein halb
 * getippter Name stünde sonst schon in den Plänen. Verschwindet das Blatt,
 * ohne dass es jemand schließt (ein Tipp auf eine Mitteilung führt woandershin,
 * die Ansicht wechselt), übernimmt es trotzdem, was dasteht. `uebernehmen`
 * läuft so genau einmal: mit dem Schließen oder mit dem Verschwinden.
 *
 * `verwerfen` ist für das Entfernen aus dem Blatt heraus: Was weg ist, braucht
 * keinen neuen Namen — und keinen Hinweis, dass der getippte nicht ging. Es
 * gilt sofort, also schon vor der Antwort auf das Entfernen, mit der das Blatt
 * aushängen kann. Scheitert das Entfernen, nimmt die Rückgabe es zurück.
 */
export function useUebernehmen(uebernehmen: () => void): { uebernehmen: () => void; verwerfen: () => () => void } {
  const aktuell = useRef(uebernehmen)
  aktuell.current = uebernehmen
  const erledigt = useRef(false)

  useEffect(
    () => () => {
      if (!erledigt.current) aktuell.current()
    },
    [],
  )

  return {
    uebernehmen: () => {
      if (erledigt.current) return
      erledigt.current = true
      aktuell.current()
    },
    verwerfen: () => {
      const vorher = erledigt.current
      erledigt.current = true
      return () => {
        erledigt.current = vorher
      }
    },
  }
}
