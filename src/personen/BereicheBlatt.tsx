import { createPortal } from 'react-dom'
import { useApp } from '../app/context'
import { Sheet } from '../components/Sheet'
import { displayName } from '../data/helpers'
import type { Person } from '../data/types'
import { LOCALES } from '../i18n/langs'
import { useT } from '../i18n/useT'
import { bereichsGruppen } from './bereiche'
import { PrivToggle } from './PrivToggle'
import { useAendernMitPlaetzen } from './useAendernMitPlaetzen'

/**
 * **Aufgabenbereiche ändern** (T121, „Ändern" bei der Person): je Gruppe ein
 * Schalter für jeden Bereich — dieselben Gruppen wie die Chips daneben
 * (`bereichsGruppen`). Jeder Schalter gilt sofort; die festen Rollen tragen
 * ihren Hinweis mit. Nimmt ein Schalter der Person künftige Plätze, fragt
 * erst ein Blatt darüber (T182, `useAendernMitPlaetzen`).
 */
export function BereicheBlatt({ person, onClose }: { person: Person; onClose: () => void }) {
  const { state } = useApp()
  const { t, tu } = useT()
  const { aendern, blatt } = useAendernMitPlaetzen()
  const update = (patch: Partial<Person>) => aendern(person, patch)
  const gruppen = bereichsGruppen(t, tu, state.services, LOCALES[state.lang]).filter((g) => g.bereiche.length > 0)

  return (
    <>
      {createPortal(
        <Sheet variante="lang" label={t.aufgabenbereiche} title={t.aufgabenbereiche} sub={displayName(person)} onClose={onClose}>
          <div className="sheet-inhalt">
            {gruppen.map((g) => (
              <section key={g.art} className="bereiche-gruppe" aria-label={g.titel}>
                <h3 className="abschnitt-titel bereiche-gruppe-titel">{g.titel}</h3>
                {g.art === 'festeRollen' && <p className="klein-text">{t.wtRollenHint}</p>}
                {g.bereiche.map((b) => (
                  <PrivToggle key={b.key} qkey={b.key} label={b.label} person={person} update={update} bruderLabel={t.bruder} />
                ))}
              </section>
            ))}
          </div>
          <div className="sheet-fuss-ende">
            <button type="button" className="knopf-haupt" onClick={onClose}>
              {t.fertig}
            </button>
          </div>
        </Sheet>,
        document.body,
      )}
      {blatt}
    </>
  )
}
