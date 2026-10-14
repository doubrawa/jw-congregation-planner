import { useState } from 'react'
import { useApp } from '../app/context'
import { Punkt } from '../bausteine/Punkt'
import { Zeichen } from '../bausteine/Zeichen'
import { ohneGruppe, personLabel } from '../data/helpers'
import type { Group } from '../data/types'
import { fill, useT } from '../i18n/useT'
import { EinstellZeile } from './EinstellZeile'
import { neuerGruppenName } from './einstellungen-anzeige'
import { GruppeBlatt } from './GruppeBlatt'

/**
 * **Gruppen** (T121, Entwurf `GGruppenStandorte` — die Trolleys darin kommen mit
 * Phase 7; am Desktop `GDesktopEinstellungen` als Tabelle): oben, wer ohne
 * Gruppe ist — dort lässt eine entfernte Gruppe ihre Mitglieder zurück, und
 * zugeordnet wird bei der Person. Darunter die Predigtdienstgruppen mit
 * Aufseher, Gehilfe und Zahl; ein Tipp öffnet die Gruppe (`GruppeBlatt`).
 *
 * „Gruppe hinzufügen" legt sie gleich an, mit der nächsten Nummer, und öffnet
 * sie — Name, Aufseher und Gehilfe stehen dann im Blatt.
 */
export function GruppenInhalt({ tabelle = false }: { tabelle?: boolean }) {
  const { state, dispatch } = useApp()
  const { t, tu } = useT()
  const [offen, setOffen] = useState<string | null>(null)
  const ohne = ohneGruppe(state.persons, state.groups)
  const gruppe = state.groups.find((g) => g.id === offen)

  const name = (id: string | null): string => {
    const person = id ? state.persons.find((p) => p.id === id) : undefined
    return person ? personLabel(person) : ''
  }
  const mitglieder = (g: Group): number => state.persons.filter((p) => p.grp === g.id).length
  const hinzufuegen = () => {
    const id = crypto.randomUUID()
    dispatch({ type: 'addGroup', group: { id, name: neuerGruppenName(state.groups), overseerId: null, assistantId: null } })
    setOffen(id)
  }

  return (
    <>
      {ohne.length > 0 && (
        <button type="button" className="gruppen-ohne" onClick={() => dispatch({ type: 'navigate', screen: 'personen' })}>
          <Punkt art="offen" />
          <span className="einst-zeile-text">
            <span className="einst-zeile-name">{fill(t.ohneGruppeN, { n: ohne.length })}</span>
            <span className="klein-text">{t.ohneGruppeKurz}</span>
          </span>
          <Zeichen name="weiter" />
        </button>
      )}
      <section className="karte einst-karte">
        <h2 className="abschnitt-titel karte-titel">{t.gruppenCard}</h2>
        {tabelle && (
          <div className="gruppen-kopf" aria-hidden="true">
            <span>{t.gbGruppe}</span>
            <span>{t.aufseherLbl}</span>
            <span>{t.gehilfeLbl}</span>
            <span>{t.navPersonen}</span>
          </div>
        )}
        {state.groups.map((g) =>
          tabelle ? (
            <button key={g.id} type="button" className="gruppen-zeile" onClick={() => setOffen(g.id)}>
              <span className="einst-zeile-name" dir="auto">
                {tu(g.name)}
              </span>
              <span dir="auto">{name(g.overseerId)}</span>
              <span dir="auto">{name(g.assistantId)}</span>
              <span>{mitglieder(g)}</span>
              <Zeichen name="weiter" />
            </button>
          ) : (
            <EinstellZeile
              key={g.id}
              name={tu(g.name)}
              eigenerName
              unter={[name(g.overseerId), name(g.assistantId)].filter(Boolean).join(' · ')}
              wert={fill(t.personenCount, { n: mitglieder(g) })}
              onTipp={() => setOffen(g.id)}
            />
          ),
        )}
        <button type="button" className="zeile-hinzu" onClick={hinzufuegen}>
          <Zeichen name="plus" />
          {t.gruppeHinzu}
        </button>
      </section>
      <p className="klein-text einst-fuss">{t.gruppeBeiPerson}</p>
      {gruppe && <GruppeBlatt key={gruppe.id} gruppe={gruppe} onClose={() => setOffen(null)} />}
    </>
  )
}
