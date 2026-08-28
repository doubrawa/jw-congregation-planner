import { Fragment } from 'react'
import { useApp } from '../app/context'
import { istBlockSektion, mtab } from '../data/helpers'
import { MeetingTabs } from '../components/MeetingTabs'
import { WeekStrip } from '../components/WeekStrip'
import { WeekNav } from '../components/WeekNav'
import { MemorialBanner, TerminListe, WeekChips } from '../components/WeekBadges'
import { currentWeekIndex, meetingDateText } from '../data/meeting-dates'
import { hatAuxKlasse } from '../data/aux-class'
import { gehoertZu, isSong, splitOpeningSong } from '../data/helpers'
import { LOCALES } from '../i18n/langs'
import { fill, useProgWeek, useT } from '../i18n/useT'
import type { Lang, Meeting, MeetingTab, PartItem, Person, Week } from '../data/types'
import { FsProgram } from './FsProgram'
import './programm.css'
import './print.css'

/** Heutiges Datum (Tag + Monat) in der Sprache des Nutzers. */
function heute(lang: Lang): string {
  return new Intl.DateTimeFormat(LOCALES[lang], { day: 'numeric', month: 'long' }).format(new Date())
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
  const rawWeek = state.weeks[state.week]
  const { week, tpw } = useProgWeek(rawWeek)

  // Noch keine Wochen (z. B. frisch eingerichtete Versammlung) → Hinweis
  if (!week || !rawWeek) {
    return (
      <section className="screen">
        <h1 className="sr-only">{t.navProgramm}</h1>
        <div className="panel panel--lead" data-farbe="neutral">
          <h2 className="panel-label">{t.keineWochenTitel}</h2>
          <p className="prog-meta">{t.keineWochenHinweis}</p>
        </div>
      </section>
    )
  }

  const isFs = state.tab === 'fs'
  const meeting = state.tab === 'we' ? week.we : week.mid // fs nutzt Meeting-Inhalt nicht
  // Kanonische Fassung (deutsche Sektions-Labels) zum Erkennen von ERÖFFNUNG/
  // ABSCHLUSS — dort wird das Lied aus dem Sammeltitel mittig+kursiv gezogen.
  const rawMeeting = state.tab === 'we' ? rawWeek.we : rawWeek.mid
  const me = state.persons.find((p) => p.id === state.personId)
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

      <WeekChips week={week} showCurrent istAktuell={currentWeekIndex(state.weeks) === state.week} />

      {/* Weitere Termine der Woche (T63): über den Reitern, weil sie zu keiner
          der drei Zusammenkünfte gehören, sondern zur Woche — und damit auf
          jedem Reiter sichtbar bleiben. */}
      <TerminListe week={rawWeek} />

      <MeetingTabs
        className="prog-tabs"
        tab={state.tab}
        week={rawWeek}
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
          rawWeek={rawWeek}
          tab={state.tab}
          me={me}
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
  rawWeek,
  tab,
  me,
  tpw,
}: {
  meeting: Meeting
  rawMeeting: Meeting
  week: Week
  /** Unübersetzte Woche — der Termin wird aus den kanonischen Daten gerechnet. */
  rawWeek: Week
  tab: MeetingTab
  /** Die eigene Person — für den DU-Chip. Entschieden wird über `gehoertZu`. */
  me: Person | undefined
  tpw: (s: string) => string
}) {
  const { state } = useApp()
  const { t, tu } = useT()
  // Ob es eine Zusätzliche Klasse gibt, steht in den Wochendaten — nicht am
  // Schalter und erst recht nicht am bloßen Vorhandensein von `item.aux`:
  // dessen Namen bleiben beim Ausschalten stehen, und das Programm zeigte
  // danach weiter beide Räume.
  const mitAux = hatAuxKlasse(rawMeeting)
  return (
    <>
      <MemorialBanner week={week} tab={tab} />

      <div className="prog-meta-row">
        {/* Gerechneter Termin statt des rohen date-Felds: importierte Wochen
            tragen dort nur die Wochenspanne („7.–13. September"). */}
        <p className="prog-meta">
          {tpw(
            meetingDateText(
              rawWeek,
              state.week,
              mtab(tab),
              state.congregation.meetings,
            ),
          )}
        </p>
        <button type="button" className="prog-print-btn" onClick={() => window.print()}>
          {t.drucken}
        </button>
      </div>

      {meeting.sections.map((section, si) => {
        // ERÖFFNUNG/ABSCHLUSS tragen das Lied im Sammeltitel — herausgezogen
        // als eigene mittig+kursive Zeile (einheitlich mit den übrigen Liedern).
        //
        // Gefragt wird die **Art** des Abschnitts, nicht sein Name: `section`
        // ist hier die angezeigte (womöglich übersetzte) Fassung, `rawSection`
        // die kanonische. Der Name griff bisher nur, weil ERÖFFNUNG und
        // ABSCHLUSS die einzigen Überschriften sind, die der Import **nicht**
        // aus der Zielsprache übernimmt — eine stille Verabredung mit
        // `parse.ts`, an deren Gegenstück (`LABEL_LAC`) genau dieser Weg schon
        // einmal gescheitert ist.
        const rawSection = rawMeeting.sections[si]
        const splitHere = rawSection ? istBlockSektion(rawSection) : false
        return (
          <div key={section.label} className="panel" data-farbe={section.farbe}>
            <h2 className="panel-label">{tpw(section.label)}</h2>
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
                  <ProgramRow
                    item={item}
                    title={song ? rest : undefined}
                    mitAux={mitAux}
                    me={me}
                    tpw={tpw}
                  />
                </Fragment>
              )
            })}
          </div>
        )
      })}

      {/* Ratgeber der Zusätzlichen Klasse — gehört zur ganzen Klasse, nicht
          zu einem Punkt, deshalb eine eigene Zeile hinter dem Programm. */}
      {mitAux && rawMeeting.auxRatgeber && (
        <div className="panel panel--pb16" data-farbe="neutral2">
          <h2 className="panel-label">{t.auxKlassen}</h2>
          {/* Der Titel steht hier schon in der Sprache des Lesers (`t.…`) und
              geht deshalb als fertiger Text hinein, nicht durch `tpw`: „Ratgeber"
              ist ein Programm-Fragment, das der Übersetzer sonst ein zweites Mal
              anfasst — bei deutscher App und englischer Versammlungssprache stand
              „Counselor" unter der deutschen Überschrift. */}
          <ProgramRow
            item={{ title: t.auxRatgeber, names: [rawMeeting.auxRatgeber] }}
            title={t.auxRatgeber}
            mitAux={false}
            me={me}
            tpw={tpw}
          />
        </div>
      )}

      <div className="panel panel--pb16 prog-helpers" data-farbe="neutral2">
        <h2 className="panel-label">{t.hilfsdienste}</h2>
        <div className="prog-helpers-grid">
          {state.services.map((service) => {
            const arr = meeting.helpers[service.key] ?? []
            /*
             * Platz für Platz, genau so weit wie `service.count` reicht — die
             * gleiche Grenze, nach der `countOpenSlots`, `deriveMyTasks` und
             * `helperWorkload` rechnen.
             *
             * Vorher wurden erst die leeren Namen weggeworfen und dann
             * abgeschnitten. Das verschob die Besetzung nach vorn (Platz 2
             * besetzt, Platz 1 offen → „Anna · offen") und, schlimmer, zeigte
             * einen Namen, den es gar nicht mehr gibt: Reduziert der Planer die
             * Platzzahl, bleiben die Namen dahinter in den Wochendaten stehen —
             * das Programmblatt nannte dann jemanden, den die Aufgabenliste,
             * die Auslastung und der Planen-Screen längst nicht mehr kennen.
             */
            const cells = Array.from({ length: service.count }, (_unused, pos) => {
              const name = arr[pos]?.name
              return name ? tu(name) : t.offenWort
            })
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
  mitAux,
  me,
  tpw,
}: {
  item: PartItem
  title?: string // überschriebener Titel (Lied bereits herausgezogen)
  mitAux: boolean // Zusammenkunft mit Zusätzlicher Klasse
  /** Die eigene Person — für den DU-Chip. Entschieden wird über `gehoertZu`. */
  me: Person | undefined
  tpw: (s: string) => string
}) {
  const { t, tu } = useT()
  const zweiRaeume = mitAux && item.aux != null
  return (
    <div className={item.num != null ? 'prog-row prog-row--num' : 'prog-row'}>
      {item.num != null && <div className="prog-num">{item.num}.</div>}
      <div className="prog-row-text">
        <div className="prog-title">{title ?? tpw(item.title)}</div>
        {item.meta && <div className="prog-item-meta">{tpw(item.meta)}</div>}
      </div>
      <div className="prog-names">
        {/*
          Bei einer Zusätzlichen Klasse stehen beide Räume untereinander, jeder
          mit seiner Überschrift. Ohne Klasse bleibt es die schlichte
          Namensliste von vorher.
        */}
        {(zweiRaeume ? [false, true] : [false]).map((aux) => (
          <Fragment key={aux ? 'aux' : 'haupt'}>
            {zweiRaeume && <div className="prog-raum">{aux ? t.auxKlasse : t.auxHauptsaal}</div>}
            {(aux ? item.aux ?? [] : item.names).map((slot, index) => (
              <div key={index} className="prog-name-block">
                <div className="prog-name">
                  {/* „Id vor Name", wie überall: `gehoertZu` ist die eine
                      Stelle, an der entschieden wird, wem eine Zuteilung
                      gehört. Der bloße Namensvergleich gab den DU-Chip an
                      beide Namensgleichen — und an einen Verkündiger, der
                      zufällig heißt wie der Gastredner. */}
                  {me && gehoertZu(slot, me) && <span className="chip-du">DU</span>}
                  <span>{slot.name || t.offenDash}</span>
                </div>
                {slot.rolle && <div className="prog-role">{tu(slot.rolle)}</div>}
              </div>
            ))}
          </Fragment>
        ))}
      </div>
    </div>
  )
}
