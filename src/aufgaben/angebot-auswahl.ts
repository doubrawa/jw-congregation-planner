import type { AppState, UebernehmenAuswahl } from '../app/context'
import type { OffenerPlatz } from '../data/offene-plaetze'
import type { SubstituteReq } from '../data/types'

/** Was im Blatt „Übernehmen?" liegt (T185) — ein Ersatzgesuch oder ein freier Platz. */
export type Angebot = { art: 'gesuch'; req: SubstituteReq } | { art: 'platz'; platz: OffenerPlatz }

/** Das Angebot zur Auswahl — `null`, wenn es nicht mehr angeboten wird (inzwischen vergeben). */
export function angebotZu(
  auswahl: UebernehmenAuswahl,
  state: Pick<AppState, 'substituteReqs' | 'offenePlaetze'>,
): Angebot | null {
  if (auswahl.art === 'gesuch') {
    const req = state.substituteReqs.find((r) => r.key === auswahl.key)
    return req ? { art: 'gesuch', req } : null
  }
  const platz = state.offenePlaetze.find((p) => p.key === auswahl.key)
  return platz ? { art: 'platz', platz } : null
}
