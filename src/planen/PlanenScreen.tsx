import { useApp } from '../app/context'
import { MeetingTabs } from '../components/MeetingTabs'
import { WeekNav } from '../components/WeekNav'
import { MemorialBanner, WeekChips } from '../components/WeekBadges'
import { countOpenSlots } from '../data/planning'
import { fill, useProgWeek, useT } from '../i18n/useT'
import { ConflictsBanner, OpenSlotsBanner } from './PlanBanners'
import { HelpersPanel } from './HelpersPanel'
import { MeetingSection } from './MeetingSection'
import './planen.css'

/**
 * Planen (Screen 3, nur Planer): alle Slots einer Woche als Chips —
 * Tippen öffnet das Zuteilungs-Sheet. Belegte Slots zeigen ✓ (bestätigt)
 * oder … (wartet). „Unser Leben als Christ" ist editierbar. Der Screen
 * orchestriert nur; Banner, Abschnitte und Hilfsdienste sind eigene Bausteine.
 */
export function PlanenScreen() {
  const { state, dispatch } = useApp()
  const { t } = useT()
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

      <ConflictsBanner />
      <OpenSlotsBanner tpw={tpw} />

      {meeting.sections.map((section, si) => (
        <MeetingSection
          key={rawMeeting.sections[si].label}
          si={si}
          section={section}
          rawSection={rawMeeting.sections[si]}
          tpw={tpw}
        />
      ))}

      <HelpersPanel meeting={meeting} />
    </section>
  )
}
