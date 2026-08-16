/** Slot-Chip: belegt = solide Pille + Bestätigungs-Zeichen ✓/…; offen = gestrichelt. */
export function SlotChip({
  text,
  open,
  showStatus,
  pending,
  konflikt = false,
  onClick,
}: {
  text: string
  open: boolean
  showStatus: boolean
  pending: boolean
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
        <span className={pending ? 'slot-status is-pending' : 'slot-status'}>
          {pending ? '…' : '✓'}
        </span>
      )}
    </button>
  )
}
