import { useEffect, useRef, useState } from 'react'
import './datepicker.css'

/**
 * Eigener Datums-Popup-Kalender (statt des nicht stylebaren nativen
 * `<input type="date">`). Controlled über ISO-Strings ("YYYY-MM-DD"); Wochentags-
 * und Monatsnamen kommen aus `Intl` (locale). `min`/`max` (ISO) sperren Tage —
 * so lassen sich Von/Bis koppeln. Layout spiegelt sich in RTL automatisch.
 */
interface DatePickerProps {
  value: string
  onChange: (iso: string) => void
  locale: string
  min?: string
  max?: string
  placeholder: string
  ariaLabel: string
}

const DAY = 864e5
const iso = (d: Date): string => d.toISOString().slice(0, 10)
const monthStart = (v: string): { y: number; m: number } => {
  const d = v ? new Date(`${v}T12:00:00Z`) : new Date()
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() }
}

/** 6×7-Raster ab Montag für den angezeigten Monat (UTC, zeitzonenneutral). */
function grid(y: number, m: number): Date[] {
  const first = new Date(Date.UTC(y, m, 1))
  const lead = (first.getUTCDay() + 6) % 7 // Montag = 0
  const start = Date.UTC(y, m, 1 - lead)
  return Array.from({ length: 42 }, (_, i) => new Date(start + i * DAY))
}

function weekdayLabels(locale: string): string[] {
  const fmt = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' })
  const monday = Date.UTC(2024, 0, 1) // 1. Jan 2024 = Montag
  return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(monday + i * DAY)))
}

export function DatePicker({ value, onChange, locale, min, max, placeholder, ariaLabel }: DatePickerProps) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState(() => monthStart(value))
  const ref = useRef<HTMLDivElement>(null)

  // Beim Öffnen auf den gewählten (bzw. aktuellen) Monat springen.
  useEffect(() => {
    if (open) setView(monthStart(value))
  }, [open, value])

  // Klick außerhalb / Escape schließt das Popup.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const label = value
    ? new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
        new Date(`${value}T12:00:00Z`),
      )
    : ''
  const title = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(view.y, view.m, 1)),
  )
  const todayIso = iso(new Date())
  const shift = (delta: number) => {
    const d = new Date(Date.UTC(view.y, view.m + delta, 1))
    setView({ y: d.getUTCFullYear(), m: d.getUTCMonth() })
  }

  return (
    <div className="dp" ref={ref}>
      <button
        type="button"
        className={value ? 'dp-field' : 'dp-field dp-field--empty'}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span>{label || placeholder}</span>
        <svg className="dp-icon" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <rect x="2" y="3" width="12" height="11" rx="2" fill="none" stroke="currentColor" strokeWidth="1.3" />
          <path d="M2 6.5h12M5 1.5v3M11 1.5v3" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      </button>

      {open && (
        <div className="dp-pop" role="dialog" aria-label={ariaLabel}>
          <div className="dp-head">
            <button type="button" className="dp-nav" aria-label="‹" onClick={() => shift(-1)}>
              ‹
            </button>
            <div className="dp-title">{title}</div>
            <button type="button" className="dp-nav" aria-label="›" onClick={() => shift(1)}>
              ›
            </button>
          </div>
          <div className="dp-weekdays">
            {weekdayLabels(locale).map((w, i) => (
              <span key={i}>{w}</span>
            ))}
          </div>
          <div className="dp-grid">
            {grid(view.y, view.m).map((d) => {
              const di = iso(d)
              const disabled = (min != null && di < min) || (max != null && di > max)
              const cls = ['dp-day']
              if (d.getUTCMonth() !== view.m) cls.push('dp-day--muted')
              if (di === value) cls.push('dp-day--sel')
              else if (di === todayIso) cls.push('dp-day--today')
              return (
                <button
                  key={di}
                  type="button"
                  className={cls.join(' ')}
                  disabled={disabled}
                  onClick={() => {
                    onChange(di)
                    setOpen(false)
                  }}
                >
                  {d.getUTCDate()}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
