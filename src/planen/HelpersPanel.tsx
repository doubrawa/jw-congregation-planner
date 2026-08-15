import { useApp } from '../app/context'
import { mtab } from '../data/helpers'
import { kennungVon } from '../data/planning'
import { serviceQualKey } from '../data/helpers'
import { useT } from '../i18n/useT'
import type { Meeting, Service, SlotAssignment } from '../data/types'
import { SlotChip } from './SlotChip'

/** Hilfsdienste-Panel beim Planen: je konfiguriertem Dienst so viele Slot-Chips wie Plätze. */
export function HelpersPanel({ meeting }: { meeting: Meeting }) {
  const { state, dispatch } = useApp()
  const { t, tu } = useT()

  const isPending = (slot: SlotAssignment | undefined) =>
    state.pendingIds.includes(kennungVon(slot?.name ?? "", slot?.pid))

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
                    showStatus={Boolean(name) && !isGroup}
                    pending={isPending(assigned[pos])}
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
