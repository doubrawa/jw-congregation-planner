/** Slot-Chip: belegt = solide Pille + Bestätigungs-Zeichen ✓/…; offen = gestrichelt. */
export function SlotChip({
  text,
  open,
  showStatus,
  pending,
  onClick,
}: {
  text: string
  open: boolean
  showStatus: boolean
  pending: boolean
  onClick: () => void
}) {
  return (
    <button type="button" className={open ? 'slot-chip is-open' : 'slot-chip'} onClick={onClick}>
      {text}
      {showStatus && (
        <span className={pending ? 'slot-status is-pending' : 'slot-status'}>
          {pending ? '…' : '✓'}
        </span>
      )}
    </button>
  )
}
