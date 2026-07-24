import { useApp } from '../app/context'
import { serviceQualKey } from '../data/helpers'
import { useT } from '../i18n/useT'
import type { Meeting, Service } from '../data/types'
import { SlotChip } from './SlotChip'

/** Hilfsdienste-Panel beim Planen: je konfiguriertem Dienst so viele Slot-Chips wie Plätze. */
export function HelpersPanel({ meeting }: { meeting: Meeting }) {
  const { state, dispatch } = useApp()
  const { t, tu } = useT()

  const isPending = (name: string) => state.pendingNames.includes(name)

  const openHelperSlot = (service: Service, pos: number) => {
    dispatch({
      type: 'openSlot',
      sel: {
        kind: 'helper',
        wi: state.week,
        tab: state.tab === 'fs' ? 'mid' : state.tab,
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
      <div className="panel-label">{t.hilfsdienste}</div>
      {state.services.map((service) => {
        const assigned = meeting.helpers[service.key] ?? []
        return (
          <div key={service.key} className="plan-helper-row">
            <div className="plan-helper-label">{tu(service.name).toUpperCase()}</div>
            <div className="plan-slots">
              {Array.from({ length: service.count }, (_, pos) => {
                const name = assigned[pos] ?? ''
                const isGroup = name.startsWith('Gruppe')
                return (
                  <SlotChip
                    key={pos}
                    text={name ? tu(name) : t.zuteilenChip}
                    open={!name}
                    showStatus={Boolean(name) && !isGroup}
                    pending={isPending(name)}
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
