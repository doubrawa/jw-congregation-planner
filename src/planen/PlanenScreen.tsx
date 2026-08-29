import { useApp } from '../app/context'
import { MeetingTabs } from '../components/MeetingTabs'
import { WeekStrip } from '../components/WeekStrip'
import { WeekNav } from '../components/WeekNav'
import { AusfallBanner, MemorialBanner, WeekChips } from '../components/WeekBadges'
import { hatAuxKlasse } from '../data/aux-class'
import { istAusgefallen, mtab, aufseherGruppe } from '../data/helpers'
import { countOpenSlots } from '../data/planning'
import { fill, useProgWeek, useT } from '../i18n/useT'
import { ConflictsBanner, EngpassBanner, FsConflictsBanner, OpenSlotsBanner } from './PlanBanners'
import { PlanSendenPanel } from './PlanSendenPanel'
import { AutoAssignPanel } from './AutoAssignPanel'
import { S89Bogen } from './S89Bogen'
import { FsPlan } from './FsPlan'
import { AuxCounselorPanel } from './AuxCounselorPanel'
import { WochePanel } from './WochePanel'
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
  const myFsGroup = aufseherGruppe(state.planner, state.groups, state.personId)
  const fsOverseer = !state.planner && myFsGroup !== null
  const isFs = state.tab === 'fs' || fsOverseer
  // Die Bearbeiten-Ansicht (T64) gibt es nur für Planer — der Gruppenaufseher
  // sieht ohnehin nur seine Treffpunkte.
  const isEdit = state.tab === 'edit' && !fsOverseer
  const tab = mtab(state.tab)
  const meeting = week[tab]
  const rawMeeting = rawWeek[tab]
  // Entfällt die Zusammenkunft, sind ihre Plätze nicht offen — sie werden nicht
  // gebraucht (T30).
  const openCount = istAusgefallen(rawWeek, tab) ? 0 : countOpenSlots(rawMeeting, state.services)

  return (
    <section className="screen">
      <div className="screen-head">
        <h1 className="screen-title">{t.planen}</h1>
        {!isFs && <span className="screen-head-note">{fill(t.offeneZut, { n: openCount })}</span>}
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

      {!fsOverseer && (
        <MeetingTabs
          className="plan-tabs"
          tab={state.tab}
          week={rawWeek}
          showFs
          showEdit
          onChange={(tab) => dispatch({ type: 'setTab', tab })}
        />
      )}

      {isEdit ? (
        <WochePanel />
      ) : isFs ? (
        <>
          <FsConflictsBanner onlyGroup={fsOverseer ? myFsGroup : null} />
          <FsPlan onlyGroup={fsOverseer ? myFsGroup : null} />
          {/* Derselbe Knopf wie bei den Zusammenkünften: er gibt die **ganze**
              Woche frei, Treffpunkte eingeschlossen. Er steht in beiden
              Ansichten, weil ein Planer die Woche in beiden fertig machen kann
              — und nicht zweimal senden muss. */}
          <PlanSendenPanel />
        </>
      ) : (
        <>
          <MemorialBanner week={week} tab={state.tab} />
          <AusfallBanner week={rawWeek} tab={tab} />

          <p className="plan-hint">{t.planHint}</p>


          <AutoAssignPanel />
          <p className="plan-legend">{t.planLegend}</p>

          {/* Schulungsaufgaben gibt es nur unter der Woche — der Bogen steht
              deshalb nur dort und zeigt sich gar nicht, wenn keine da sind. */}
          {tab === 'mid' && <S89Bogen />}

          <ConflictsBanner tab={tab} />
          {/* Über den offenen Zuteilungen: Das Banner erklärt einen Teil ihrer
              Zahl — die Plätze, die offen bleiben MÜSSEN, weil zu wenige da
              sind. Die Erklärung gehört vor die Aufzählung. */}
          <EngpassBanner tab={tab} />
          <OpenSlotsBanner tab={tab} tpw={tpw} />

          {/* Die Sprachvariante ist strukturgleich zur kanonischen Woche
              (`localizedWeek` prüft das) — fehlt der Abschnitt dort trotzdem,
              wird er übersprungen statt die Ansicht abstürzen zu lassen. */}
          {meeting.sections.map((section, si) => {
            const rawSection = rawMeeting.sections[si]
            if (!rawSection) return null
            return (
              <MeetingSection
                key={rawSection.label}
                si={si}
                section={section}
                rawSection={rawSection}
                mitAux={hatAuxKlasse(rawMeeting)}
                tpw={tpw}
              />
            )
          })}

          <AuxCounselorPanel meeting={rawMeeting} />

          <HelpersPanel meeting={meeting} />

          {/* Ganz unten, weil es der letzte Schritt ist: erst steht der Plan,
              dann geht er hinaus. Er gilt für die ganze Woche, nicht für den
              Reiter darüber. */}
          <PlanSendenPanel />
        </>
      )}
    </section>
  )
}
