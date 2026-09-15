import type { ZusageStand } from './useZusage'
import { ZusagePunkt } from './ZusageStatus'

/** Slot-Chip: belegt = solide Pille + Ampel-Punkt der Zusage; offen = gestrichelt. */
export function SlotChip({
  text,
  open,
  showStatus,
  status,
  konflikt = false,
  onClick,
}: {
  text: string
  open: boolean
  showStatus: boolean
  /** Stand der Zusage **dieses** Platzes (`useZusage`); sichtbar nur mit `showStatus`. */
  status: ZusageStand
  /**
   * Diese Person steht im Konflikt-Banner der Zusammenkunft. Der Chip hebt
   * sich dann ab — sonst nennt das Banner einen Namen, und der Planer sucht
   * ihn im Programm, statt ihn zu sehen.
   */
  konflikt?: boolean
  onClick: () => void
}) {
  const klassen = ['slot-chip', open ? 'is-open' : '', konflikt ? 'is-konflikt' : '']
  return (
    <button type="button" className={klassen.filter(Boolean).join(' ')} onClick={onClick}>
      {/* Derselbe Punkt, den das Banner vor jeder Zeile führt — er verbindet
          beide, ohne eine Farbfläche zu benutzen (T80). Rein zeichenhaft: was
          er bedeutet, steht als Satz im Banner darüber. */}
      {konflikt && <span className="slot-konflikt-dot" aria-hidden="true" />}
      {text}
      {showStatus && (
        <>
          {/* Ein **geschütztes** Leerzeichen trennt Name und Stufe — auch im
              Namen des Knopfes („Gebet: Jörg Roth wartet auf Bestätigung",
              nicht „…Rothwartet"). Ein gewöhnliches wäre eine Umbruchstelle:
              In einem umbrechenden Chip landete der Punkt allein auf der
              nächsten Zeile. */}
          {'\u00A0'}
          <ZusagePunkt stufe={status.stufe} />
          <span className="sr-only">{status.label}</span>
        </>
      )}
    </button>
  )
}
