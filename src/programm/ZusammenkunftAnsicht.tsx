import { Fragment, useId, type ReactNode } from 'react'
import { useApp } from '../app/context'
import { hatAuxKlasse } from '../data/aux-class'
import { dauerAbtrennen, gehoertZu, MEETING_TABS, mtab } from '../data/helpers'
import { deutschesDatum, meetingDate, meetingTime } from '../data/meeting-dates'
import type { HelperSlot, Meeting, MeetingKey, MeetingTab, PartItem, Person, Section, Service, Week } from '../data/types'
import { abschnittZeilen, plaetzeVon } from './programm-zeilen'
import { fill, platzName, programmTermin, useT } from '../i18n/useT'
import { zahlBinden } from '../i18n/zahl-binden'
import { gebundenesDatum } from '../components/datum-anzeige'
import { AusfallBanner } from '../components/WeekBadges'
import { PersonZeile } from './PersonZeile'

type Uebersetzer = (s: string) => string

/** Die Überschrift eines Abschnitts: unter dem Titel der Seite `h2`, unter der eines Tages `h3`. */
type Ebene = 'h2' | 'h3'

/**
 * **Eine Zusammenkunft ansehen** (T121, Entwurf `GAnsehenWoche`): der Termin,
 * je Abschnitt eine Karte — Farbbalken, Name, das Lied rechts —, darin die
 * Punkte mit ihren Personen; die eigene steht als „Du" da. Darunter die
 * Hilfsdienste.
 *
 * `druck` ist der Druckknopf, falls er neben dem Termin stehen soll — am
 * Handy. Ab dem Tablet steht er neben der Wochenwahl, und hier bleibt der
 * Termin allein.
 */
export function ZusammenkunftAnsicht({
  meeting,
  rawMeeting,
  rawWeek,
  tab,
  me,
  tpw,
  sprache,
  druck,
}: {
  meeting: Meeting
  rawMeeting: Meeting
  /** Unübersetzte Woche — der Termin wird aus den kanonischen Daten gerechnet. */
  rawWeek: Week
  tab: MeetingTab
  /** Die eigene Person — für „Du". Entschieden wird über `gehoertZu`. */
  me: Person | undefined
  tpw: Uebersetzer
  /** In welcher Sprache `tpw` schreibt (`ProgWeek.sprache`) — `lang` der Programmtexte. */
  sprache: string
  druck?: ReactNode
}) {
  const { state } = useApp()
  // Gerechneter Termin statt des rohen date-Felds: importierte Wochen tragen
  // dort nur die Wochenspanne („7.–13. September").
  const termin = programmTermin(tpw, rawWeek, mtab(tab), state.congregation.times, meeting.end)
  return (
    <>
      {/* Fällt sie aus (T30), steht es hier mit dem Grund des Planers — die
          Karte des Tages darüber ist nur durchgestrichen. */}
      <AusfallBanner week={rawWeek} tab={mtab(tab)} />

      <div className="prog-meta-row">
        <p className="prog-meta" lang={sprache}>
          {termin}
        </p>
        {druck}
      </div>

      <Programm meeting={meeting} rawMeeting={rawMeeting} me={me} tpw={tpw} sprache={sprache} ebene="h2" />
      <Hilfsdienste helpers={meeting.helpers} me={me} ebene="h2" />
      <ProgFooter ende={tpw(meeting.end)} />
    </>
  )
}

/**
 * **Am Desktop beide Zusammenkünfte nebeneinander** (T121, Entwurf
 * `GDesktopWoche`): je Tag eine Spalte mit Datum und Uhrzeit, darunter das
 * Programm und die Hilfsdienste **dieses** Tages — wie am Handy.
 *
 * Bis zum 21.10.2026 standen die Hilfsdienste beider Tage als eine Tabelle
 * unter dem kürzeren Wochenende, eine Spalte je Tag. Wer den Sonntag ansah,
 * las dort auch die Dienste unter der Woche (Betreiber: „das sollte nicht
 * zusammen stehen").
 */
export function BeideTage({
  week,
  rawWeek,
  me,
  tpw,
  sprache,
}: {
  week: Week
  rawWeek: Week
  me: Person | undefined
  tpw: Uebersetzer
  sprache: string
}) {
  return (
    <>
      <div className="prog-tage">
        {MEETING_TABS.map((key) => (
          <Tag key={key} tab={key} week={week} rawWeek={rawWeek} me={me} tpw={tpw} sprache={sprache} />
        ))}
      </div>
      <ProgFooter />
    </>
  )
}

