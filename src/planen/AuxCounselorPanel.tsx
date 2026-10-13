import { useApp } from '../app/context'
import { hatAuxKlasse, ratgeberSlot } from '../data/aux-class'
import { useT } from '../i18n/useT'
import type { Meeting } from '../data/types'
import { platzAnzeige } from './platz-anzeige'
import { istGewaehlt } from './planen-raster'
import { PlatzZeile } from './PlatzZeile'
import { useKonflikte } from './useKonflikte'
import { useZusage } from './useZusage'

/**
 * Ratgeber der Zusätzlichen Klasse (jw.org S-38, Absatz 27: „Für jede
 * zusätzliche Klasse soll ein befähigter Ratgeber zur Verfügung stehen,
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
  const konflikte = useKonflikte('mid')
  const zusage = useZusage()
  if (!hatAuxKlasse(meeting)) return null

  const slot = ratgeberSlot(meeting)
  const stand = slot.name && zusage.moeglich('mid') ? zusage.ratgeber('mid') : null
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
    <section className="prog-abschnitt" data-farbe="neutral2">
      <div className="prog-abschnitt-kopf">
        <h2 className="prog-abschnitt-name">{t.auxKlassen}</h2>
      </div>
      <div className="plan-plaetze">
        <PlatzZeile
          name={slot.name}
          rolle={t.auxRatgeber}
          {...platzAnzeige(slot, stand, konflikte.von(slot), t)}
          gewaehlt={istGewaehlt(state.slotSel, { kind: 'ratgeber', wi: state.week, tab: 'mid' })}
          onClick={open}
        />
      </div>
      <p className="panel-hint">{tu(t.auxRatgeberHint)}</p>
    </section>
  )
}
