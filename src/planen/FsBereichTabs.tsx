import { useApp } from '../app/context'
import { useT } from '../i18n/useT'
import type { Dict } from '../i18n/ui'
import type { FsBereich } from '../data/types'
import { aktiverFsBereich, fsBereiche } from './fs-bereiche'

/** Beschriftung je Bereich. */
const BESCHRIFTUNG: Record<FsBereich, keyof Dict> = {
  treffpunkte: 'fsTreffpunkteTab',
  gruppenbesuche: 'fsGruppenbesucheTab',
  grundplan: 'fsGrundplan',
}

/**
 * Reiter des Predigtdienstes (T120): die Treffpunkte der Woche, die
 * Gruppenbesuche des Dienstaufsehers und — beim Planen — ihr Grundplan. Welche
 * es hier gibt, sagt `fsBereiche`. Gestaltet wie die Reiter der
 * Zusammenkünfte, damit beide Themen dieselbe Bedienung haben. Gibt es nur
 * einen Bereich, steht gar keine Leiste da.
 */
export function FsBereichTabs() {
  const { state, dispatch } = useApp()
  const { t } = useT()
  const bereiche = fsBereiche(state)
  if (bereiche.length < 2) return null
  const aktiv = aktiverFsBereich(state)
  return (
    <div className="meeting-tabs plan-tabs">
      {bereiche.map((bereich) => (
        <button
          key={bereich}
          type="button"
          className={aktiv === bereich ? 'meeting-tab is-active' : 'meeting-tab'}
          aria-pressed={aktiv === bereich}
          onClick={() => dispatch({ type: 'setFsBereich', bereich })}
        >
          {t[BESCHRIFTUNG[bereich]]}
        </button>
      ))}
    </div>
  )
}
