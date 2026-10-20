import { useEffect, useRef, useState } from 'react'
import { fromIso, isoDay } from '../data/meeting-dates'
import { Chevron } from './Chevron'
import { gebundenesDatum } from './datum-anzeige'
import { imMonat, monatPlus, monatsRaster, monatVon, wochentagKuerzel } from './kalender'
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
  prevLabel: string // Vorlesbare Beschriftung „‹" (Screenreader)
  nextLabel: string // Vorlesbare Beschriftung „›"
}

export function DatePicker({ value, onChange, locale, min, max, placeholder, ariaLabel, prevLabel, nextLabel }: DatePickerProps) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState(() => monatVon(value))
  const ref = useRef<HTMLDivElement>(null)

  // Beim Öffnen auf den gewählten (bzw. aktuellen) Monat springen.
  useEffect(() => {
    if (open) setView(monatVon(value))
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

  // Über `datum-anzeige`: einmal gebaute Formate, Zahl und Wort gebunden (T128).
  const label = value ? gebundenesDatum(fromIso(value), locale, 'tagKurzJahr') : ''
  const title = gebundenesDatum(new Date(view.y, view.m, 1), locale, 'monatJahr')
  // „Heute" ist ein örtlicher Begriff: `isoDay` liest die örtlichen Bestandteile
  // — der UTC-Tag wäre in Mitteleuropa nach Mitternacht noch der gestrige.
  const todayIso = isoDay(new Date())
  const shift = (delta: number) => setView(monatPlus(view, delta))

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
        // **Steht der Wähler in einer Marke** (`BlattFeld`, eine `<label>`),
        // gibt der Browser jeden Klick auf eine Fläche ohne eigenen Knopf —
        // Monatstitel, Wochentage, die Fugen des Rasters — an das erste Feld der
        // Marke weiter: an den Auslöser, der den Kalender wieder zuklappte
        // (gemessen am 15.10.2026, Trolley eintragen). Ein Klick hier drin ist
        // erledigt; die Knöpfe haben ihn da schon bekommen.
        <div className="dp-pop" role="dialog" aria-label={ariaLabel} onClick={(e) => e.preventDefault()}>
          <div className="dp-head">
            <button type="button" className="dp-nav" aria-label={prevLabel} onClick={() => shift(-1)}>
              <Chevron dir="prev" />
            </button>
            <div className="dp-title">{title}</div>
            <button type="button" className="dp-nav" aria-label={nextLabel} onClick={() => shift(1)}>
              <Chevron dir="next" />
            </button>
          </div>
          <div className="dp-weekdays">
            {wochentagKuerzel(locale).map((w, i) => (
              <span key={i}>{w}</span>
            ))}
          </div>
          <div className="dp-grid">
            {monatsRaster(view).map((di) => {
              const disabled = (min != null && di < min) || (max != null && di > max)
              const cls = ['dp-day']
              if (!imMonat(di, view)) cls.push('dp-day--muted')
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
                  {Number(di.slice(8))}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
