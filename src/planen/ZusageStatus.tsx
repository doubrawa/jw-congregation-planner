import { useT } from '../i18n/useT'
import type { TaskStatus } from '../data/types'
import { ZUSAGE_KLASSE, ZUSAGE_LABEL, ZUSAGE_STUFEN } from './useZusage'

/** Der Ampel-Punkt selbst — rein zeichenhaft; was er bedeutet, steht daneben. */
export function ZusagePunkt({ stufe }: { stufe: TaskStatus }) {
  return <span className={`zusage-punkt ${ZUSAGE_KLASSE[stufe]}`} aria-hidden="true" />
}

/** Legende über dem Plan: dieselben Punkte wie an den Chips, beim Namen genannt. */
export function ZusageLegende() {
  const { t } = useT()
  return (
    <p className="plan-legend">
      {ZUSAGE_STUFEN.map((stufe) => (
        <span key={stufe} className="plan-legend-item">
          <ZusagePunkt stufe={stufe} />
          {t[ZUSAGE_LABEL[stufe]]}
        </span>
      ))}
    </p>
  )
}
