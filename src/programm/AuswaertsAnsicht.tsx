import { useMemo } from 'react'
import { useApp } from '../app/context'
import { eigenePerson } from '../app/eigene-person'
import { useKalendertag } from '../app/useKalendertag'
import { vaNachMonat, vaWannText, vaWoText } from '../components/auswaerts-anzeige'
import { monatText } from '../components/gruppenbesuch-anzeige'
import { vaTaskKey, vaVorbei } from '../data/auswaerts'
import { displayName } from '../data/helpers'
import { fromIso } from '../data/meeting-dates'
import { zusageStatus } from '../data/planning'
import { useT } from '../i18n/useT'
import type { VortragAuswaerts } from '../data/types'
import { VA_ROLLE } from '../../supabase/functions/_shared/zuteilungen.ts'
import { ZUSAGE_LABEL } from '../planen/useZusage'
import { ZusagePunkt } from '../planen/ZusageStatus'
import '../components/auswaerts.css'

/**
 * **Redner auswärts** beim Ansehen (T120, Phase 4).
 *
 * Die kommenden Vorträge Monat für Monat. Ein Verkündiger bekommt nur seine
 * eigenen (RLS) und bestätigt sie hier wie unter „Meine Aufgaben"; die Planer
 * sehen alle.
 */
export function AuswaertsAnsicht() {
  const { state } = useApp()
  const { t } = useT()
  const tag = useKalendertag()

  // Nur Kommendes: Wer hier nachsieht, sucht seinen nächsten Vortrag.
  const kommend = useMemo(() => {
    const heute = fromIso(tag)
    return state.auswaerts.filter((v) => !vaVorbei(v, heute))
  }, [state.auswaerts, tag])

  return (
    <>
      <div className="panel panel--pb16" data-farbe="neutral">
        <h2 className="panel-label">{t.vaTitel}</h2>
      </div>
      {vaNachMonat(kommend).map(({ monat, vortraege }) => (
        <div key={monat} className="panel" data-farbe="petrol">
          <h2 className="panel-label">{monatText(monat, state.lang)}</h2>
          {vortraege.map((v) => (
            <AnsichtZeile key={v.id} vortrag={v} />
          ))}
        </div>
      ))}
    </>
  )
}

/** Ein Vortrag beim Ansehen: wann und wo, wer spricht — und beim eigenen, was zu tun ist. */
function AnsichtZeile({ vortrag }: { vortrag: VortragAuswaerts }) {
  const { state, dispatch } = useApp()
  const { t, tu } = useT()
  const me = eigenePerson(state)
  const redner = vortrag.pid ? state.persons.find((p) => p.id === vortrag.pid) : undefined
  const eigener = me !== undefined && vortrag.pid === me.id
  const key = vaTaskKey(vortrag)
  const stufe = eigener ? zusageStatus(state.confirmations, key) : null

  return (
    <div className="va-zeile">
      <div className="va-liste-zeile">
        <div>
          <div className="va-wann">{vaWannText(vortrag, state.lang)}</div>
          <div className="va-wo" dir="auto">
            {vaWoText(vortrag, t, tu)}
          </div>
        </div>
        <div className="va-wer">
          <div className="va-name">
            {eigener && <span className="chip-du">DU</span>}
            <span dir="auto">{redner ? displayName(redner) : t.offenDash}</span>
          </div>
          {redner && <div className="va-rolle">{tu(VA_ROLLE)}</div>}
        </div>
      </div>
      {stufe && (
        <div className="va-eigen">
          <span className="va-zusage">
            <ZusagePunkt stufe={stufe} />
            {t[ZUSAGE_LABEL[stufe]]}
          </span>
          <div className="va-aktionen">
            {stufe === 'offen' && (
              <button type="button" className="btn-outline" onClick={() => dispatch({ type: 'confirmTask', id: key })}>
                {t.bestaetigen}
              </button>
            )}
            {stufe !== 'verhindert' && (
              <button type="button" className="btn-outline" onClick={() => dispatch({ type: 'declineTask', id: key })}>
                {t.verhindert}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
