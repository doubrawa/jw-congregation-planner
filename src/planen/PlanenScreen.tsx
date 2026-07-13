import { useState } from 'react'
import { useApp } from '../app/context'
import { MeetingTabs } from '../components/MeetingTabs'
import { WeekNav } from '../components/WeekNav'
import { MemorialBanner, WeekChips } from '../components/WeekBadges'
import { isSong } from '../data/helpers'
import { countOpenSlots, itemMinutes, weekConflicts, type Conflict } from '../data/planning'
import { fill, useT } from '../i18n/useT'
import type { PartItem, Section, Service, SlotAssignment } from '../data/types'
import './planen.css'

const LAC_LABEL = 'UNSER LEBEN ALS CHRIST'

/**
 * Planen (Screen 3, nur Planer): alle Slots einer Woche als Chips —
 * Tippen öffnet das Zuteilungs-Sheet. Belegte Slots zeigen ✓ (bestätigt)
 * oder … (wartet). „Unser Leben als Christ“ ist editierbar.
 */
export function PlanenScreen() {
  const { state, dispatch } = useApp()
  const { t, tu, tp } = useT()
  const [lacTitle, setLacTitle] = useState('')
  const week = state.weeks[state.week]
  const meeting = state.tab === 'mid' ? week.mid : week.we
  const openCount = countOpenSlots(meeting, state.services)
  const isPending = (name: string) => state.pendingNames.includes(name)
  // Warnungen der ganzen Woche (beide Zusammenkünfte), unabhängig vom Tab
  const conflicts = weekConflicts(state.weeks, state.week, state.persons, state.services)

  const tabName = (tab: Conflict['tab']): string => (tab === 'we' ? t.tabWe : t.tabMid)
  const conflictText = (c: Conflict): string => {
    if (c.kind === 'absent') return fill(t.konfliktAbsent, { name: c.name, tab: tabName(c.tab) })
    if (c.kind === 'double')
      return fill(t.konfliktDouble, { name: c.name, n: c.count ?? 2, tab: tabName(c.tab) })
    if (c.kind === 'helperTask')
      return fill(t.konfliktHelperTask, { name: c.name, tab: tabName(c.tab) })
    return fill(t.konfliktStreak, { name: c.name, n: c.count ?? 3 })
  }

  const openPartSlot = (
    si: number,
    ii: number,
    ni: number,
    item: PartItem,
    slot: SlotAssignment,
  ) => {
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
      dispatch({ type: 'showToast', text: t.toastNameEingeben })
      return
    }
    dispatch({ type: 'lacAdd', si, title: lacTitle })
    setLacTitle('')
  }

  const partChipText = (slot: SlotAssignment): string => {
    if (!slot.name) return t.zuteilenChip
    return slot.rolle && !slot.rolle.startsWith('mit') ? `${tp(slot.rolle)}: ${slot.name}` : slot.name
  }

  return (
    <section className="screen">
      <div className="screen-head">
        <h1 className="screen-title">{t.planen}</h1>
        <span className="screen-head-note">{fill(t.offeneZut, { n: openCount })}</span>
      </div>

      <WeekNav
        className="plan-week-nav"
        canPrev={state.week > 0}
        canNext={state.week < state.weeks.length - 1}
        onPrev={() => dispatch({ type: 'prevWeek' })}
        onNext={() => dispatch({ type: 'nextWeek' })}
      >
        <div className="plan-week-range">{tp(week.range)}</div>
      </WeekNav>

      <WeekChips week={week} showCurrent={false} />

      <MeetingTabs
        className="plan-tabs"
        tab={state.tab}
        onChange={(tab) => dispatch({ type: 'setTab', tab })}
      />

      <MemorialBanner week={week} tab={state.tab} />

      <p className="plan-hint">{t.planHint}</p>

      <button type="button" className="plan-auto-btn" onClick={() => dispatch({ type: 'autoAssign' })}>
        {t.autoZuteilen}
      </button>
      <p className="plan-legend">{t.planLegend}</p>

      {conflicts.length > 0 && (
        <div className="plan-conflicts">
          <div className="plan-conflicts-title">
            {t.konflikteTitle} · {conflicts.length}
          </div>
          {conflicts.map((c, i) => (
            <div key={i} className="plan-conflict-row">
              {conflictText(c)}
            </div>
          ))}
        </div>
      )}

      {meeting.sections.map((section, si) => {
        const isLac = section.label === LAC_LABEL
        const movables = movableIndices(section)
        return (
          <div key={section.label} className="panel" data-farbe={section.farbe}>
            <div className="panel-label">{tp(section.label)}</div>
            {section.items.map((item, ii) => {
              if (isSong(item)) {
                return (
                  <div key={ii} className="panel-song">
                    {tp(item.song)}
                  </div>
                )
              }
              const editable = isLac && itemMinutes(item) != null
              const mPos = movables.indexOf(ii)
              return (
                <div key={ii} className="plan-item">
                  <div className="plan-item-head">
                    <div className="plan-item-title">{tp(item.title)}</div>
                    {editable && (
                      <div className="lac-move">
                        <button
                          type="button"
                          className="lac-move-btn"
                          aria-label="▲"
                          disabled={mPos <= 0}
                          onClick={() => dispatch({ type: 'lacMove', si, ii, dir: -1 })}
                        >
                          ▲
                        </button>
                        <button
                          type="button"
                          className="lac-move-btn"
                          aria-label="▼"
                          disabled={mPos >= movables.length - 1}
                          onClick={() => dispatch({ type: 'lacMove', si, ii, dir: 1 })}
                        >
                          ▼
                        </button>
                      </div>
                    )}
                  </div>
                  {item.meta && <div className="plan-item-meta">{tp(item.meta)}</div>}
                  <div className="plan-slots">
                    {item.names.map((slot, ni) => (
                      <SlotChip
                        key={ni}
                        text={partChipText(slot)}
                        open={!slot.name}
                        showStatus={Boolean(slot.name)}
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
                        aria-label="–"
                        onClick={() => dispatch({ type: 'lacAdjust', si, ii, delta: -5 })}
                      >
                        –
                      </button>
                      <span className="lac-mins">{tp(`${itemMinutes(item)} Min.`)}</span>
                      <button
                        type="button"
                        className="lac-step-btn"
                        aria-label="+"
                        onClick={() => dispatch({ type: 'lacAdjust', si, ii, delta: 5 })}
                      >
                        +
                      </button>
                      <span className="lac-spacer" />
                      <button
                        type="button"
                        className="lac-remove"
                        aria-label="✕"
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
                  placeholder={t.lacPh}
                  aria-label={t.lacPh}
                  value={lacTitle}
                  onChange={(e) => setLacTitle(e.target.value)}
                />
                <button type="button" className="lac-add-btn" onClick={() => addLac(si)}>
                  {t.lacAdd}
                </button>
              </div>
            )}
          </div>
        )
      })}

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
    </section>
  )
}

/** Indizes der verschiebbaren (Nicht-Lied-)Items einer Sektion. */
function movableIndices(section: Section): number[] {
  return section.items.map((x, i) => (isSong(x) ? -1 : i)).filter((i) => i >= 0)
}

/** Slot-Chip: belegt = solide Pille + Bestätigungs-Zeichen ✓/…; offen = gestrichelt. */
function SlotChip({
  text,
  open,
  showStatus,
  pending,
  onClick,
}: {
  text: string
  open: boolean
  showStatus: boolean
  pending: boolean
  onClick: () => void
}) {
  return (
    <button type="button" className={open ? 'slot-chip is-open' : 'slot-chip'} onClick={onClick}>
      {text}
      {showStatus && (
        <span className={pending ? 'slot-status is-pending' : 'slot-status'}>
          {pending ? '…' : '✓'}
        </span>
      )}
    </button>
  )
}
