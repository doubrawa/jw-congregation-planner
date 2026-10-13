import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useApp } from '../app/context'
import { useKalendertag } from '../app/useKalendertag'
import { Zeichen } from '../bausteine/Zeichen'
import { useT } from '../i18n/useT'
import { AutomatischBlatt } from './AutomatischBlatt'
import { PlanSendenBlatt } from './PlanSendenBlatt'
import { darfWocheSenden, useOffeneMeldungen, useWocheSenden } from './wochen-versand'

/** Welches Blatt die Leiste geöffnet hat. */
type Offen = 'automatisch' | 'senden' | null

/**
 * **Die Aktionsleiste beim Planen** (T121, Entwürfe `GPlanen`,
 * `GDesktopPlanen`): „Automatisch" und „Plan senden" mit der Zahl dessen, was
 * noch niemand weiß. Am Handy eine Leiste am unteren Rand (`leiste`), ab dem
 * Tablet zwei Knöpfe rechts neben der Woche.
 *
 * Hier steht auch der Stand des Versands — die Leiste bleibt beim Planen
 * stehen, das Blatt nicht. Gezählt **und** gesendet wird mit demselben
 * Kalendertag: Die Function soll denselben Tag meinen wie die Zahl am Knopf.
 *
 * Beide Blätter hängen per Portal am Dokument: Die Knöpfe neben der Woche
 * liegen im Wochenstreifen, und der wird zum Wischen per `transform`
 * verschoben — ein Blatt darin läge mit ihm daneben.
 */
export function PlanenAktionen({ leiste = false }: { leiste?: boolean }) {
  const { state } = useApp()
  const { t } = useT()
  const [offen, setOffen] = useState<Offen>(null)
  const tag = useKalendertag()
  const { week, offen: meldungen, zuletzt } = useOffeneMeldungen(tag)
  const versand = useWocheSenden(week, tag)
  const schliessen = (): void => setOffen(null)

  return (
    <div className={leiste ? 'planen-aktionen planen-leiste' : 'planen-aktionen'}>
      <button type="button" className="planen-automatisch" onClick={() => setOffen('automatisch')}>
        <Zeichen name="stab" />
        {t.autoKnopf}
      </button>
      {darfWocheSenden(state) && (
        <button type="button" className="planen-senden" onClick={() => setOffen('senden')}>
          {t.planSenden}
          {meldungen.length > 0 && <span className="zahl-marke">{meldungen.length}</span>}
        </button>
      )}
      {offen === 'automatisch' && createPortal(<AutomatischBlatt onClose={schliessen} />, document.body)}
      {offen === 'senden' &&
        createPortal(
          <PlanSendenBlatt meldungen={meldungen} zuletzt={zuletzt} versand={versand} onClose={schliessen} />,
          document.body,
        )}
    </div>
  )
}
