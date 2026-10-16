import { useState } from 'react'
import { useApp } from '../app/context'
import { useKalendertag } from '../app/useKalendertag'
import { Punkt, type PunktArt } from '../bausteine/Punkt'
import { Zeichen } from '../bausteine/Zeichen'
import { Bereichstitel } from '../components/Bereichstitel'
import { useBackDismiss } from '../components/useBackDismiss'
import { planUnterzeile } from '../components/weitere-plaene-anzeige'
import { fromIso } from '../data/meeting-dates'
import { neuerPlan, planStand, type PlanStand } from '../data/weitere-plaene'
import { useT } from '../i18n/useT'
import type { WeitererPlan } from '../data/types'
import { PlanBearbeiten } from './PlanBearbeiten'
import '../components/weitere-plaene.css'

/**
 * Die Abschnitte der Liste in ihrer Reihenfolge (Entwurf `GPlaeneListe`), je
 * mit dem Punkt ihres Stands: gestrichelt der Entwurf, den noch niemand sieht,
 * im Akzent, was gilt, voll, was war.
 */
const ABSCHNITTE: ReadonlyArray<{ stand: PlanStand; punkt: PunktArt }> = [
  { stand: 'entwurf', punkt: 'offen' },
  { stand: 'aktuell', punkt: 'du' },
  { stand: 'abgeschlossen', punkt: 'voll' },
]

/**
 * **Weitere Pläne** beim Planen (T120, Phase 5; T121, Entwürfe
 * `GPlaeneListe`, `GPlaenePlanen`) — für Admin und Planer.
 *
 * Zwei Ansichten in einem Bildschirm: die Liste, je Stand eine Karte, und der
 * geöffnete Plan (`PlanBearbeiten`). Welcher Plan offen ist, merkt sich nur
 * dieser Baustein: Wer das Thema verlässt und zurückkommt, steht wieder vor der
 * Liste.
 *
 * Eine Wahl der Vorlage gibt es seit dem 4.10.2026 nicht mehr: Mit „Familien
 * reihum" ging die zweite Vorlage, und jeder Plan ist ein Königreichssaal.
 * „Neuer Plan" legt ihn an und öffnet ihn gleich.
 */
export function WeiterePlaenePlan() {
  const { state, dispatch } = useApp()
  const { t } = useT()
  const tag = useKalendertag()
  const [offen, setOffen] = useState<string | null>(null)
  const plan = offen ? state.plaene.find((p) => p.id === offen) : undefined
  // Zurück am Handy schließt zuerst den geöffneten Plan (4.10.2026).
  useBackDismiss(plan !== undefined, () => setOffen(null), 'unteransicht')

  if (plan) return <PlanBearbeiten plan={plan} onZurueck={() => setOffen(null)} />

  const anlegen = (): void => {
    const id = `p${crypto.randomUUID()}`
    dispatch({ type: 'wpPlanAnlegen', plan: neuerPlan(id, fromIso(tag)) })
    setOffen(id)
  }
  const heute = fromIso(tag)
  const titel: Record<PlanStand, string> = {
    entwurf: t.wpEntwuerfe,
    aktuell: t.wpAktuell,
    abgeschlossen: t.wpAbgeschlossen,
  }
  return (
    <section className="screen prog">
      <Bereichstitel thema="weitere" />
      <p className="klein-text">{t.wpHinweis}</p>
      {state.plaene.length === 0 && (
        <section className="karte wp-leer-karte">
          <p className="prog-meta">{t.wpKeine}</p>
        </section>
      )}
      {ABSCHNITTE.map(({ stand, punkt }) => {
        const imAbschnitt = state.plaene.filter((p) => planStand(p, heute) === stand)
        if (imAbschnitt.length === 0) return null
        return (
          <section key={stand} className="karte wp-abschnitt" data-stand={stand}>
            <h2 className="abschnitt-titel karte-titel">
              <Punkt art={punkt} />
              {titel[stand]}
            </h2>
            {imAbschnitt.map((p) => (
              <PlanZeile key={p.id} plan={p} stand={stand} tag={tag} onOeffnen={() => setOffen(p.id)} />
            ))}
          </section>
        )
      })}
      {/* Einen Plan legen Admin und Planer an (der Planer seit dem 15.10.2026) —
          nur sie kommen hierher (`PlanenScreen`). */}
      <button type="button" className="knopf-neu" onClick={anlegen}>
        <Zeichen name="plus" />
        {t.wpNeu}
      </button>
    </section>
  )
}

/** Ein Plan in der Liste: sein Name, darunter Ort und wann — ein Tipp öffnet ihn. */
function PlanZeile({
  plan,
  stand,
  tag,
  onOeffnen,
}: {
  plan: WeitererPlan
  stand: PlanStand
  tag: string
  onOeffnen: () => void
}) {
  const { state } = useApp()
  const { t } = useT()
  return (
    <button type="button" className="wp-plan-zeile" onClick={onOeffnen}>
      <span className="wp-plan-zeile-text">
        <span className="wp-plan-zeile-name" dir="auto">
          {plan.name || t.wpOhneName}
        </span>
        <span className="klein-text">{`${t.saal} · ${planUnterzeile(plan, stand, tag, state.lang, t)}`}</span>
      </span>
      <Zeichen name="weiter" />
    </button>
  )
}
