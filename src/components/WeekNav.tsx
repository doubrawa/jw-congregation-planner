import type { ReactNode } from 'react'
import { useT } from '../i18n/useT'
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
        ‹
      </button>
      <div className="week-center">{children}</div>
      <button
        type="button"
        className="week-arrow"
        onClick={onNext}
        disabled={!canNext}
        aria-label={t.a11yNextWeek}
      >
        ›
      </button>
    </div>
  )
}
