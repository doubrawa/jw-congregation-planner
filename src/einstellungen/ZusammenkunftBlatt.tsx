import { createPortal } from 'react-dom'
import { useApp } from '../app/context'
import { BlattFeld } from '../bausteine/BlattFeld'
import { Sheet } from '../components/Sheet'
import type { MeetingKey, MeetingTime } from '../data/types'
import { useT } from '../i18n/useT'
import { WOCHENTAGE_AB_MONTAG, wochentagNameAusWd } from '../planen/wochentage'
import { timeOptions } from './meeting-times'

/**
 * **Wann eine Zusammenkunft ist** (T121, Zeilen „Unter der Woche" und „Am
 * Wochenende" in `GEinstellungen`): Wochentag und Uhrzeit, beide gelten
 * sofort. Die Endzeiten der schon geladenen Wochen wandern mit
 * (`updateCongregation`).
 */
export function ZusammenkunftBlatt({ welche, titel, onClose }: { welche: MeetingKey; titel: string; onClose: () => void }) {
  const { state, dispatch } = useApp()
  const { t } = useT()
  const zeiten = state.congregation.times
  const zeit = zeiten[welche]
  const setze = (patch: Partial<MeetingTime>) =>
    dispatch({ type: 'updateCongregation', patch: { times: { ...zeiten, [welche]: { ...zeit, ...patch } } } })

  return createPortal(
    <Sheet label={titel} title={titel} onClose={onClose}>
      <div className="sheet-inhalt blatt-felder">
        <BlattFeld marke={t.a11yWeekday}>
          <select className="feld-wahl" value={zeit.wd} onChange={(e) => setze({ wd: Number(e.target.value) })}>
            {WOCHENTAGE_AB_MONTAG.map((wd) => (
              <option key={wd} value={wd}>
                {wochentagNameAusWd(wd, state.lang)}
              </option>
            ))}
          </select>
        </BlattFeld>
        <BlattFeld marke={t.a11yTime}>
          <select className="feld-wahl" value={zeit.time} onChange={(e) => setze({ time: e.target.value })}>
            {timeOptions(zeit.time).map((uhrzeit) => (
              <option key={uhrzeit} value={uhrzeit}>
                {uhrzeit}
              </option>
            ))}
          </select>
        </BlattFeld>
      </div>
      <div className="sheet-fuss-ende">
        <button type="button" className="knopf-haupt" onClick={onClose}>
          {t.fertig}
        </button>
      </div>
    </Sheet>,
    document.body,
  )
}
