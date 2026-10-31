import { useApp } from '../app/context'
import { spannenText, werName, zeitraumText } from '../components/weitere-plaene-anzeige'
import type { PlanEintrag, WeitererPlan } from '../data/types'
import { eintraegeJeSpanne, spannenImPlan, taktVon } from '../data/weitere-plaene'
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
 *
 * Seit dem 31.10.2026 kann statt der Gruppe eine Person dran sein — dann
 * heißt die Spalte „Wer", und die Einleitung spricht nicht nur von Gruppen —,
 * und ausgelassene Spannen fehlen.
 */
export function PlanBogen({ plan }: { plan: WeitererPlan }) {
  const { state } = useApp()
  const { t, tu } = useT()
  const monatlich = taktVon(plan) === 'monat'
  const jeSpanne = eintraegeJeSpanne(state.planEintraege, plan.id)
  const spannen = spannenImPlan(plan, state.planEintraege)
  const mitPersonen = spannen.some((s) => jeSpanne.get(s)?.pid)
  const wer = (eintrag: PlanEintrag | undefined) => werName(eintrag, state, tu) || <Offen breite={110} />
  const aufseher = (grp: string | null) => nameVon(state.persons, state.groups.find((g) => g.id === grp)?.overseerId ?? null)
  const zeilen = spannen.map((spanne) => {
    const eintrag = jeSpanne.get(spanne)
    return { key: spanne, zellen: [spannenText(plan, spanne, state.lang), wer(eintrag), aufseher(eintrag?.grp ?? null)] }
  })
  const form = {
    // Ein Name ist länger als „Gruppe 3": In 120 px brach „Christian Schneider"
    // auf zwei Zeilen, während der Aufseher daneben leer blieb.
    spalten: mitPersonen ? 'minmax(0, 1fr) 170px 170px' : 'minmax(0, 1fr) 120px 200px',
    kopf: [monatlich ? t.druckMonatSpalte : t.gbWoche, mitPersonen ? t.wpWer : t.gbGruppe, t.rolleGruppenaufseher],
    betont: 1,
    leise: 2,
  }
  const einleitung = monatlich
    ? mitPersonen
      ? t.druckPlanJeMonatWer
      : t.druckPlanJeMonat
    : mitPersonen
      ? t.druckPlanJeWocheWer
      : t.druckPlanJeWoche
  const intro = <p className="druck-plan-intro">{einleitung}</p>
  return (
    <Bogen
      titel={plan.name || t.wpOhneName}
      zeitraum={`${t.saal} · ${zeitraumText(plan, state.lang)}`}
      bloecke={tabellenBloecke(plan.id, form, zeilen, intro)}
    />
  )
}