/** Ein Tag in der Spalte: Datum, Uhrzeit, was ihn besonders macht, sein Programm und seine Hilfsdienste. */
function Tag({
  tab,
  week,
  rawWeek,
  me,
  tpw,
  sprache,
}: {
  tab: MeetingKey
  week: Week
  rawWeek: Week
  me: Person | undefined
  tpw: Uebersetzer
  sprache: string
}) {
  const { state } = useApp()
  const zeiten = state.congregation.times
  const meeting = week[tab]
  const uhrzeit = [meetingTime(rawWeek, tab, zeiten), tpw(meeting.end)].filter(Boolean).join(' · ')
  const titelId = useId()
  return (
    <section className="prog-tag" aria-labelledby={titelId}>
      <div className="prog-tag-kopf">
        <h2 id={titelId} className="prog-tag-datum" lang={sprache}>
          {zahlBinden(tpw(deutschesDatum(meetingDate(rawWeek, tab, zeiten))))}
        </h2>
        <span className="prog-meta" lang={sprache}>
          {uhrzeit}
        </span>
      </div>
      <AusfallBanner week={rawWeek} tab={tab} />
      <Programm meeting={meeting} rawMeeting={rawWeek[tab]} me={me} tpw={tpw} sprache={sprache} ebene="h3" />
      <Hilfsdienste helpers={meeting.helpers} me={me} ebene="h3" />
    </section>
  )
}

/**
 * Das Programm einer Zusammenkunft: je Abschnitt eine Karte, dahinter der
 * Ratgeber der Zusätzlichen Klasse.
 */
function Programm({
  meeting,
  rawMeeting,
  me,
  tpw,
  sprache,
  ebene,
}: {
  meeting: Meeting
  rawMeeting: Meeting
  me: Person | undefined
  tpw: Uebersetzer
  sprache: string
  ebene: Ebene
}) {
  const { t } = useT()
  // Ob es eine Zusätzliche Klasse gibt, steht in den Wochendaten — nicht am
  // Schalter und erst recht nicht am bloßen Vorhandensein von `item.aux`:
  // dessen Namen bleiben beim Ausschalten stehen, und das Programm zeigte
  // danach weiter beide Räume.
  const mitAux = hatAuxKlasse(rawMeeting)
  const Ueberschrift = ebene
  return (
    <>
      {meeting.sections.map((section, si) => (
        <Abschnitt
          key={section.label}
          section={section}
          rawSection={rawMeeting.sections[si]}
          mitAux={mitAux}
          me={me}
          tpw={tpw}
          sprache={sprache}
          ebene={ebene}
        />
      ))}

      {/* Ratgeber der Zusätzlichen Klasse — gehört zur ganzen Klasse, nicht
          zu einem Punkt, deshalb eine eigene Karte hinter dem Programm. */}
      {mitAux && rawMeeting.auxRatgeber && (
        <section className="prog-abschnitt" data-farbe="neutral2">
          <div className="prog-abschnitt-kopf">
            <Ueberschrift className="prog-abschnitt-name">{t.auxKlassen}</Ueberschrift>
          </div>
          {/* Der Titel steht hier schon in der Sprache des Lesers (`t.…`) und
              geht deshalb als fertiger Text hinein, nicht durch `tpw`:
              „Ratgeber" ist ein Programm-Fragment, das der Übersetzer sonst ein
              zweites Mal anfasst. Kein echter Programmpunkt, sondern eine Zeile
              für den Ratgeber — deshalb ohne Kennung. */}
          <ProgramRow
            item={{ title: t.auxRatgeber, names: [rawMeeting.auxRatgeber] }}
            title={t.auxRatgeber}
            mitAux={false}
            me={me}
            tpw={tpw}
          />
        </section>
      )}
    </>
  )
}

/**
 * Ein Abschnitt als Karte. Die Lieder stehen rechts im Kopf: eigene
 * Liedzeilen ebenso wie das Lied aus dem Sammeltitel von Eröffnung und
 * Abschluss („Lied 1 · Gebet · Einleitende Worte").
 *
 * Gefragt wird die **Art** des Abschnitts, nicht sein Name: `section` ist die
 * angezeigte (womöglich übersetzte) Fassung, `rawSection` die kanonische. Der
 * Name griff bisher nur, weil Eröffnung und Abschluss die einzigen
 * Überschriften sind, die der Import nicht aus der Zielsprache übernimmt — eine
 * stille Verabredung mit `parse.ts`.
 */
function Abschnitt({
  section,
  rawSection,
  mitAux,
  me,
  tpw,
  sprache,
  ebene,
}: {
  section: Section
  rawSection: Section | undefined
  mitAux: boolean
  me: Person | undefined
  tpw: Uebersetzer
  sprache: string
  ebene: Ebene
}) {
  const { lieder, zeilen } = abschnittZeilen(section, rawSection, tpw)
  const Ueberschrift = ebene
  return (
    <section className="prog-abschnitt" data-farbe={section.farbe}>
      <div className="prog-abschnitt-kopf">
        <Ueberschrift className="prog-abschnitt-name" lang={sprache}>
          {tpw(section.label)}
        </Ueberschrift>
        {lieder.length > 0 && <span className="prog-lied">{lieder.join(' · ')}</span>}
      </div>
      {zeilen.map(({ item, title }) => (
        <ProgramRow key={item.iid} item={item} title={title} mitAux={mitAux} me={me} tpw={tpw} sprache={sprache} />
      ))}
    </section>
  )
}

/**
 * Ein Punkt: Titel und Zusatz, die Dauer daneben, die Personen — am Handy
 * darunter, ab dem Tablet in einer eigenen Spalte.
 */
