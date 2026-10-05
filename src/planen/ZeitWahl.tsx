import { useApp } from '../app/context'
import { FS_TIME_OPTIONS } from '../data/fs'
import { WOCHENTAGE_AB_MONTAG, wochentagNameAusWd } from './wochentage'

/*
 * **Uhrzeit und Wochentag zur Wahl** — Treffpunkte der Woche, Grundplan und
 * Termine des Zeugnisgebens fragen dasselbe. Bis zum 5.10.2026 stand die
 * Auswahl fünf- bzw. dreimal ausgeschrieben da.
 */

/** Eine Uhrzeit aus dem Raster der Treffpunkte (`FS_TIME_OPTIONS`). */
export function ZeitWahl({
  value,
  label,
  onChange,
  className = 'fs-select fs-select--time',
}: {
  value: string
  label: string
  onChange: (zeit: string) => void
  className?: string
}) {
  return (
    <select className={className} value={value} aria-label={label} onChange={(e) => onChange(e.target.value)}>
      {FS_TIME_OPTIONS.map((tm) => (
        <option key={tm} value={tm}>
          {tm}
        </option>
      ))}
    </select>
  )
}

/** Ein Wochentag (JS-Zählung, 0 = Sonntag), ab Montag aufgelistet und in der App-Sprache benannt. */
export function WochentagWahl({
  value,
  label,
  onChange,
}: {
  value: number
  label: string
  onChange: (wd: number) => void
}) {
  const { state } = useApp()
  return (
    <select className="fs-select" value={value} aria-label={label} onChange={(e) => onChange(Number(e.target.value))}>
      {WOCHENTAGE_AB_MONTAG.map((d) => (
        <option key={d} value={d}>
          {wochentagNameAusWd(d, state.lang)}
        </option>
      ))}
    </select>
  )
}
