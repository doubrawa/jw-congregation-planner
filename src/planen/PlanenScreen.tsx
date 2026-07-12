import { useApp } from '../app/context'
import { MeetingTabs } from '../components/MeetingTabs'
import { WeekNav } from '../components/WeekNav'
import { isSong } from '../data/helpers'
import { countOpenSlots } from '../data/planning'
import type { PartItem, Service, SlotAssignment } from '../data/types'
import './planen.css'

/**
 * Planen (Screen 3, nur Planer): alle Slots einer Woche als Chips —
 * Tippen öffnet das Zuteilungs-Sheet, Button für Auto-Zuteilung.
 */
export function PlanenScreen() {
  const { state, dispatch } = useApp()
  const week = state.weeks[state.week]
  const meeting = state.tab === 'mid' ? week.mid : week.we
  const openCount = countOpenSlots(meeting, state.services)

  const openPartSlot = (
    si: number,
    ii: number,
    ni: number,
    item: PartItem,
    slot: SlotAssignment,
  ) => {
    // Rollenlabel in den Sheet-Titel, außer Begleit-Angaben ("mit A. Hoffmann")
    const suffix = slot.rolle && !slot.rolle.startsWith('mit') ? ` · ${slot.rolle}` : ''
    dispatch({
      type: 'openSlot',
      sel: {
        kind: 'part',
        wi: state.week,
        tab: state.tab,
        si,
        ii,
        ni,
        label: item.title + suffix,
        priv: slot.bereichsKey ?? null,
        groups: false,
      },
    })
  }

  const openHelperSlot = (service: Service, pos: number) => {
    dispatch({
      type: 'openSlot',
      sel: {
        kind: 'helper',
        wi: state.week,
        tab: state.tab,
        svc: service.key,
        pos,
        label: service.name,
        priv: service.priv,
        groups: Boolean(service.groups),
      },
    })
  }

  return (
    <section className="screen">
      <div className="screen-head">
        <h1 className="screen-title">Planen</h1>
        <span className="screen-head-note">{openCount} offene Zuteilungen</span>
      </div>

      <WeekNav
        className="plan-week-nav"
        canPrev={state.week > 0}
        canNext={state.week < state.weeks.length - 1}
        onPrev={() => dispatch({ type: 'prevWeek' })}
        onNext={() => dispatch({ type: 'nextWeek' })}
      >
        <div className="plan-week-range">{week.range}</div>
      </WeekNav>

      <MeetingTabs
        className="plan-tabs"
        tab={state.tab}
        onChange={(tab) => dispatch({ type: 'setTab', tab })}
      />

      <p className="plan-hint">
        Auf eine Zuteilung tippen, um sie zu ändern. Abwesenheiten und Aufgabenbereiche werden
        geprüft.
      </p>

      <button type="button" className="plan-auto-btn" onClick={() => dispatch({ type: 'autoAssign' })}>
        AUTOMATISCH ZUTEILEN
      </button>

      {meeting.sections.map((section, si) => (
        <div key={section.label} className="panel" data-farbe={section.farbe}>
          <div className="panel-label">{section.label}</div>
          {section.items.map((item, ii) =>
            isSong(item) ? (
              <div key={ii} className="panel-song">
                {item.song}
              </div>
            ) : (
              <div key={ii} className="plan-item">
                <div className="plan-item-title">{item.title}</div>
                {item.meta && <div className="plan-item-meta">{item.meta}</div>}
                <div className="plan-slots">
                  {item.names.map((slot, ni) => (
                    <SlotChip
                      key={ni}
                      name={slot.name}
                      rolle={slot.rolle}
                      onClick={() => openPartSlot(si, ii, ni, item, slot)}
                    />
                  ))}
                </div>
              </div>
            ),
          )}
        </div>
      ))}

      <div className="panel panel--pb14" data-farbe="neutral2">
        <div className="panel-label">HILFSDIENSTE</div>
        {state.services.map((service) => {
          const assigned = meeting.helpers[service.key] ?? []
          return (
            <div key={service.key} className="plan-helper-row">
              <div className="plan-helper-label">{service.name.toUpperCase()}</div>
              <div className="plan-slots">
                {Array.from({ length: service.count }, (_, pos) => (
                  <SlotChip
                    key={pos}
                    name={assigned[pos] ?? ''}
                    onClick={() => openHelperSlot(service, pos)}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

/** Slot-Chip: belegt = solide Pille (ggf. "Rolle: Name"), offen = gestrichelt. */
function SlotChip({
  name,
  rolle,
  onClick,
}: {
  name: string
  rolle?: string
  onClick: () => void
}) {
  const text = name
    ? rolle && !rolle.startsWith('mit')
      ? `${rolle}: ${name}`
      : name
    : '— zuteilen'
  return (
    <button
      type="button"
      className={name ? 'slot-chip' : 'slot-chip is-open'}
      onClick={onClick}
    >
      {text}
    </button>
  )
}