function ProgramRow({
  item,
  title,
  mitAux,
  me,
  tpw,
  sprache,
}: {
  /**
   * Der Programmpunkt — **ohne seine Kennung**, denn diese Zeile liest sie
   * nicht. Ein echter `PartItem` passt unverändert hinein; zusätzlich kann so
   * die Ratgeber-Zeile hier durch, die gar kein Programmpunkt ist. Sie mit
   * einer erfundenen Kennung auszustatten hieße, die Zusicherung „jede `iid`
   * ist die echte Kennung eines Punkts" an einer Stelle zu brechen, an der es
   * niemandem auffällt.
   */
  item: Omit<PartItem, 'iid'>
  title?: string // überschriebener Titel (Lied bereits herausgezogen)
  mitAux: boolean // Zusammenkunft mit Zusätzlicher Klasse
  me: Person | undefined
  tpw: Uebersetzer
  /** `lang` von Titel, Zusatz und Dauer — fehlt bei der Ratgeber-Zeile, die in der Sprache des Lesers steht. */
  sprache?: string
}) {
  const { t, tu } = useT()
  const zweiRaeume = mitAux && item.aux != null
  // Getrennt vor dem Übersetzen: Der Übersetzer zerlegt die Zeile an
  // denselben Stellen, jeder Teil kommt also übersetzt heraus wie vorher.
  const { dauer, rest } = dauerAbtrennen(item.meta ?? '', item.mins)
  return (
    <div className="prog-row">
      <div className="prog-row-text" lang={sprache}>
        <div className="prog-title">
          {item.num != null && <span className="prog-num">{item.num} </span>}
          {title ?? tpw(item.title)}
        </div>
        {rest && <div className="prog-item-meta">{tpw(rest)}</div>}
      </div>
      {dauer && (
        <span className="prog-dauer" lang={sprache}>
          {tpw(dauer)}
        </span>
      )}
      <div className="prog-names">
        {/* Bei einer Zusätzlichen Klasse stehen beide Räume untereinander, jeder
            mit seiner Überschrift. Ohne Klasse bleibt es die schlichte Liste. */}
        {(zweiRaeume ? [false, true] : [false]).map((aux) => (
          <Fragment key={aux ? 'aux' : 'haupt'}>
            {zweiRaeume && <div className="prog-raum">{aux ? t.auxKlasse : t.auxHauptsaal}</div>}
            {(aux ? (item.aux ?? []) : item.names).map((slot, index) => (
              <PersonZeile
                key={index}
                name={slot.name}
                rolle={slot.rolle && tu(slot.rolle)}
                du={me != null && gehoertZu(slot, me)}
              />
            ))}
          </Fragment>
        ))}
      </div>
    </div>
  )
}

/** Die Hilfsdienste einer Zusammenkunft: je Dienst eine Zeile. */
function Hilfsdienste({ helpers, me, ebene }: { helpers: Meeting['helpers']; me: Person | undefined; ebene: Ebene }) {
  const { state } = useApp()
  const { t, tu } = useT()
  const Ueberschrift = ebene
  return (
    <section className="prog-abschnitt prog-helpers" data-farbe="neutral2">
      <div className="prog-abschnitt-kopf">
        <Ueberschrift className="prog-abschnitt-name">{t.hilfsdienste}</Ueberschrift>
      </div>
      {state.services.map((service) => (
        <div key={service.key} className="prog-dienst">
          <span className="prog-dienst-name">{tu(service.name)}</span>
          <DienstWer helpers={helpers} service={service} me={me} />
        </div>
      ))}
    </section>
  )
}

/** Wer einen Dienst hat: „Du" vorn, wenn man selbst dabei ist, dann die übrigen Namen, „offen" für jeden freien Platz. */
function DienstWer({ helpers, service, me }: { helpers: Meeting['helpers']; service: Service; me: Person | undefined }) {
  const i18n = useT()
  const { t } = i18n
  const plaetze = plaetzeVon(helpers, service)
  const meiner = (slot: HelperSlot | undefined): boolean => Boolean(me && slot?.name && gehoertZu(slot, me))
  const du = plaetze.some(meiner)
  const namen = plaetze
    .filter((slot): slot is HelperSlot => Boolean(slot?.name) && !meiner(slot))
    .map((slot) => platzName(slot.name, Boolean(service.groups), i18n))
  const offen = plaetze.some((slot) => !slot?.name)
  return (
    <span className="prog-dienst-wer">
      {du && <span className="prog-du-pille">{t.chipDu}</span>}
      {namen.length > 0 && <span className="prog-dienst-namen">{namen.join(', ')}</span>}
      {offen && <span className="prog-dienst-offen">{t.offenWort}</span>}
    </span>
  )
}

/** Nur im Ausdruck: das Ende der Zusammenkunft und der „Stand" — der Tag, an dem das Blatt entsteht. */
function ProgFooter({ ende }: { ende?: string }) {
  const { state } = useApp()
  const { t } = useT()
  return (
    <div className="prog-footer">
      {ende && <span>{ende}</span>}
      <span>{fill(t.stand, { datum: gebundenesDatum(new Date(), state.lang, 'tagMonat') })}</span>
    </div>
  )
}
