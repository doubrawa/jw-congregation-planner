import { useApp } from '../app/context'
import { mtab } from '../data/helpers'
import { serviceQualKey } from '../data/helpers'
import { useT } from '../i18n/useT'
import type { Meeting, Service } from '../data/types'
import { SlotChip } from './SlotChip'
import { useKonflikte } from './useKonflikte'
import { useZusage } from './useZusage'

/** Hilfsdienste-Panel beim Planen: je konfiguriertem Dienst so viele Slot-Chips wie Plätze. */
export function HelpersPanel({ meeting }: { meeting: Meeting }) {
  const { state, dispatch } = useApp()
  const { t, tu } = useT()
  const zusage = useZusage()

  // Hilfsdienste sind die häufigste Hälfte der Konflikte („Hilfsdienst UND
  // Programmpunkt", „zweimal Hilfsdienst") — sie dürfen bei der Markierung
  // nicht fehlen.
  const { betrifft } = useKonflikte(mtab(state.tab))

  const openHelperSlot = (service: Service, pos: number) => {
    dispatch({
      type: 'openSlot',
      sel: {
        kind: 'helper',
        wi: state.week,
        tab: mtab(state.tab),
        svc: service.key,
        pos,
        label: service.name,
        priv: service.groups ? null : serviceQualKey(service.key),
        groups: Boolean(service.groups),
      },
    })
  }

  return (
    <div className="panel panel--pb14" data-farbe="neutral2">
      <h2 className="panel-label">{t.hilfsdienste}</h2>
      {state.services.map((service) => {
        const assigned = meeting.helpers[service.key] ?? []
        return (
          <div key={service.key} className="plan-helper-row">
            <div className="plan-helper-label">{tu(service.name).toUpperCase()}</div>
            <div className="plan-slots">
              {Array.from({ length: service.count }, (_, pos) => {
                const name = assigned[pos]?.name ?? ''
                // Am Dienst erkannt, nicht am Wort: `startsWith('Gruppe')`
                // traf nur deutsche Gruppennamen. Ob hier eine Gruppe rotiert,
                // sagt der Dienst selbst — und der steht daneben.
                const isGroup = Boolean(service.groups)
                return (
                  <SlotChip
                    key={pos}
                    text={name ? tu(name) : t.zuteilenChip}
                    open={!name}
                    showStatus={Boolean(name) && !isGroup && zusage.moeglich(mtab(state.tab))}
                    status={zusage.hilfsdienst(mtab(state.tab), service.key, pos)}
                    // Gruppen-Rotation ist keine Person und steht in keinem Konflikt.
                    konflikt={!isGroup && betrifft(assigned[pos])}
                    onClick={() => openHelperSlot(service, pos)}
                  />
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
