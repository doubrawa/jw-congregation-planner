import { useApp } from '../app/context'
import { BEREICHS_ZEICHEN, bereichsTitel, zumPlanen } from '../app/bereich'
import { Zeichen } from '../bausteine/Zeichen'
import { darfPlanen, rechteVon } from '../data/rechte'
import type { Thema } from '../data/types'
import { useT } from '../i18n/useT'

/** Die Bereiche in der Reihenfolge des Menüs. */
const BEREICHE: readonly Thema[] = ['zusammenkuenfte', 'predigtdienst', 'weitere']

/**
 * **Was man planen kann, oben auf „Planung"** (T135, Betreiber 24.10.2026):
 * „Unter Menüpunkt Planung soll die Auswahl zwischen Zusammenkünfte, Dienst und
 * weitere Pläne sein … nur Zusammenkünfte sind leicht zu finden beim planen und
 * der rest ist ganz unten". Bis dahin standen Predigtdienst und Weitere Pläne
 * unter „Auch zu planen" am Ende der Seite.
 *
 * Dieselbe große Wahl wie bei den Bereichen des Predigtdienstes
 * (`FsBereichTabs`); `aktiv` ist der Bereich, den die Seite gerade zeigt. Nur
 * die Bereiche, die man planen darf — ist es einer, steht keine Wahl da.
 */
export function PlanungsBereiche({ aktiv }: { aktiv: Thema }) {
  const { state, dispatch } = useApp()
  const { t } = useT()
  const rechte = rechteVon(state)
  const bereiche = BEREICHE.filter((thema) => darfPlanen(rechte, thema))
  if (bereiche.length < 2) return null
  return (
    <nav className="bereich-tabs" aria-label={t.dashPlanung}>
      {bereiche.map((thema) => (
        <button
          key={thema}
          type="button"
          className="bereich-tab"
          aria-pressed={aktiv === thema}
          onClick={() => aktiv !== thema && dispatch(zumPlanen(thema))}
        >
          <Zeichen name={BEREICHS_ZEICHEN[thema]} />
          {bereichsTitel(t, thema)}
        </button>
      ))}
    </nav>
  )
}
