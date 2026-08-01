import type { ReactNode } from 'react'
import { useT } from '../i18n/useT'
import { Chevron } from './Chevron'
import './components.css'

interface WeekNavProps {
  canPrev: boolean
  canNext: boolean
  onPrev: () => void
  onNext: () => void
  /** Mittelteil (Wochenbereich, ggf. Bibelbuch) */
  children: ReactNode
  className?: string
}

/** Runde Blätter-Buttons ‹ › mit Mittelteil — Programm und Planen. */
export function WeekNav({ canPrev, canNext, onPrev, onNext, children, className }: WeekNavProps) {
  const { t } = useT()
  return (
    <div className={className ? `week-nav ${className}` : 'week-nav'}>
      <button
        type="button"
        className="week-arrow"
        onClick={onPrev}
        disabled={!canPrev}
        aria-label={t.a11yPrevWeek}
      >
        <Chevron dir="prev" />
      </button>
      <div className="week-center">{children}</div>
      <button
        type="button"
        className="week-arrow"
        onClick={onNext}
        disabled={!canNext}
        aria-label={t.a11yNextWeek}
      >
        <Chevron dir="next" />
      </button>
    </div>
  )
}
