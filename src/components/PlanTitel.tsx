import { useApp } from '../app/context'
import type { WeitererPlan } from '../data/types'
import { useT } from '../i18n/useT'
import { zeitraumText } from './weitere-plaene-anzeige'
import './weitere-plaene.css'

/**
 * **Ort, Name und Zeitraum eines Weiteren Plans** — oben in seiner Karte beim
 * Ansehen (`GPlaene`). Der Name ist das Wort dessen, der den Plan angelegt hat,
 * und wird nicht übersetzt.
 */
export function PlanTitel({ plan }: { plan: WeitererPlan }) {
  const { state } = useApp()
  const { t } = useT()
  return (
    <>
      <span className="wp-ort">{t.saal}</span>
      <h2 className="wp-name" dir="auto">
        {plan.name || t.wpOhneName}
      </h2>
      <span className="wp-plan-zeitraum">{zeitraumText(plan, state.lang)}</span>
    </>
  )
}
