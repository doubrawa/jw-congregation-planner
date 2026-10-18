import { useApp } from '../app/context'
import { Zeichen, type ZeichenName } from '../bausteine/Zeichen'
import { useT } from '../i18n/useT'
import type { Dict } from '../i18n/ui'
import type { FsBereich } from '../data/types'
import { aktiverFsBereich, fsBereiche } from './fs-bereiche'

/** Zeichen und Beschriftung je Bereich. */
const BEREICH: Record<FsBereich, { zeichen: ZeichenName; text: keyof Dict }> = {
  treffpunkte: { zeichen: 'predigtdienst', text: 'fsTreffpunkteTab' },
  gruppenbesuche: { zeichen: 'gruppe', text: 'fsGruppenbesucheTab' },
  trolleys: { zeichen: 'trolley', text: 'fsTrolleysTab' },
  grundplan: { zeichen: 'einstellungen', text: 'fsGrundplan' },
}

/**
 * Die Bereiche des Predigtdienstes (T120; T121, Baustein `GDienstTabs`): die
 * Treffpunkte der Woche, die Gruppenbesuche des Dienstaufsehers, beim Ansehen
 * die Trolleys und beim Planen der Grundplan der Treffpunkte. Welche es hier
 * gibt, sagt `fsBereiche`. Gibt es nur einen Bereich, steht gar keine Leiste da.
 *
 * Seit dem 18.10.2026 eine große Wahl über die ganze Breite, jeder Bereich mit
 * Zeichen und Namen, der gewählte in der Textfarbe hinterlegt wie in der
 * `Wahl`. Davor standen die Namen als schmale Reiter mit einem Punkt unter dem
 * gewählten — der Betreiber fand den Trolley-Kalender dahinter nicht.
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
          className="bereich-tab"
          aria-pressed={aktiv === bereich}
          onClick={() => dispatch({ type: 'setFsBereich', bereich })}
        >
          <Zeichen name={BEREICH[bereich].zeichen} />
          {t[BEREICH[bereich].text]}
        </button>
      ))}
    </nav>
  )
}
