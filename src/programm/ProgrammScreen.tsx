import { useApp } from '../app/context'
import { MeetingTabs } from '../components/MeetingTabs'
import { WeekNav } from '../components/WeekNav'
import { MemorialBanner, WeekChips } from '../components/WeekBadges'
import { CURRENT_PERSON_ID } from '../data/demo'
import { displayName, isSong } from '../data/helpers'
import { useProgWeek, useT } from '../i18n/useT'
import type { Meeting, MeetingTab, PartItem, Week } from '../data/types'
import { FsProgram } from './FsProgram'
import './programm.css'
import './print.css'

/**
 * Programm (Screen 2, Startscreen): Wochenprogramm beider Zusammenkünfte
 * mit Bereichs-Panels in Arbeitsheft-Farblogik und Hilfsdienste-Übersicht.
 * Angezeigt wird die Sprachvariante der App-Sprache, falls beim Import
 * mitgeholt (useProgWeek) — sonst die Versammlungssprache.
 */
export function ProgrammScreen() {
  const { state, dispatch } = useApp()
  const { t } = useT()
  const { week, tpw } = useProgWeek(state.weeks[state.week])

  // Noch keine Wochen (z. B. frisch eingerichtete Versammlung) → Hinweis
  if (!week) {
    return (
      <section className="screen">
        <div className="panel panel--lead" data-farbe="neutral">
          <div className="panel-label">{t.keineWochenTitel}</div>
          <p className="prog-meta">{t.keineWochenHinweis}</p>
        </div>
      </section>
    )
  }

  const isFs = state.tab === 'fs'
  const meeting = state.tab === 'we' ? week.we : week.mid // fs nutzt Meeting-Inhalt nicht
  const me = state.persons.find((p) => p.id === (state.personId ?? CURRENT_PERSON_ID))
  const myName = me ? displayName(me) : null
  const tabName = state.tab === 'we' ? t.tabWe : isFs ? t.fsShort : t.tabMid

  return (
    <section className="screen prog-screen">
      {/* Nur im Ausdruck: ordnet das Blatt zu (Tabs/Navigation fehlen dort). */}
      <div className="prog-print-head">
        <span>{state.congregation.name}</span>
        <span>{tabName}</span>
      </div>

      <WeekNav
        canPrev={state.week > 0}
        canNext={state.week < state.weeks.length - 1}
        onPrev={() => dispatch({ type: 'prevWeek' })}
        onNext={() => dispatch({ type: 'nextWeek' })}
      >
        <div className="prog-week-range">{tpw(week.range)}</div>
        <div className="prog-week-book">{tpw(week.book)}</div>
      </WeekNav>

      <WeekChips week={week} showCurrent />

      <MeetingTabs
        className="prog-tabs"
        tab={state.tab}
        showFs
        onChange={(tab) => dispatch({ type: 'setTab', tab })}
      />

      {isFs ? (
        <FsProgram />
      ) : (
        <ProgramMeeting meeting={meeting} week={week} tab={state.tab} myName={myName} tpw={tpw} />
      )}
    </section>
  )
}

/** Programm einer Zusammenkunft (Datum, Bereichs-Panels, Hilfsdienste, Fußzeile). */
function ProgramMeeting({
  meeting,
  week,
  tab,
  myName,
  tpw,
}: {
  meeting: Meeting
  week: Week
  tab: MeetingTab
  myName: string | null
  tpw: (s: string) => string
}) {
  const { state } = useApp()
  const { t, tu } = useT()
  return (
    <>
      <MemorialBanner week={week} tab={tab} />

      <div className="prog-meta-row">
        <p className="prog-meta">{tpw(meeting.date)}</p>
        <button type="button" className="prog-print-btn" onClick={() => window.print()}>
          {t.drucken}
        </button>
      </div>

      {meeting.sections.map((section) => (
        <div key={section.label} className="panel" data-farbe={section.farbe}>
          <div className="panel-label">{tpw(section.label)}</div>
          {section.items.map((item, index) =>
            isSong(item) ? (
              <div key={index} className="panel-song">
                {tpw(item.song)}
              </div>
            ) : (
              <ProgramRow key={index} item={item} myName={myName} tpw={tpw} />
            ),
          )}
        </div>
      ))}

      <div className="panel panel--pb16 prog-helpers" data-farbe="neutral2">
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
        <span>{tpw(meeting.end)}</span>
        <span>{t.stand}</span>
      </div>
    </>
  )
}

function ProgramRow({
  item,
  myName,
  tpw,
}: {
  item: PartItem
  myName: string | null
  tpw: (s: string) => string
}) {
  const { t, tu } = useT()
  return (
    <div className={item.num != null ? 'prog-row prog-row--num' : 'prog-row'}>
      {item.num != null && <div className="prog-num">{item.num}.</div>}
      <div>
        <div className="prog-title">{tpw(item.title)}</div>
        {item.meta && <div className="prog-item-meta">{tpw(item.meta)}</div>}
      </div>
      <div className="prog-names">
        {item.names.map((slot, index) => (
          <div key={index} className="prog-name-block">
            <div className="prog-name">
              {myName !== null && slot.name === myName && <span className="chip-du">DU</span>}
              <span>{slot.name || t.offenDash}</span>
            </div>
            {slot.rolle && <div className="prog-role">{tu(slot.rolle)}</div>}
          </div>
        ))}
      </div>
    </div>
  )
}
