import { Fragment } from 'react'
import { useApp } from '../app/context'
import { MeetingTabs } from '../components/MeetingTabs'
import { WeekStrip } from '../components/WeekStrip'
import { WeekNav } from '../components/WeekNav'
import { MemorialBanner, WeekChips } from '../components/WeekBadges'
import { CURRENT_PERSON_ID } from '../data/demo'
import { LABEL_ABSCHLUSS, LABEL_EROEFFNUNG } from '../data/constants'
import { displayName, isSong, splitOpeningSong } from '../data/helpers'
import { LOCALES } from '../i18n/langs'
import { fill, useProgWeek, useT } from '../i18n/useT'
import type { Lang, Meeting, MeetingTab, PartItem, Week } from '../data/types'
import { FsProgram } from './FsProgram'
import './programm.css'
import './print.css'

/** Heutiges Datum (Tag + Monat) in der Sprache des Nutzers. */
function heute(lang: Lang): string {
  try {
    return new Intl.DateTimeFormat(LOCALES[lang] ?? lang, { day: 'numeric', month: 'long' }).format(new Date())
  } catch {
    return ''
  }
}

/**
 * Programm (Screen 2, Startscreen): Wochenprogramm beider Zusammenkünfte
 * mit Bereichs-Panels in Arbeitsheft-Farblogik und Hilfsdienste-Übersicht.
 * Angezeigt wird die Sprachvariante der App-Sprache, falls beim Import
 * mitgeholt (useProgWeek) — sonst die Versammlungssprache.
 */
export function ProgrammScreen() {
  // Der Streifen zeichnet dieselben Inhalte dreimal — vorige, aktuelle und
  // naechste Woche — und uebernimmt das Wischen.
  return (
    <WeekStrip>
      <ProgrammBody />
    </WeekStrip>
  )
}

/** Programm EINER Woche; welche, sagt der Zustand (im Streifen ueberschrieben). */
function ProgrammBody() {
  const { state, dispatch } = useApp()
  const { t } = useT()
  const { week, tpw } = useProgWeek(state.weeks[state.week])

  // Noch keine Wochen (z. B. frisch eingerichtete Versammlung) → Hinweis
  if (!week) {
    return (
      <section className="screen">
        <h1 className="sr-only">{t.navProgramm}</h1>
        <div className="panel panel--lead" data-farbe="neutral">
          <div className="panel-label">{t.keineWochenTitel}</div>
          <p className="prog-meta">{t.keineWochenHinweis}</p>
        </div>
      </section>
    )
  }

  const isFs = state.tab === 'fs'
  const meeting = state.tab === 'we' ? week.we : week.mid // fs nutzt Meeting-Inhalt nicht
  // Kanonische Fassung (deutsche Sektions-Labels) zum Erkennen von ERÖFFNUNG/
  // ABSCHLUSS — dort wird das Lied aus dem Sammeltitel mittig+kursiv gezogen.
  const rawWeek = state.weeks[state.week]
  const rawMeeting = state.tab === 'we' ? rawWeek.we : rawWeek.mid
  const me = state.persons.find((p) => p.id === (state.personId ?? CURRENT_PERSON_ID))
  const myName = me ? displayName(me) : null
  const tabName = state.tab === 'we' ? t.tabWe : isFs ? t.fsShort : t.tabMid

  return (
    <section className="screen prog-screen">
      <h1 className="sr-only">{t.navProgramm}</h1>
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
        <ProgramMeeting
          meeting={meeting}
          rawMeeting={rawMeeting}
          week={week}
          tab={state.tab}
          myName={myName}
          tpw={tpw}
        />
      )}
    </section>
  )
}

/** Programm einer Zusammenkunft (Datum, Bereichs-Panels, Hilfsdienste, Fußzeile). */
function ProgramMeeting({
  meeting,
  rawMeeting,
  week,
  tab,
  myName,
  tpw,
}: {
  meeting: Meeting
  rawMeeting: Meeting
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

      {meeting.sections.map((section, si) => {
        // ERÖFFNUNG/ABSCHLUSS tragen das Lied im Sammeltitel — herausgezogen
        // als eigene mittig+kursive Zeile (einheitlich mit den übrigen Liedern).
        const canonical = rawMeeting.sections[si]?.label
        const splitHere = canonical === LABEL_EROEFFNUNG || canonical === LABEL_ABSCHLUSS
        return (
          <div key={section.label} className="panel" data-farbe={section.farbe}>
            <div className="panel-label">{tpw(section.label)}</div>
            {section.items.map((item, index) => {
              if (isSong(item)) {
                return (
                  <div key={index} className="panel-song">
                    {tpw(item.song)}
                  </div>
                )
              }
              const { song, rest } = splitHere
                ? splitOpeningSong(tpw(item.title))
                : { song: null, rest: '' }
              return (
                <Fragment key={index}>
                  {song && <div className="panel-song">{song}</div>}
                  <ProgramRow item={item} title={song ? rest : undefined} myName={myName} tpw={tpw} />
                </Fragment>
              )
            })}
          </div>
        )
      })}

      <div className="panel panel--pb16 prog-helpers" data-farbe="neutral2">
        <div className="panel-label">{t.hilfsdienste}</div>
        <div className="prog-helpers-grid">
          {state.services.map((service) => {
            const assigned = (meeting.helpers[service.key] ?? [])
              .map((slot) => slot.name)
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
        {/* „Stand" stand als festes Datum aus dem Prototyp hier (4. September)
            und war damit auf jedem Ausdruck falsch. Gemeint ist der Tag, an
            dem das Blatt entsteht — also heute, in der Sprache des Nutzers. */}
        <span>{fill(t.stand, { datum: heute(state.lang) })}</span>
      </div>
    </>
  )
}

function ProgramRow({
  item,
  title,
  myName,
  tpw,
}: {
  item: PartItem
  title?: string // überschriebener Titel (Lied bereits herausgezogen)
  myName: string | null
  tpw: (s: string) => string
}) {
  const { t, tu } = useT()
  return (
    <div className={item.num != null ? 'prog-row prog-row--num' : 'prog-row'}>
      {item.num != null && <div className="prog-num">{item.num}.</div>}
      <div>
        <div className="prog-title">{title ?? tpw(item.title)}</div>
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
