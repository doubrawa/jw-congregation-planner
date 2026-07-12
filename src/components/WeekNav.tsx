import type { ReactNode } from 'react'
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
  return (
    <div className={className ? `week-nav ${className}` : 'week-nav'}>
      <button
        type="button"
        className="week-arrow"
        onClick={onPrev}
        disabled={!canPrev}
        aria-label="Vorherige Woche"
      >
        ‹
      </button>
      <div className="week-center">{children}</div>
      <button
        type="button"
        className="week-arrow"
        onClick={onNext}
        disabled={!canNext}
        aria-label="Nächste Woche"
      >
        ›
      </button>
    </div>
  )
}
