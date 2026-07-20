import { useState } from 'react'
import { useApp } from '../app/context'
import { MeetingTabs } from '../components/MeetingTabs'
import { WeekNav } from '../components/WeekNav'
import { MemorialBanner, WeekChips } from '../components/WeekBadges'
import { isSong, serviceQualKey } from '../data/helpers'
import {
  countOpenSlots,
  isGuestRole,
  itemMinutes,
  openingSongNr,
  openSlotLabels,
  TALK_PLACEHOLDER,
  weekConflicts,
  type Conflict,
} from '../data/planning'
import { fill, useProgWeek, useT } from '../i18n/useT'
import type { PartItem, Section, Service, SlotAssignment } from '../data/types'
import './planen.css'

const LAC_LABEL = 'UNSER LEBEN ALS CHRIST'
const TALK_LABEL = 'ÖFFENTLICHER VORTRAG'
const OPENING_LABEL = 'ERÖFFNUNG'

/**
 * Planen (Screen 3, nur Planer): alle Slots einer Woche als Chips —
 * Tippen öffnet das Zuteilungs-Sheet. Belegte Slots zeigen ✓ (bestätigt)
 * oder … (wartet). „Unser Leben als Christ“ ist editierbar.
 */
export function PlanenScreen() {
  const { state, dispatch } = useApp()
  const { t, tu } = useT()
  const [lacTitle, setLacTitle] = useState('')
  // Anzeige in der Programmsprache des Nutzers (Sprachvariante, falls geholt);
  // die Logik (LAC-Erkennung, Minuten, Slots) läuft auf der kanonischen Woche.
  const rawWeek = state.weeks[state.week]
  const { week, tpw } = useProgWeek(rawWeek)

  // Noch keine Wochen (z. B. frisch eingerichtete Versammlung) → Hinweis
  if (!rawWeek || !week) {
    return (
      <section className="screen">
        <div className="screen-head">
          <h1 className="screen-title">{t.planen}</h1>
        </div>
        <div className="panel panel--lead" data-farbe="neutral">
          <div className="panel-label">{t.keineWochenTitel}</div>
          <p className="prog-meta">{t.keineWochenHinweis}</p>
        </div>
      </section>
    )
  }

  const meeting = state.tab === 'mid' ? week.mid : week.we
  const rawMeeting = state.tab === 'mid' ? rawWeek.mid : rawWeek.we
  const openCount = countOpenSlots(rawMeeting, state.services)
  const isPending = (name: string) => state.pendingNames.includes(name)
  // Warnungen der ganzen Woche (beide Zusammenkünfte), unabhängig vom Tab
  const conflicts = weekConflicts(state.weeks, state.week, state.persons, state.services)
  // Unbesetzte Aufgaben/Hilfsdienste der ganzen Woche (wie die Konflikte)
  const openSlots = (['mid', 'we'] as const).flatMap((tab) =>
    openSlotLabels(rawWeek[tab], state.services).map((slot) => ({ ...slot, tab })),
  )
  const openTotal = openSlots.reduce((sum, slot) => sum + slot.n, 0)

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
        guest: isGuestRole(slot.rolle),
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
        priv: service.groups ? null : serviceQualKey(service.key),
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
    return slot.rolle && !slot.rolle.startsWith('mit') ? `${tpw(slot.rolle)}: ${slot.name}` : slot.name
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
        <div className="plan-week-range">{tpw(week.range)}</div>
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

      {openTotal > 0 && (
        <div className="plan-open">
          <div className="plan-open-title">
            {t.offeneTitle} · {openTotal}
          </div>
          {openSlots.map((slot, i) => (
            <div key={i} className="plan-open-row">
              {tabName(slot.tab)}: {slot.lang === 'u' ? tu(slot.text) : tpw(slot.text)}
              {slot.n > 1 ? ` ×${slot.n}` : ''}
            </div>
          ))}
        </div>
      )}

      {meeting.sections.map((section, si) => {
        // Logik immer über die kanonische Sektion (Labels/Minuten sind dort deutsch)
        const rawSection = rawMeeting.sections[si]
        const isLac = rawSection.label === LAC_LABEL
        // Wochenende: Vortragsthema als Freitext, Anfangslied als Nummernfeld
        const isTalk = state.tab === 'we' && rawSection.label === TALK_LABEL
        const isOpening = state.tab === 'we' && rawSection.label === OPENING_LABEL
        const movables = movableIndices(rawSection)
        return (
          <div key={rawSection.label} className="panel" data-farbe={section.farbe}>
            <div className="panel-label">{tpw(section.label)}</div>
            {section.items.map((item, ii) => {
              if (isSong(item)) {
                return (
                  <div key={ii} className="panel-song">
                    {tpw(item.song)}
                  </div>
                )
              }
              const rawItem = rawSection.items[ii]
              const rawTitle = isSong(rawItem) ? '' : rawItem.title
              const rawMins = isSong(rawItem) ? null : itemMinutes(rawItem)
              const editable = isLac && rawMins != null
              const mPos = movables.indexOf(ii)
              return (
                <div key={ii} className="plan-item">
                  <div className="plan-item-head">
                    {isTalk ? (
                      <input
                        key={`talk-${state.week}-${ii}`}
                        type="text"
                        className="talk-title-input"
                        placeholder={t.vortragThemaPh}
                        aria-label={t.vortragThemaPh}
                        defaultValue={rawTitle === TALK_PLACEHOLDER ? '' : rawTitle}
                        onBlur={(e) => dispatch({ type: 'talkEdit', si, ii, title: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') e.currentTarget.blur()
                        }}
                      />
                    ) : (
                      <div className="plan-item-title">{tpw(item.title)}</div>
                    )}
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
                  {item.meta && <div className="plan-item-meta">{tpw(item.meta)}</div>}
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
                      <span className="lac-mins">{tpw(`${rawMins} Min.`)}</span>
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
            {isOpening && (
              <div className="talk-song-row">
                <span className="plan-helper-label">{t.anfangsliedLbl}</span>
                <input
                  key={`song-${state.week}`}
                  type="text"
                  inputMode="numeric"
                  className="lac-add-input talk-song-input"
                  placeholder={t.liedNrPh}
                  aria-label={t.anfangsliedLbl}
                  defaultValue={openingSongNr(rawWeek.we)}
                  onBlur={(e) => dispatch({ type: 'openingSong', song: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur()
                  }}
                />
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
