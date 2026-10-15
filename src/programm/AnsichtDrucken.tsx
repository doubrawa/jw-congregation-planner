import type { ReactNode } from 'react'
import { useApp } from '../app/context'
import { TABLET_BREITE, useMedia } from '../components/useMedia'
import { useDruckBogen } from '../druck/useDruckBogen'
import { DruckKnopf } from './DruckKnopf'

/**
 * **Drucken für die Pläne ohne Woche** (5.10.2026): Gruppenbesuche, Trolleys
 * und Weitere Pläne (T120, T121).
 *
 * Der Knopf druckt den Bogen (Phase 9, `useDruckBogen`) — er wird erst beim
 * Klick gezeichnet. Darüber eine Kopfzeile, die nur im Ausdruck aus dem
 * Browser (Strg+P, `print.css`) erscheint und das Blatt zuordnet: Versammlung
 * und Plan.
 *
 * Der Knopf sieht aus wie der der Woche (T121): am Handy das Zeichen, ab dem
 * Tablet mit Wort.
 */
export function AnsichtDrucken({ titel, bogen: zeichne }: { titel: string; bogen: () => ReactNode }) {
  const { state } = useApp()
  const breit = useMedia(TABLET_BREITE)
  const { drucken, bogen } = useDruckBogen()

  return (
    <>
      {/* Nur im Ausdruck: Tabs und Navigation fehlen dort. */}
      <div className="prog-print-head">
        <span>{state.congregation.name}</span>
        <span>{titel}</span>
      </div>
      <div className="prog-meta-row druck-zeile">
        <DruckKnopf mitText={breit} onClick={() => drucken(zeichne())} />
      </div>
      {bogen}
    </>
  )
}
