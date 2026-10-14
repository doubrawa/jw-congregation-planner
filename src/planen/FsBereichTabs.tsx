import { useApp } from '../app/context'
import { useT } from '../i18n/useT'
import type { Dict } from '../i18n/ui'
import type { FsBereich } from '../data/types'
import { aktiverFsBereich, fsBereiche } from './fs-bereiche'

/** Beschriftung je Bereich. */
const BESCHRIFTUNG: Record<FsBereich, keyof Dict> = {
  treffpunkte: 'fsTreffpunkteTab',
  gruppenbesuche: 'fsGruppenbesucheTab',
  trolleys: 'fsTrolleysTab',
  grundplan: 'fsGrundplan',
}

/**
 * Reiter des Predigtdienstes (T120; T121, Baustein `GDienstTabs`): die
 * Treffpunkte der Woche, die Gruppenbesuche des Dienstaufsehers, beim Ansehen
 * die Trolleys und beim Planen der Grundplan der Treffpunkte.
 * Welche es hier gibt, sagt `fsBereiche`. Der gewählte steht kräftig mit
 * einem Punkt in Minze darunter. Gibt es nur einen Bereich, steht gar keine
 * Leiste da.
 */
export function FsBereichTabs() {
  const { state, dispatch } = useApp()
  const { t } = useT()
  const bereiche = fsBereiche(state)
  if (bereiche.length < 2) return null
  const aktiv = aktiverFsBereich(state)
  return (
    <nav className="bereich-tabs" aria-label={t.tabFs}>
      {bereiche.map((bereich) => (
        <button
          key={bereich}
          type="button"
          className={aktiv === bereich ? 'bereich-tab is-active' : 'bereich-tab'}
          aria-pressed={aktiv === bereich}
          onClick={() => dispatch({ type: 'setFsBereich', bereich })}
        >
          {t[BESCHRIFTUNG[bereich]]}
        </button>
      ))}
    </nav>
  )
}
