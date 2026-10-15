import { useApp } from '../app/context'
import { gruppenName, spannenText, zeitraumText } from '../components/weitere-plaene-anzeige'
import type { WeitererPlan } from '../data/types'
import { eintraegeVon, planSpannen, taktVon } from '../data/weitere-plaene'
import { useT } from '../i18n/useT'
import { nameVon } from '../trolleys/trolley-anzeige'
import { Bogen } from './Bogen'
import { Offen } from './DruckBlatt'
import { tabellenBloecke } from './tabellen-bloecke'

/**
 * **Ein Weiterer Plan auf Papier** (T121, Phase 9; Entwurf `GDruckPlaene`,
 * dort der Winterdienst): je Woche oder Monat des Zeitraums eine Zeile mit der
 * Gruppe, die dran ist, und ihrem Gruppenaufseher — auch im Entwurf (gedruckt
 * wird aus „Plan bearbeiten" wie beim Ansehen). Eine Spanne ohne Gruppe steht
 * gepunktet da; ein langer Plan läuft auf dem nächsten Blatt weiter.
 */
export function PlanBogen({ plan }: { plan: WeitererPlan }) {
  const { state } = useApp()
  const { t, tu } = useT()
  const monatlich = taktVon(plan) === 'monat'
  const gruppeVon = new Map(eintraegeVon(state.planEintraege, plan.id).map((e) => [e.datum, e.grp]))
  const gruppe = (grp: string | null) => gruppenName(grp, state.groups, tu) || <Offen breite={110} />
  const aufseher = (grp: string | null) => nameVon(state.persons, state.groups.find((g) => g.id === grp)?.overseerId ?? null)
  const zeilen = planSpannen(plan).map((spanne) => {
    const grp = gruppeVon.get(spanne) ?? null
    return { key: spanne, zellen: [spannenText(plan, spanne, state.lang), gruppe(grp), aufseher(grp)] }
  })
  const form = {
    spalten: 'minmax(0, 1fr) 120px 200px',
    kopf: [monatlich ? t.druckMonatSpalte : t.gbWoche, t.gbGruppe, t.rolleGruppenaufseher],
    betont: 1,
    leise: 2,
  }
  const intro = <p className="druck-plan-intro">{monatlich ? t.druckPlanJeMonat : t.druckPlanJeWoche}</p>
  return (
    <Bogen
      titel={plan.name || t.wpOhneName}
      zeitraum={`${t.saal} · ${zeitraumText(plan, state.lang)}`}
      bloecke={tabellenBloecke(plan.id, form, zeilen, intro)}
    />
  )
}
