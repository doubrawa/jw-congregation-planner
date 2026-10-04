import type { ReactNode } from 'react'
import { useApp } from '../app/context'
import type { OzSchicht } from '../data/zeugnis'
import { useT } from '../i18n/useT'
import { ozSchichtText } from './zeugnis-anzeige'

/**
 * **Kopf einer Schicht** des öffentlichen Zeugnisgebens — Planen und Ansehen
 * zeigen ihn gleich: Uhrzeit groß, Ort, Tag und Zeitspanne darunter. Die Form
 * leiht er sich vom Treffpunkt (`fs-row-main` & Co.).
 *
 * Fällt die Schicht aus, steht das darunter — für alle, damit niemand eine
 * fehlende Woche für ein Versehen hält. Was daneben steht, reicht der Aufrufer
 * herein: rechts im Kopf (`aktion`, beim Planen das ✕ zum Streichen) und neben
 * „Fällt aus" (`ausfallAktion`, beim Planen „Wiederherstellen").
 */
export function SchichtKopf({
  schicht,
  aktion,
  ausfallAktion,
}: {
  schicht: OzSchicht
  aktion?: ReactNode
  ausfallAktion?: ReactNode
}) {
  const { state } = useApp()
  const { t, tu } = useT()
  return (
    <>
      <div className="fs-row-main">
        <span className="fs-time">{schicht.termin.von}</span>
        <div className="fs-row-text">
          <div className="fs-title" dir="auto">
            {tu(schicht.termin.ort) || t.privZeugnis}
          </div>
          <div className="fs-place">{ozSchichtText(schicht, state.lang)}</div>
        </div>
        {aktion}
      </div>
      {schicht.gestrichen && (
        <div className="oz-ausfall">
          <span className="oz-faellt-aus">{t.ozFaelltAus}</span>
          {ausfallAktion}
        </div>
      )}
    </>
  )
}
