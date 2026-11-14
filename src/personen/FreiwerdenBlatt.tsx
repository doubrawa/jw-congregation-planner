import { createPortal } from 'react-dom'
import { AngebotText } from '../aufgaben/Angebot'
import { AufgabeTermin, AufgabeText } from '../aufgaben/AufgabeText'
import { Sheet } from '../components/Sheet'
import type { KuenftigerPlatz } from '../data/freiwerden'
import { personLabel } from '../data/helpers'
import type { Person } from '../data/types'
import { useT } from '../i18n/useT'

/**
 * **Plätze freigeben?** (T182) — wenn eine Person etwas nicht mehr macht.
 *
 * Nimmt der Admin ihr einen Bereich, ändert Rolle oder Geschlecht oder
 * entfernt sie, und sie steht noch an künftigen Plätzen, die dann nicht mehr
 * passen (`nichtMehrPassend`), zeigt dieses Blatt sie und lässt wählen
 * (Betreiber, 13.11.2026: „Vorher fragen, mit Wahl"):
 *
 *  - **Plätze freigeben** — sie werden offen und neu verplant,
 *  - **Stehen lassen** — die Änderung gilt, die Plätze bleiben besetzt (etwa,
 *    wenn jemand den Dezember noch macht, aber danach nicht mehr),
 *  - **Abbrechen** — es ändert sich nichts.
 *
 * Beide Knöpfe führen die Änderung aus; was sie ist, weiß der Aufrufer.
 */
export function FreiwerdenBlatt({
  art,
  person,
  plaetze,
  mitKonto = false,
  ueberBlatt = false,
  onFreigeben,
  onStehenLassen,
  onClose,
}: {
  /** `entfernen`: Die Person geht — dann ist es jeder künftige Platz. */
  art: 'aendern' | 'entfernen'
  person: Person
  plaetze: readonly KuenftigerPlatz[]
  /** Beim Entfernen: Ihr Konto geht mit (`kontoGehtMit`) — das Blatt sagt es dazu. */
  mitKonto?: boolean
  /** Liegt über einem anderen Blatt (Aufgabenbereiche, Person bearbeiten, ein Hilfsdienst). */
  ueberBlatt?: boolean
  onFreigeben: () => void
  onStehenLassen: () => void
  onClose: () => void
}) {
  const { t } = useT()
  const entfernen = art === 'entfernen'
  const titel = entfernen ? t.persLoeschen : t.freiTitel
  const hinweis = entfernen ? t.freiHinweisEntfernen : t.freiHinweisAendern
  return createPortal(
    <Sheet
      variante={ueberBlatt ? 'oben' : 'normal'}
      label={titel}
      title={titel}
      sub={<span dir="auto">{personLabel(person)}</span>}
      onClose={onClose}
    >
      <div className="sheet-inhalt">
        <p className="frei-intro">{entfernen ? t.freiEntfernenIntro : t.freiAendernIntro}</p>
        <ul className="frei-liste">
          {plaetze.map(({ key, aufgabe }) => (
            <li key={key} className="frei-zeile">
              <AngebotText titel={<AufgabeText task={aufgabe} />} wann={<AufgabeTermin task={aufgabe} />} />
            </li>
          ))}
        </ul>
      </div>
      <div className="frei-fuss">
        <p className="klein-text">{mitKonto ? `${hinweis} ${t.confirmPersonDelKonto}` : hinweis}</p>
        <div className="knopf-reihe">
          <button type="button" className="knopf-haupt" onClick={onFreigeben}>
            {t.plaetzeFreigebenBtn}
          </button>
          <button type="button" className="knopf-umriss" onClick={onStehenLassen}>
            {t.stehenLassenBtn}
          </button>
        </div>
        <button type="button" className="knopf-leise" onClick={onClose}>
          {t.abbrechen}
        </button>
      </div>
    </Sheet>,
    document.body,
  )
}
