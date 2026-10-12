import type { ReactNode } from 'react'
import { Zeichen } from '../bausteine/Zeichen'
import { useT } from '../i18n/useT'
import './components.css'

interface WeekNavProps {
  canPrev: boolean
  canNext: boolean
  onPrev: () => void
  onNext: () => void
  /** Mittelteil (Wochenbereich, darunter ein Hinweis) */
  children: ReactNode
}

/**
 * **Die Woche wählen** (T121, Baustein `GWoche`): runde Knöpfe ‹ › links und
 * rechts, dazwischen die Woche — im Programm und beim Planen. Die Pfeile
 * zeigen in Leserichtung (`Zeichen` spiegelt sie von rechts nach links).
 */
export function WeekNav({ canPrev, canNext, onPrev, onNext, children }: WeekNavProps) {
  const { t } = useT()
  return (
    <div className="week-nav">
      <button type="button" className="rund-knopf week-arrow" onClick={onPrev} disabled={!canPrev} aria-label={t.a11yPrevWeek}>
        <Zeichen name="zurueck" />
      </button>
      <div className="week-center">{children}</div>
      <button type="button" className="rund-knopf week-arrow" onClick={onNext} disabled={!canNext} aria-label={t.a11yNextWeek}>
        <Zeichen name="weiter" />
      </button>
    </div>
  )
}
