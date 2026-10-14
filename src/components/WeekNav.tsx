import type { ReactNode } from 'react'
import { GesperrterKnopf } from '../bausteine/GesperrterKnopf'
import { Zeichen } from '../bausteine/Zeichen'
import { useT } from '../i18n/useT'
import './components.css'

interface WeekNavProps {
  canPrev: boolean
  canNext: boolean
  onPrev: () => void
  onNext: () => void
  /** Mittelteil (Wochenbereich, darunter ein Hinweis) */
  children: ReactNode
}

/**
 * **Die Woche wählen** (T121, Baustein `GWoche`): runde Knöpfe ‹ › links und
 * rechts, dazwischen die Woche — im Programm, beim Planen und bei den
 * Trolleys. Die Pfeile zeigen in Leserichtung (`Zeichen` spiegelt sie von
 * rechts nach links).
 *
 * Am Rand gesperrt wird per `GesperrterKnopf`, nicht per `disabled`: Wer mit
 * der Tastatur bis zur letzten Woche blättert, sperrt den Pfeil unter dem
 * eigenen Fokus — mit `disabled` fiel der Fokus auf die Seite, und der nächste
 * Tab begann wieder oben (gemessen am 15.10.2026).
 */
export function WeekNav({ canPrev, canNext, onPrev, onNext, children }: WeekNavProps) {
  const { t } = useT()
  return (
    <div className="week-nav">
      <GesperrterKnopf className="rund-knopf week-arrow" label={t.a11yPrevWeek} gesperrt={!canPrev} onTipp={onPrev}>
        <Zeichen name="zurueck" />
      </GesperrterKnopf>
      <div className="week-center">{children}</div>
      <GesperrterKnopf className="rund-knopf week-arrow" label={t.a11yNextWeek} gesperrt={!canNext} onTipp={onNext}>
        <Zeichen name="weiter" />
      </GesperrterKnopf>
    </div>
  )
}
