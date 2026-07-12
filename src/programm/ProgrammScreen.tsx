import { useApp } from '../app/context'
import { MeetingTabs } from '../components/MeetingTabs'
import { WeekNav } from '../components/WeekNav'
import { MemorialBanner, WeekChips } from '../components/WeekBadges'
import { CURRENT_PERSON_ID, PROGRAM_AS_OF } from '../data/demo'
import { displayName, isSong } from '../data/helpers'
import { CONG_TO_CODE } from '../i18n/langs'
import type { PartItem } from '../data/types'
import './programm.css'

const DEMO_LANG_HINT =
  'Demo: Programminhalte sind nur auf Deutsch, Englisch, Spanisch und Französisch verfügbar — Anzeige auf Deutsch.'

/**
 * Programm (Screen 2, Startscreen): Wochenprogramm beider Zusammenkünfte
 * mit Bereichs-Panels in Arbeitsheft-Farblogik und Hilfsdienste-Übersicht.
 */
export function ProgrammScreen() {
  const { state, dispatch } = useApp()
  const week = state.weeks[state.week]
  const meeting = state.tab === 'mid' ? week.mid : week.we
  const me = state.persons.find((p) => p.id === CURRENT_PERSON_ID)
  const myName = me ? displayName(me) : null
  // Demo-Programminhalte nur für de/en/es/fr — sonst Anzeige auf Deutsch
  const progFallback = !CONG_TO_CODE[state.congLang]

  return (
    <section className="screen">
      <WeekNav
        canPrev={state.week > 0}
        canNext={state.week < state.weeks.length - 1}
        onPrev={() => dispatch({ type: 'prevWeek' })}
        onNext={() => dispatch({ type: 'nextWeek' })}
      >
        <div className="prog-week-range">{week.range}</div>
        <div className="prog-week-book">{week.book}</div>
      </WeekNav>

      <WeekChips week={week} showCurrent />

      <MeetingTabs
        className="prog-tabs"
        tab={state.tab}
        onChange={(tab) => dispatch({ type: 'setTab', tab })}
      />

      {progFallback && <div className="prog-lang-hint">{DEMO_LANG_HINT}</div>}

      <MemorialBanner week={week} tab={state.tab} />

      <p className="prog-meta">{meeting.date}</p>

      {meeting.sections.map((section) => (
        <div key={section.label} className="panel" data-farbe={section.farbe}>
          <div className="panel-label">{section.label}</div>
          {section.items.map((item, index) =>
            isSong(item) ? (
              <div key={index} className="panel-song">
                {item.song}
              </div>
            ) : (
              <ProgramRow key={index} item={item} myName={myName} />
            ),
          )}
        </div>
      ))}

      <div className="panel panel--pb16" data-farbe="neutral2">
        <div className="panel-label">HILFSDIENSTE</div>
        <div className="prog-helpers-grid">
          {state.services.map((service) => {
            const assigned = (meeting.helpers[service.key] ?? [])
              .filter(Boolean)
              .slice(0, service.count)
            const cells = assigned.concat(
              Array<string>(Math.max(0, service.count - assigned.length)).fill('offen'),
            )
            return (
              <div key={service.key}>
                <div className="prog-helper-label">{service.name.toUpperCase()}</div>
                <div className="prog-helper-names">{cells.join(' · ')}</div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="prog-footer">
        <span>{meeting.end}</span>
        <span>Stand: {PROGRAM_AS_OF}</span>
      </div>
    </section>
  )
}

function ProgramRow({ item, myName }: { item: PartItem; myName: string | null }) {
  return (
    <div className={item.num != null ? 'prog-row prog-row--num' : 'prog-row'}>
      {item.num != null && <div className="prog-num">{item.num}.</div>}
      <div>
        <div className="prog-title">{item.title}</div>
        {item.meta && <div className="prog-item-meta">{item.meta}</div>}
      </div>
      <div className="prog-names">
        {item.names.map((slot, index) => (
          <div key={index} className="prog-name-block">
            <div className="prog-name">
              {myName !== null && slot.name === myName && <span className="chip-du">DU</span>}
              <span>{slot.name || '— offen —'}</span>
            </div>
            {slot.rolle && <div className="prog-role">{slot.rolle}</div>}
          </div>
        ))}
      </div>
    </div>
  )
}
