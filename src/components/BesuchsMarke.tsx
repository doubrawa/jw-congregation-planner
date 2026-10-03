import { useApp } from '../app/context'
import { useT } from '../i18n/useT'
import './gruppenbesuche.css'

/**
 * „Besuch des Dienstaufsehers" an einem Treffpunkt der besuchten Gruppe in der
 * Besuchswoche (T120, Phase 2) — beim Ansehen wie beim Planen. Wer die Woche
 * aufschlägt, sieht so, warum dort ein anderer Leiter steht als sonst.
 */
export function BesuchsMarke({ woche, grp }: { woche: string; grp: string | null }) {
  const { state } = useApp()
  const { t } = useT()
  if (!grp || !state.gruppenbesuche.some((b) => b.woche === woche && b.grp === grp)) return null
  return <div className="gb-marker">{t.gbMarker}</div>
}
