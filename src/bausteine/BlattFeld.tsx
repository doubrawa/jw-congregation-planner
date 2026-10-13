import type { ReactNode } from 'react'

/**
 * **Ein Feld in einem Blatt** (T121) — die Marke darüber, darunter das Feld;
 * ein Tipp auf die Marke führt ins Feld. Die Blätter der Treffpunkte, des
 * Grundplans und der Gruppenbesuche stellen ihre Felder so untereinander
 * (`.blatt-felder`).
 */
export function BlattFeld({ marke, children }: { marke: string; children: ReactNode }) {
  return (
    <label className="blatt-feld">
      <span className="feld-marke">{marke}</span>
      {children}
    </label>
  )
}
