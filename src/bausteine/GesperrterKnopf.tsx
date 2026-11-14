import type { MouseEvent, ReactNode } from 'react'

/**
 * **Ein Knopf, der gesperrt sein kann, ohne den Fokus abzugeben** (T121):
 * gesperrt per `aria-disabled` statt `disabled` — ein Screenreader sagt „nicht
 * verfügbar", der Tipp bewirkt nichts, und der Fokus bleibt, wo er ist.
 *
 * Für Knöpfe, die unter dem Fokus gesperrt werden: − an der unteren Grenze,
 * „Nach oben" beim ersten Punkt. Ein `disabled` gäbe den Fokus dort an die
 * Seite ab — wer per Tastatur bis zur Grenze zählt, stünde danach hinter dem
 * Blatt. Wie er gesperrt aussieht, sagt die Klasse des Aufrufers.
 */
export function GesperrterKnopf({
  className,
  label,
  gesperrt,
  onTipp,
  onBlur,
  children,
}: {
  className: string
  /** Für Knöpfe ohne Text (nur ein Zeichen) — sonst sagt der Inhalt, was er tut. */
  label?: string
  gesperrt: boolean
  /** Mit dem Ereignis — ein Knopf mit zwei Tipps (`useZweiTipp`) merkt sich daran, wer geschärft ist. */
  onTipp: (e: MouseEvent<HTMLButtonElement>) => void
  /** Für einen Knopf mit zwei Tipps: Wer weggeht, hat nicht bestätigt. */
  onBlur?: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      className={className}
      aria-label={label}
      aria-disabled={gesperrt}
      onClick={(e) => {
        if (!gesperrt) onTipp(e)
      }}
      onBlur={onBlur}
    >
      {children}
    </button>
  )
}
