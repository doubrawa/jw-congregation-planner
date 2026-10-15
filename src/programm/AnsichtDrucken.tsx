import type { ReactNode } from 'react'
import { useApp } from '../app/context'
import { TABLET_BREITE, useMedia } from '../components/useMedia'
import { useDruckBogen } from '../druck/useDruckBogen'
import { druckKennzeichen } from './druck'
import { DruckKnopf } from './DruckKnopf'

/**
 * **Drucken für die Pläne ohne Woche** (5.10.2026): Gruppenbesuche, Trolleys
 * und Weitere Pläne (T120, T121).
 *
 * Mit `bogen` druckt der Knopf diesen Bogen (Phase 9, `useDruckBogen`) — er
 * wird erst beim Klick gezeichnet. Ohne druckt er die Ansicht, wie sie
 * dasteht (`print.css`), mit einer Kopfzeile, die das Blatt zuordnet:
 * Versammlung und Plan. Die Kopfzeile bleibt in beiden Fällen: Sie gilt auch
 * für den Druck aus dem Browser (Strg+P).
 *
 * Der Knopf sieht aus wie der der Woche (T121): am Handy das Zeichen, ab dem
 * Tablet mit Wort.
 */
export function AnsichtDrucken({ titel, bogen: zeichne }: { titel: string; bogen?: () => ReactNode }) {
  const { state } = useApp()
  const breit = useMedia(TABLET_BREITE)
  const { drucken, bogen } = useDruckBogen()

  const klick = () => {
    if (zeichne) {
      drucken(zeichne())
      return
    }
    druckKennzeichen(null)
    window.print()
  }

  return (
    <>
      {/* Nur im Ausdruck: Tabs und Navigation fehlen dort. */}
      <div className="prog-print-head">
        <span>{state.congregation.name}</span>
        <span>{titel}</span>
      </div>
      <div className="prog-meta-row druck-zeile">
        <DruckKnopf mitText={breit} onClick={klick} />
      </div>
      {bogen}
    </>
  )
}
