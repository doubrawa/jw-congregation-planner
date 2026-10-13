import { useApp } from '../app/context'
import { mtab, serviceQualKey } from '../data/helpers'
import { useT } from '../i18n/useT'
import type { Meeting, Service } from '../data/types'
import { platzAnzeige } from './platz-anzeige'
import { istGewaehlt } from './planen-raster'
import { PlatzZeile } from './PlatzZeile'
import { useKonflikte } from './useKonflikte'
import { useZusage } from './useZusage'

/**
 * Die Hilfsdienste beim Planen (T121, Entwurf `GPlanen`): eine Karte, je Platz
 * eine Zeile — wer, für welchen Dienst, und wie seine Zusage steht. Je Dienst
 * so viele Plätze, wie eingestellt sind.
 */
export function HelpersPanel({ meeting }: { meeting: Meeting }) {
  const { state, dispatch } = useApp()
  const { t, tu } = useT()
  const zusage = useZusage()
  const tab = mtab(state.tab)

  // Hilfsdienste sind die häufigste Hälfte der Konflikte („Hilfsdienst UND
  // Programmpunkt", „zweimal Hilfsdienst") — sie dürfen bei der Markierung
  // nicht fehlen.
  const konflikte = useKonflikte(tab)

  const openHelperSlot = (service: Service, pos: number) => {
    dispatch({
      type: 'openSlot',
      sel: {
        kind: 'helper',
        wi: state.week,
        tab,
        svc: service.key,
        pos,
        label: service.name,
        priv: service.groups ? null : serviceQualKey(service.key),
        groups: Boolean(service.groups),
      },
    })
  }

  return (
    <section className="prog-abschnitt" data-farbe="neutral2">
      <div className="prog-abschnitt-kopf">
        <h2 className="prog-abschnitt-name">{t.hilfsdienste}</h2>
      </div>
      <div className="plan-plaetze">
        {state.services.map((service) =>
          Array.from({ length: service.count }, (_, pos) => {
            const slot = meeting.helpers[service.key]?.[pos]
            const name = slot?.name ?? ''
            // Am Dienst erkannt, nicht am Wort: Ob hier eine Gruppe rotiert,
            // sagt der Dienst selbst. Eine Gruppe ist keine Person — sie sagt
            // nicht zu und steht in keinem Konflikt.
            const gruppe = Boolean(service.groups)
            const stand = name && !gruppe && zusage.moeglich(tab) ? zusage.hilfsdienst(tab, service.key, pos) : null
            // Sagt jemand einen Hilfsdienst ab, sucht die App selbst einen
            // Ersatz — das steht dann am Platz, nicht bloß die Absage.
            return (
              <PlatzZeile
                key={`${service.key}-${pos}`}
                name={name ? tu(name) : ''}
                rolle={tu(service.name)}
                {...platzAnzeige(slot, stand, gruppe ? undefined : konflikte.von(slot), t, t.spurErsatzGesucht)}
                gewaehlt={istGewaehlt(state.slotSel, { kind: 'helper', wi: state.week, tab, svc: service.key, pos })}
                onClick={() => openHelperSlot(service, pos)}
              />
            )
          }),
        )}
      </div>
    </section>
  )
}
