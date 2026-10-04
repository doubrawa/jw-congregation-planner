import { useApp } from '../app/context'
import { eigenePerson } from '../app/eigene-person'
import { useKalendertag } from '../app/useKalendertag'
import { besuchsWocheText } from '../components/gruppenbesuch-anzeige'
import { gruppenName, zeitraumText } from '../components/weitere-plaene-anzeige'
import { fromIso, montagVon } from '../data/meeting-dates'
import { eintraegeVon, plaeneZumAnsehen, wochenDerGruppe } from '../data/weitere-plaene'
import { useT } from '../i18n/useT'
import type { Person, WeitererPlan } from '../data/types'
import '../components/weitere-plaene.css'

/**
 * **Weitere Pläne** beim Ansehen (T120, Phase 5).
 *
 * Die veröffentlichten Pläne, die laufen oder kommen (`plaeneZumAnsehen`; in
 * der Datenbank entscheidet `plan_sichtbar`). Oben steht, wann die eigene
 * Gruppe dran ist. Zu bestätigen gibt es nichts.
 */
export function WeiterePlaeneAnsicht() {
  const { state } = useApp()
  const { t } = useT()
  const tag = useKalendertag()
  const me = eigenePerson(state)
  const plaene = plaeneZumAnsehen(state.plaene, fromIso(tag))

  if (plaene.length === 0) {
    return (
      <div className="panel panel--lead panel--pb16" data-farbe="neutral">
        <p className="prog-meta">{t.wpKeine}</p>
      </div>
    )
  }
  return (
    <>
      {plaene.map((plan) => (
        <PlanAnsicht key={plan.id} plan={plan} me={me} tag={tag} />
      ))}
    </>
  )
}

/** Ein Plan beim Ansehen: Art, Name, Zeitraum — und die Wochen ab `tag`, dem Kalendertag. */
function PlanAnsicht({ plan, me, tag }: { plan: WeitererPlan; me: Person | undefined; tag: string }) {
  const { state } = useApp()
  const { t, tu } = useT()
  const eintraege = eintraegeVon(state.planEintraege, plan.id)
  const dieseWoche = montagVon(tag)

  return (
    <div className="panel panel--pb16" data-farbe="neutral2">
      <h2 className="panel-label">{t.saal}</h2>
      <div className="wp-name" dir="auto">
        {plan.name || t.wpOhneName}
      </div>
      <div className="wp-zeitraum">{zeitraumText(plan, state.lang)}</div>
      {me?.grp && <DeineGruppe wochen={wochenDerGruppe(eintraege, plan.id, me.grp).filter((w) => w >= dieseWoche)} />}
      <div className="wp-liste">
        {eintraege
          .filter((e) => e.datum >= dieseWoche)
          .map((e) => (
            <div key={e.id} className={me?.grp && e.grp === me.grp ? 'wp-liste-zeile is-eigen' : 'wp-liste-zeile'}>
              <span>{besuchsWocheText(e.datum, state.lang)}</span>
              <span className="wp-liste-wer">{gruppenName(e.grp, state.groups, tu) || t.offenDash}</span>
            </div>
          ))}
      </div>
      <p className="wp-info">{t.wpNurInfo}</p>
    </div>
  )
}

/** „Deine Gruppe ist dran:" — die kommenden Wochen der eigenen Gruppe als Marken. */
function DeineGruppe({ wochen }: { wochen: string[] }) {
  const { state } = useApp()
  const { t } = useT()
  if (wochen.length === 0) return null
  return (
    <>
      <p className="wp-dran">{t.wpDeineGruppe}</p>
      <div className="wp-chips">
        {wochen.map((w) => (
          <span key={w} className="wp-chip">
            {besuchsWocheText(w, state.lang)}
          </span>
        ))}
      </div>
    </>
  )
}
