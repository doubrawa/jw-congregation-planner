import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useApp } from '../app/context'
import { useKalendertag } from '../app/useKalendertag'
import { Zeichen } from '../bausteine/Zeichen'
import { useT } from '../i18n/useT'
import { AutomatischBlatt } from './AutomatischBlatt'
import type { PlanArt } from './planen-raster'
import { PlanSendenBlatt } from './PlanSendenBlatt'
import { TreffpunkteAutomatikBlatt } from './TreffpunkteAutomatikBlatt'
import { sendeUmfang, useOffeneMeldungen, useWocheSenden } from './wochen-versand'

/** Welches Blatt die Leiste geöffnet hat. */
type Offen = 'automatisch' | 'senden' | null

/**
 * **Die Aktionsleiste beim Planen** (T121, Entwürfe `GPlanen`,
 * `GTreffpunktePlanen`, `GDesktopPlanen`): „Automatisch" und „Plan senden" mit
 * der Zahl dessen, was noch niemand weiß. Am Handy eine Leiste am unteren Rand
 * (`leiste`), ab dem Tablet zwei Knöpfe rechts neben der Woche.
 *
 * Dieselbe Leiste für die Zusammenkünfte und die Treffpunkte der Woche
 * (`art`): „Automatisch" öffnet jeweils sein Blatt, „Plan senden" gibt die
 * ganze Woche frei — beim Gruppenaufseher, der nicht zuteilt, die Treffpunkte
 * seiner Gruppe (`sendeUmfang`).
 *
 * Hier steht auch der Stand des Versands — die Leiste bleibt beim Planen
 * stehen, das Blatt nicht. Gezählt **und** gesendet wird mit demselben
 * Kalendertag: Die Function soll denselben Tag meinen wie die Zahl am Knopf.
 *
 * Beide Blätter hängen per Portal am Dokument: Die Knöpfe neben der Woche
 * liegen im Wochenstreifen, und der wird zum Wischen per `transform`
 * verschoben — ein Blatt darin läge mit ihm daneben.
 */
export function PlanenAktionen({ art, leiste = false }: { art: PlanArt; leiste?: boolean }) {
  const { state } = useApp()
  const { t } = useT()
  const [offen, setOffen] = useState<Offen>(null)
  const tag = useKalendertag()
  const umfang = sendeUmfang(state)
  const gruppe = umfang?.gruppe ?? null
  const { week, offen: meldungen, zuletzt } = useOffeneMeldungen(tag, gruppe)
  const versand = useWocheSenden(week, tag)
  const schliessen = (): void => setOffen(null)

  return (
    <div className={leiste ? 'planen-aktionen planen-leiste' : 'planen-aktionen'}>
      <button type="button" className="aktion-neben" onClick={() => setOffen('automatisch')}>
        <Zeichen name="stab" />
        {t.autoKnopf}
      </button>
      {umfang && (
        <button type="button" className="aktion-haupt" onClick={() => setOffen('senden')}>
          {t.planSenden}
          {meldungen.length > 0 && <span className="zahl-marke">{meldungen.length}</span>}
        </button>
      )}
      {offen === 'automatisch' &&
        createPortal(
          art === 'treffpunkte' ? <TreffpunkteAutomatikBlatt onClose={schliessen} /> : <AutomatischBlatt onClose={schliessen} />,
          document.body,
        )}
      {offen === 'senden' &&
        createPortal(
          <PlanSendenBlatt
            meldungen={meldungen}
            zuletzt={zuletzt}
            versand={versand}
            gruppe={gruppe !== null}
            onClose={schliessen}
          />,
          document.body,
        )}
    </div>
  )
}
