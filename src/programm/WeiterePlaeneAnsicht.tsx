import { useState } from 'react'
import { useApp } from '../app/context'
import { eigenePerson } from '../app/eigene-person'
import { useKalendertag } from '../app/useKalendertag'
import { PlanTitel } from '../components/PlanTitel'
import { gruppenName, spannenText } from '../components/weitere-plaene-anzeige'
import { fromIso } from '../data/meeting-dates'
import { eintraegeVon, plaeneZumAnsehen, planSpannen, spanneVon, spannenDerGruppe, taktVon } from '../data/weitere-plaene'
import { useT } from '../i18n/useT'
import type { WeitererPlan } from '../data/types'
import { PlanBogen } from '../druck/PlanBogen'
import { AnsichtDrucken } from './AnsichtDrucken'
import '../components/weitere-plaene.css'

/**
 * **Weitere Pläne** beim Ansehen (T120, Phase 5; T121, Entwurf `GPlaene`).
 *
 * Die veröffentlichten Pläne, die laufen oder kommen (`plaeneZumAnsehen`; in
 * der Datenbank entscheidet `plan_sichtbar`). Gibt es mehrere, wählt man oben
 * einen; gezeigt — und gedruckt — wird der gewählte. Zu bestätigen gibt es
 * nichts.
 */
export function WeiterePlaeneAnsicht() {
  const { state } = useApp()
  const { t } = useT()
  const tag = useKalendertag()
  const [gewaehlt, setGewaehlt] = useState<string | null>(null)
  const plaene = plaeneZumAnsehen(state.plaene, fromIso(tag))
  // Der gewählte Plan — solange keiner gewählt ist oder er nicht mehr läuft,
  // der erste.
  const plan = plaene.find((p) => p.id === gewaehlt) ?? plaene[0]

  if (!plan) {
    return (
      <section className="karte wp-leer-karte">
        <p className="prog-meta">{t.wpKeine}</p>
      </section>
    )
  }
  return (
    <>
      <AnsichtDrucken titel={t.navWeiterePlaene} bogen={() => <PlanBogen plan={plan} />} />
      {plaene.length > 1 && (
        <div className="wp-wahl" role="group" aria-label={t.navWeiterePlaene}>
          {plaene.map((p) => (
            <button
              key={p.id}
              type="button"
              className="wp-wahl-knopf"
              aria-pressed={p.id === plan.id}
              dir="auto"
              onClick={() => setGewaehlt(p.id)}
            >
              {p.name || t.wpOhneName}
            </button>
          ))}
        </div>
      )}
      <PlanAnsicht plan={plan} tag={tag} />
    </>
  )
}

/**
 * Ein Plan: Ort, Name, Zeitraum; wann die eigene Gruppe dran ist — und die
 * Wochen oder Monate ab der laufenden (`tag` ist der Kalendertag), die der
 * eigenen Gruppe hervorgehoben.
 */
function PlanAnsicht({ plan, tag }: { plan: WeitererPlan; tag: string }) {
  const { state } = useApp()
  const { t, tu } = useT()
  const meineGruppe = eigenePerson(state)?.grp
  const eintraege = eintraegeVon(state.planEintraege, plan.id)
  const jetzt = spanneVon(taktVon(plan), tag)
  // Jede Spanne des Plans, wie im Ausdruck (`PlanBogen`) — auch die, für die
  // keine Gruppe eingetragen ist: Sie steht mit „—" da. Bis zum 16.10.2026
  // liefen hier die Einträge, und eine Woche ohne Gruppe fehlte einfach.
  const gruppeVon = new Map(eintraege.map((e) => [e.datum, e.grp]))

  return (
    <section className="karte wp-plan">
      <PlanTitel plan={plan} />
      {meineGruppe && (
        <DeineGruppe plan={plan} spannen={spannenDerGruppe(eintraege, plan.id, meineGruppe).filter((s) => s >= jetzt)} />
      )}
      <div className="wp-liste">
        {planSpannen(plan)
          .filter((spanne) => spanne >= jetzt)
          .map((spanne) => {
            const grp = gruppeVon.get(spanne) ?? null
            return (
              <div key={spanne} className={meineGruppe && grp === meineGruppe ? 'wp-liste-zeile is-eigen' : 'wp-liste-zeile'}>
                <span className="wp-liste-punkt" aria-hidden="true" />
                <span className="wp-liste-woche">{spannenText(plan, spanne, state.lang)}</span>
                <span className="wp-liste-wer">{gruppenName(grp, state.groups, tu) || t.offenDash}</span>
              </div>
            )
          })}
      </div>
      <p className="wp-info">{t.wpNurInfo}</p>
    </section>
  )
}

/** „Deine Gruppe ist dran:" — die kommenden Wochen oder Monate der eigenen Gruppe als Marken. */
function DeineGruppe({ plan, spannen }: { plan: WeitererPlan; spannen: string[] }) {
  const { state } = useApp()
  const { t } = useT()
  if (spannen.length === 0) return null
  return (
    <div className="wp-dran">
      <p className="wp-dran-titel">{t.wpDeineGruppe}</p>
      <div className="wp-chips">
        {spannen.map((s) => (
          <span key={s} className="wp-chip">
            {spannenText(plan, s, state.lang)}
          </span>
        ))}
      </div>
    </div>
  )
}
