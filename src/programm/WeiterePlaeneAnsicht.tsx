import { useState } from 'react'
import { useApp } from '../app/context'
import { eigenePerson } from '../app/eigene-person'
import { useKalendertag } from '../app/useKalendertag'
import { PlanTitel } from '../components/PlanTitel'
import { spannenText, werName } from '../components/weitere-plaene-anzeige'
import { fromIso } from '../data/meeting-dates'
import {
  eintraegeJeSpanne,
  plaeneZumAnsehen,
  spanneVon,
  spannenDerGruppe,
  spannenDerPerson,
  spannenImPlan,
  taktVon,
} from '../data/weitere-plaene'
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
 * Ein Plan: Ort, Name, Zeitraum; wann die eigene Gruppe dran ist und wann man
 * selbst (31.10.2026) — und die Wochen oder Monate ab der laufenden (`tag` ist
 * der Kalendertag), die eigenen hervorgehoben. Ausgelassene gehören nicht mehr
 * zum Plan und fehlen.
 */
function PlanAnsicht({ plan, tag }: { plan: WeitererPlan; tag: string }) {
  const { state } = useApp()
  const { t, tu } = useT()
  const ich = eigenePerson(state)
  const meineGruppe = ich?.grp
  const jetzt = spanneVon(taktVon(plan), tag)
  // Jede Spanne des Plans, wie im Ausdruck (`PlanBogen`) — auch die, für die
  // niemand eingetragen ist: Sie steht mit „—" da. Bis zum 16.10.2026 liefen
  // hier die Einträge, und eine Woche ohne Gruppe fehlte einfach.
  const jeSpanne = eintraegeJeSpanne(state.planEintraege, plan.id)
  const kommend = (spannen: string[]): string[] => spannen.filter((s) => s >= jetzt)

  return (
    <section className="karte wp-plan">
      <PlanTitel plan={plan} />
      {meineGruppe && (
        <DranMarken plan={plan} titel={t.wpDeineGruppe} spannen={kommend(spannenDerGruppe(state.planEintraege, plan.id, meineGruppe))} />
      )}
      {ich && <DranMarken plan={plan} titel={t.wpDuBistDran} spannen={kommend(spannenDerPerson(state.planEintraege, plan.id, ich.id))} />}
      <div className="wp-liste">
        {kommend(spannenImPlan(plan, state.planEintraege)).map((spanne) => {
          const eintrag = jeSpanne.get(spanne)
          const eigen = Boolean(eintrag && ((meineGruppe && eintrag.grp === meineGruppe) || (ich && eintrag.pid === ich.id)))
          return (
            <div key={spanne} className={eigen ? 'wp-liste-zeile is-eigen' : 'wp-liste-zeile'}>
              <span className="wp-liste-punkt" aria-hidden="true" />
              <span className="wp-liste-woche">{spannenText(plan, spanne, state.lang)}</span>
              <span className="wp-liste-wer">{werName(eintrag, state, tu) || t.offenDash}</span>
            </div>
          )
        })}
      </div>
      <p className="wp-info">{t.wpNurInfo}</p>
    </section>
  )
}

/**
 * „Deine Gruppe ist dran:" oder „Du bist dran:" — die kommenden Wochen oder
 * Monate als Marken.
 */
function DranMarken({ plan, titel, spannen }: { plan: WeitererPlan; titel: string; spannen: string[] }) {
  const { state } = useApp()
  if (spannen.length === 0) return null
  return (
    <div className="wp-dran">
      <p className="wp-dran-titel">{titel}</p>
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
