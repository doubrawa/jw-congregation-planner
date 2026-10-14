import { useApp } from '../app/context'
import { TABLET_BREITE, useMedia } from '../components/useMedia'
import { druckKennzeichen } from './druck'
import { DruckKnopf } from './DruckKnopf'

/**
 * **Drucken für die Pläne ohne Woche** (5.10.2026): Gruppenbesuche und
 * Weitere Pläne (T120).
 *
 * Bis dahin hatten nur das Programm und die Treffpunkte einen Druckknopf. Der
 * Reinigungsplan gehört aber genauso an den Aushang. Gedruckt wird die
 * Ansicht, wie sie dasteht — ohne Bedienelemente und ohne App-Rahmen
 * (`print.css`), mit einer Kopfzeile, die das Blatt zuordnet: Versammlung und
 * Plan. Ein eigenes Kennzeichen braucht es nicht; die Regeln der Woche gelten
 * (`druckKennzeichen(null)` räumt ein stehengebliebenes ab).
 *
 * Der Knopf sieht aus wie der der Woche (T121): am Handy das Zeichen, ab dem
 * Tablet mit Wort.
 */
export function AnsichtDrucken({ titel }: { titel: string }) {
  const { state } = useApp()
  const breit = useMedia(TABLET_BREITE)

  const drucken = () => {
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
        <DruckKnopf mitText={breit} onClick={drucken} />
      </div>
    </>
  )
}
