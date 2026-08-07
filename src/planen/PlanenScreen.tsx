import { useApp } from '../app/context'
import { MeetingTabs } from '../components/MeetingTabs'
import { WeekStrip } from '../components/WeekStrip'
import { WeekNav } from '../components/WeekNav'
import { MemorialBanner, WeekChips } from '../components/WeekBadges'
import { hatAuxKlasse } from '../data/aux-class'
import { CURRENT_PERSON_ID } from '../data/demo'
import { overseerGroup } from '../data/helpers'
import { countOpenSlots } from '../data/planning'
import type { MeetingKey } from '../data/types'
import { fill, useProgWeek, useT } from '../i18n/useT'
import { ConflictsBanner, OpenSlotsBanner } from './PlanBanners'
import { AutoAssignPanel } from './AutoAssignPanel'
import { FsPlan } from './FsPlan'
import { AuxCounselorPanel } from './AuxCounselorPanel'
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
  // Der Streifen zeichnet dieselben Inhalte dreimal — vorige, aktuelle und
  // nächste Woche — und übernimmt das Wischen.
  return (
    <WeekStrip>
      <PlanenBody />
    </WeekStrip>
  )
}

/** Planung EINER Woche; welche, sagt der Zustand (im Streifen überschrieben). */
function PlanenBody() {
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
          <h2 className="panel-label">{t.keineWochenTitel}</h2>
          <p className="prog-meta">{t.keineWochenHinweis}</p>
        </div>
      </section>
    )
  }

  // Gruppenaufseher (ohne volle Planer-Rechte): nur Treffpunkte der eigenen Gruppe.
  const myFsGroup = overseerGroup(state.groups, state.personId ?? CURRENT_PERSON_ID)
  const fsOverseer = !state.planner && myFsGroup !== null
  const isFs = state.tab === 'fs' || fsOverseer
  const mtab: MeetingKey = state.tab === 'we' ? 'we' : 'mid'
  const meeting = week[mtab]
  const rawMeeting = rawWeek[mtab]
  const openCount = countOpenSlots(rawMeeting, state.services)

  return (
    <section className="screen">
      <div className="screen-head">
        <h1 className="screen-title">{t.planen}</h1>
        {!isFs && <span className="screen-head-note">{fill(t.offeneZut, { n: openCount })}</span>}
      </div>

      <WeekNav
        className="plan-week-nav"
        canPrev={state.week > state.weekFrom}
        canNext={state.week < state.weeks.length - 1}
        onPrev={() => dispatch({ type: 'prevWeek' })}
        onNext={() => dispatch({ type: 'nextWeek' })}
      >
        <div className="plan-week-range">{tpw(week.range)}</div>
      </WeekNav>

      <WeekChips week={week} showCurrent={false} />

      {!fsOverseer && (
        <MeetingTabs
          className="plan-tabs"
          tab={state.tab}
          showFs
          onChange={(tab) => dispatch({ type: 'setTab', tab })}
        />
      )}

      {isFs ? (
        <FsPlan onlyGroup={fsOverseer ? myFsGroup : null} />
      ) : (
        <>
          <MemorialBanner week={week} tab={state.tab} />

          <p className="plan-hint">{t.planHint}</p>

          <AutoAssignPanel />
          <p className="plan-legend">{t.planLegend}</p>

          <ConflictsBanner tab={mtab} />
          <OpenSlotsBanner tab={mtab} tpw={tpw} />

          {meeting.sections.map((section, si) => (
            <MeetingSection
              key={rawMeeting.sections[si].label}
              si={si}
              section={section}
              rawSection={rawMeeting.sections[si]}
              mitAux={hatAuxKlasse(rawMeeting)}
              tpw={tpw}
            />
          ))}

          <AuxCounselorPanel meeting={rawMeeting} />

          <HelpersPanel meeting={meeting} />
        </>
      )}
    </section>
  )
}
