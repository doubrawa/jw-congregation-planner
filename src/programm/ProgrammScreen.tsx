import { useApp } from '../app/context'
import { MeetingTabs } from '../components/MeetingTabs'
import { WeekNav } from '../components/WeekNav'
import { MemorialBanner, WeekChips } from '../components/WeekBadges'
import { CURRENT_PERSON_ID } from '../data/demo'
import { displayName, isSong } from '../data/helpers'
import { useT, type I18n } from '../i18n/useT'
import type { PartItem } from '../data/types'
import './programm.css'

/**
 * Programm (Screen 2, Startscreen): Wochenprogramm beider Zusammenkünfte
 * mit Bereichs-Panels in Arbeitsheft-Farblogik und Hilfsdienste-Übersicht.
 */
export function ProgrammScreen() {
  const { state, dispatch } = useApp()
  const i18n = useT()
  const { t, tu, tp, progFallback } = i18n
  const week = state.weeks[state.week]
  const meeting = state.tab === 'mid' ? week.mid : week.we
  const me = state.persons.find((p) => p.id === CURRENT_PERSON_ID)
  const myName = me ? displayName(me) : null

  return (
    <section className="screen">
      <WeekNav
        canPrev={state.week > 0}
        canNext={state.week < state.weeks.length - 1}
        onPrev={() => dispatch({ type: 'prevWeek' })}
        onNext={() => dispatch({ type: 'nextWeek' })}
      >
        <div className="prog-week-range">{tp(week.range)}</div>
        <div className="prog-week-book">{tp(week.book)}</div>
      </WeekNav>

      <WeekChips week={week} showCurrent />

      <MeetingTabs
        className="prog-tabs"
        tab={state.tab}
        onChange={(tab) => dispatch({ type: 'setTab', tab })}
      />

      {progFallback && <div className="prog-lang-hint">{t.demoLangHint}</div>}

      <MemorialBanner week={week} tab={state.tab} />

      <p className="prog-meta">{tp(meeting.date)}</p>

      {meeting.sections.map((section) => (
        <div key={section.label} className="panel" data-farbe={section.farbe}>
          <div className="panel-label">{tp(section.label)}</div>
          {section.items.map((item, index) =>
            isSong(item) ? (
              <div key={index} className="panel-song">
                {tp(item.song)}
              </div>
            ) : (
              <ProgramRow key={index} item={item} myName={myName} i18n={i18n} />
            ),
          )}
        </div>
      ))}

      <div className="panel panel--pb16" data-farbe="neutral2">
        <div className="panel-label">{t.hilfsdienste}</div>
        <div className="prog-helpers-grid">
          {state.services.map((service) => {
            const assigned = (meeting.helpers[service.key] ?? [])
              .filter(Boolean)
              .slice(0, service.count)
              .map((n) => tu(n))
            const cells = assigned.concat(
              Array<string>(Math.max(0, service.count - assigned.length)).fill(t.offenWort),
            )
            return (
              <div key={service.key}>
                <div className="prog-helper-label">{tu(service.name).toUpperCase()}</div>
                <div className="prog-helper-names">{cells.join(' · ')}</div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="prog-footer">
        <span>{tp(meeting.end)}</span>
        <span>{t.stand}</span>
      </div>
    </section>
  )
}

function ProgramRow({
  item,
  myName,
  i18n,
}: {
  item: PartItem
  myName: string | null
  i18n: I18n
}) {
  const { t, tp } = i18n
  return (
    <div className={item.num != null ? 'prog-row prog-row--num' : 'prog-row'}>
      {item.num != null && <div className="prog-num">{item.num}.</div>}
      <div>
        <div className="prog-title">{tp(item.title)}</div>
        {item.meta && <div className="prog-item-meta">{tp(item.meta)}</div>}
      </div>
      <div className="prog-names">
        {item.names.map((slot, index) => (
          <div key={index} className="prog-name-block">
            <div className="prog-name">
              {myName !== null && slot.name === myName && <span className="chip-du">DU</span>}
              <span>{slot.name || t.offenDash}</span>
            </div>
            {slot.rolle && <div className="prog-role">{tp(slot.rolle)}</div>}
          </div>
        ))}
      </div>
    </div>
  )
}
