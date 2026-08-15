import { useApp } from '../app/context'
import { kennungVon } from '../data/planning'
import { hatAuxKlasse, ratgeberSlot } from '../data/aux-class'
import { useT } from '../i18n/useT'
import type { Meeting } from '../data/types'
import { SlotChip } from './SlotChip'
import { useKonflikte } from './useKonflikte'

/**
 * Ratgeber der Zusätzlichen Klasse (jw.org S-38, Absatz 26: „Für jede
 * zusätzliche Klasse muss ein befähigter Ratgeber zur Verfügung stehen,
 * vorzugsweise ein Ältester.").
 *
 * Eigene Karte statt einer Zeile an einem Programmpunkt: er begleitet die
 * ganze Klasse, nicht einen einzelnen Teil. Erscheint nur bei der
 * Zusammenkunft unter der Woche und nur, wenn eine Klasse eingerichtet ist.
 */
export function AuxCounselorPanel({ meeting }: { meeting: Meeting }) {
  const { state, dispatch } = useApp()
  const { t, tu } = useT()
  // Vor dem frühen Ausstieg: Haken laufen in jedem Durchgang, oder gar nicht.
  // Die Klasse gibt es nur unter der Woche — deshalb fest 'mid'.
  const { betrifft } = useKonflikte('mid')
  if (!hatAuxKlasse(meeting)) return null

  const slot = ratgeberSlot(meeting)
  const open = () =>
    dispatch({
      type: 'openSlot',
      sel: {
        kind: 'ratgeber',
        wi: state.week,
        tab: 'mid',
        label: `${t.auxKlasse} · ${t.auxRatgeber}`,
        priv: 'ratgeber',
        groups: false,
      },
    })

  return (
    <div className="panel panel--pb16" data-farbe="neutral2">
      <h2 className="panel-label">{t.auxKlassen}</h2>
      <div className="plan-item">
        <div className="plan-item-title">{t.auxRatgeber}</div>
        <div className="plan-slots">
          <SlotChip
            text={slot.name || t.zuteilenChip}
            open={!slot.name}
            showStatus={Boolean(slot.name)}
            pending={state.pendingIds.includes(kennungVon(slot.name, slot.pid))}
            konflikt={betrifft(slot)}
            onClick={open}
          />
        </div>
      </div>
      <p className="panel-hint">{tu(t.auxRatgeberHint)}</p>
    </div>
  )
}
