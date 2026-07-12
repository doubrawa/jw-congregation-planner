import { useState } from 'react'
import { useApp } from '../app/context'
import { MeetingTabs } from '../components/MeetingTabs'
import { WeekNav } from '../components/WeekNav'
import { MemorialBanner, WeekChips } from '../components/WeekBadges'
import { isSong } from '../data/helpers'
import { countOpenSlots, itemMinutes } from '../data/planning'
import type { PartItem, Section, Service, SlotAssignment } from '../data/types'
import './planen.css'

const LAC_LABEL = 'UNSER LEBEN ALS CHRIST'

/**
 * Planen (Screen 3, nur Planer): alle Slots einer Woche als Chips —
 * Tippen öffnet das Zuteilungs-Sheet. Belegte Slots zeigen ✓ (bestätigt)
 * oder … (wartet). „Unser Leben als Christ“ ist editierbar (Minuten,
 * Reihenfolge, Punkte einfügen/entfernen).
 */
export function PlanenScreen() {
  const { state, dispatch } = useApp()
  const [lacTitle, setLacTitle] = useState('')
  const week = state.weeks[state.week]
  const meeting = state.tab === 'mid' ? week.mid : week.we
  const openCount = countOpenSlots(meeting, state.services)
  const isPending = (name: string) => state.pendingNames.includes(name)

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

  const addLac = (si: number) => {
    if (!lacTitle.trim()) {
      dispatch({ type: 'showToast', text: 'Bitte einen Namen eingeben' })
      return
    }
    dispatch({ type: 'lacAdd', si, title: lacTitle })
    setLacTitle('')
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

      <WeekChips week={week} showCurrent={false} />

      <MeetingTabs
        className="plan-tabs"
        tab={state.tab}
        onChange={(tab) => dispatch({ type: 'setTab', tab })}
      />

      <MemorialBanner week={week} tab={state.tab} />

      <p className="plan-hint">
        Auf eine Zuteilung tippen, um sie zu ändern. Abwesenheiten und Aufgabenbereiche werden
        geprüft.
      </p>

      <button type="button" className="plan-auto-btn" onClick={() => dispatch({ type: 'autoAssign' })}>
        AUTOMATISCH ZUTEILEN
      </button>
      <p className="plan-legend">✓ bestätigt · … wartet auf Bestätigung</p>

      {meeting.sections.map((section, si) => {
        const isLac = section.label === LAC_LABEL
        const movables = movableIndices(section)
        return (
          <div key={section.label} className="panel" data-farbe={section.farbe}>
            <div className="panel-label">{section.label}</div>
            {section.items.map((item, ii) => {
              if (isSong(item)) {
                return (
                  <div key={ii} className="panel-song">
                    {item.song}
                  </div>
                )
              }
              const editable = isLac && itemMinutes(item) != null
              const mPos = movables.indexOf(ii)
              return (
                <div key={ii} className="plan-item">
                  <div className="plan-item-head">
                    <div className="plan-item-title">{item.title}</div>
                    {editable && (
                      <div className="lac-move">
                        <button
                          type="button"
                          className="lac-move-btn"
                          aria-label="Nach oben"
                          disabled={mPos <= 0}
                          onClick={() => dispatch({ type: 'lacMove', si, ii, dir: -1 })}
                        >
                          ▲
                        </button>
                        <button
                          type="button"
                          className="lac-move-btn"
                          aria-label="Nach unten"
                          disabled={mPos >= movables.length - 1}
                          onClick={() => dispatch({ type: 'lacMove', si, ii, dir: 1 })}
                        >
                          ▼
                        </button>
                      </div>
                    )}
                  </div>
                  {item.meta && <div className="plan-item-meta">{item.meta}</div>}
                  <div className="plan-slots">
                    {item.names.map((slot, ni) => (
                      <SlotChip
                        key={ni}
                        name={slot.name}
                        rolle={slot.rolle}
                        pending={isPending(slot.name)}
                        onClick={() => openPartSlot(si, ii, ni, item, slot)}
                      />
                    ))}
                  </div>
                  {editable && (
                    <div className="lac-edit">
                      <button
                        type="button"
                        className="lac-step-btn"
                        aria-label="Minuten weniger"
                        onClick={() => dispatch({ type: 'lacAdjust', si, ii, delta: -5 })}
                      >
                        –
                      </button>
                      <span className="lac-mins">{itemMinutes(item)} Min.</span>
                      <button
                        type="button"
                        className="lac-step-btn"
                        aria-label="Minuten mehr"
                        onClick={() => dispatch({ type: 'lacAdjust', si, ii, delta: 5 })}
                      >
                        +
                      </button>
                      <span className="lac-spacer" />
                      <button
                        type="button"
                        className="lac-remove"
                        aria-label="Programmpunkt entfernen"
                        onClick={() => dispatch({ type: 'lacRemove', si, ii })}
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
            {isLac && (
              <div className="lac-add-row">
                <input
                  type="text"
                  className="lac-add-input"
                  placeholder="Neuer Programmpunkt, z. B. Örtliche Hinweise"
                  aria-label="Neuer Programmpunkt"
                  value={lacTitle}
                  onChange={(e) => setLacTitle(e.target.value)}
                />
                <button type="button" className="lac-add-btn" onClick={() => addLac(si)}>
                  + EINFÜGEN
                </button>
              </div>
            )}
          </div>
        )
      })}

      <div className="panel panel--pb14" data-farbe="neutral2">
        <div className="panel-label">HILFSDIENSTE</div>
        {state.services.map((service) => {
          const assigned = meeting.helpers[service.key] ?? []
          return (
            <div key={service.key} className="plan-helper-row">
              <div className="plan-helper-label">{service.name.toUpperCase()}</div>
              <div className="plan-slots">
                {Array.from({ length: service.count }, (_, pos) => {
                  const name = assigned[pos] ?? ''
                  return (
                    <SlotChip
                      key={pos}
                      name={name}
                      // Reinigungs-Gruppen bekommen keinen Bestätigungs-Status
                      isGroup={name.startsWith('Gruppe')}
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
    </section>
  )
}

/** Indizes der verschiebbaren (Nicht-Lied-)Items einer Sektion. */
function movableIndices(section: Section): number[] {
  return section.items.map((x, i) => (isSong(x) ? -1 : i)).filter((i) => i >= 0)
}

/**
 * Slot-Chip: belegt = solide Pille (ggf. "Rolle: Name") mit Bestätigungs-
 * Zeichen ✓/…; offen = gestrichelt „— zuteilen“.
 */
function SlotChip({
  name,
  rolle,
  pending,
  isGroup = false,
  onClick,
}: {
  name: string
  rolle?: string
  pending: boolean
  isGroup?: boolean
  onClick: () => void
}) {
  const text = name
    ? rolle && !rolle.startsWith('mit')
      ? `${rolle}: ${name}`
      : name
    : '— zuteilen'
  const showStatus = Boolean(name) && !isGroup
  return (
    <button type="button" className={name ? 'slot-chip' : 'slot-chip is-open'} onClick={onClick}>
      {text}
      {showStatus && (
        <span className={pending ? 'slot-status is-pending' : 'slot-status'}>
          {pending ? '…' : '✓'}
        </span>
      )}
    </button>
  )
}
