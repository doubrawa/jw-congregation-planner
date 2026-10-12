import { Fragment, useId, type ReactNode } from 'react'
import { useApp } from '../app/context'
import { hatAuxKlasse } from '../data/aux-class'
import { dauerAbtrennen, gehoertZu, istAusgefallen, istBlockSektion, isSong, MEETING_TABS, mtab, splitOpeningSong } from '../data/helpers'
import { deutschesDatum, meetingDate, meetingDateText, meetingTime } from '../data/meeting-dates'
import type { HelperSlot, Meeting, MeetingKey, MeetingTab, PartItem, Person, Section, Service, Week } from '../data/types'
import { fill, useT } from '../i18n/useT'
import { datumsFormat } from '../components/datum-anzeige'
import { AusfallBanner, MemorialBanner } from '../components/WeekBadges'
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
  week,
  rawWeek,
  tab,
  me,
  tpw,
  druck,
}: {
  meeting: Meeting
  rawMeeting: Meeting
  week: Week
  /** Unübersetzte Woche — der Termin wird aus den kanonischen Daten gerechnet. */
  rawWeek: Week
  tab: MeetingTab
  /** Die eigene Person — für „Du". Entschieden wird über `gehoertZu`. */
  me: Person | undefined
  tpw: Uebersetzer
  druck?: ReactNode
}) {
  const { state } = useApp()
  // Gerechneter Termin statt des rohen date-Felds: importierte Wochen tragen
  // dort nur die Wochenspanne („7.–13. September").
  const termin = [tpw(meetingDateText(rawWeek, mtab(tab), state.congregation.times)), tpw(meeting.end)]
    .filter(Boolean)
    .join(' · ')
  return (
    <>
      <MemorialBanner week={week} tab={tab} />
      {/* Fällt sie aus (T30), steht es hier mit dem Grund des Planers — die
          Karte des Tages darüber ist nur durchgestrichen. */}
      <AusfallBanner week={rawWeek} tab={mtab(tab)} />

      <div className="prog-meta-row">
        <p className="prog-meta">{termin}</p>
        {druck}
      </div>

      <Programm meeting={meeting} rawMeeting={rawMeeting} me={me} tpw={tpw} ebene="h2" />
      <Hilfsdienste helpers={meeting.helpers} me={me} />
      <ProgFooter ende={tpw(meeting.end)} />
    </>
  )
}

/**
 * **Am Desktop beide Zusammenkünfte nebeneinander** (T121, Entwurf
 * `GDesktopWoche`): je Tag eine Spalte mit Datum und Uhrzeit, darunter das
 * Programm. Die Hilfsdienste beider Tage stehen als **eine** Tabelle unter
 * dem kürzeren Wochenende — eine Zeile je Dienst, eine Spalte je Tag.
 *
 * Die Tabelle steht im Dokument hinter beiden Tagen, nicht im Sonntag: Sie
 * gehört zu beiden, und so liest sie auch ein Bildschirmleser. Das Gitter
 * (`programm.css`) setzt sie unter die zweite Spalte.
 */
export function BeideTage({
  week,
  rawWeek,
  me,
  tpw,
}: {
  week: Week
  rawWeek: Week
  me: Person | undefined
  tpw: Uebersetzer
}) {
  return (
    <>
      <div className="prog-tage">
        {MEETING_TABS.map((key) => (
          <Tag key={key} tab={key} week={week} rawWeek={rawWeek} me={me} tpw={tpw} />
        ))}
        <HilfsdiensteTabelle week={week} rawWeek={rawWeek} me={me} />
      </div>
      <ProgFooter />
    </>
  )
}

/** Ein Tag in der Spalte: Datum, Uhrzeit, was ihn besonders macht, sein Programm. */
function Tag({
  tab,
  week,
  rawWeek,
  me,
  tpw,
}: {
  tab: MeetingKey
  week: Week
  rawWeek: Week
  me: Person | undefined
  tpw: Uebersetzer
}) {
  const { state } = useApp()
  const zeiten = state.congregation.times
  const meeting = week[tab]
  const uhrzeit = [meetingTime(rawWeek, tab, zeiten), tpw(meeting.end)].filter(Boolean).join(' · ')
  const titelId = useId()
  return (
    <section className="prog-tag" aria-labelledby={titelId}>
      <div className="prog-tag-kopf">
        <h2 id={titelId} className="prog-tag-datum">
          {tpw(deutschesDatum(meetingDate(rawWeek, tab, zeiten)))}
        </h2>
        <span className="prog-meta">{uhrzeit}</span>
      </div>
      <MemorialBanner week={week} tab={tab} />
      <AusfallBanner week={rawWeek} tab={tab} />
      <Programm meeting={meeting} rawMeeting={rawWeek[tab]} me={me} tpw={tpw} ebene="h3" />
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
  ebene,
}: {
  meeting: Meeting
  rawMeeting: Meeting
  me: Person | undefined
  tpw: Uebersetzer
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
  ebene,
}: {
  section: Section
  rawSection: Section | undefined
  mitAux: boolean
  me: Person | undefined
  tpw: Uebersetzer
  ebene: Ebene
}) {
  const sammeltitel = rawSection ? istBlockSektion(rawSection) : false
  const lieder: string[] = []
  const zeilen: Array<{ item: PartItem; title?: string }> = []
  for (const item of section.items) {
    if (isSong(item)) {
      lieder.push(tpw(item.song))
      continue
    }
    const { song, rest } = sammeltitel ? splitOpeningSong(tpw(item.title)) : { song: null, rest: '' }
    if (song) lieder.push(song)
    zeilen.push(song ? { item, title: rest } : { item })
  }
  const Ueberschrift = ebene
  return (
    <section className="prog-abschnitt" data-farbe={section.farbe}>
      <div className="prog-abschnitt-kopf">
        <Ueberschrift className="prog-abschnitt-name">{tpw(section.label)}</Ueberschrift>
        {lieder.length > 0 && <span className="prog-lied">{lieder.join(' · ')}</span>}
      </div>
      {zeilen.map(({ item, title }) => (
        <ProgramRow key={item.iid} item={item} title={title} mitAux={mitAux} me={me} tpw={tpw} />
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
}) {
  const { t, tu } = useT()
  const zweiRaeume = mitAux && item.aux != null
  // Getrennt vor dem Übersetzen: Der Übersetzer zerlegt die Zeile an
  // denselben Stellen, jeder Teil kommt also übersetzt heraus wie vorher.
  const { dauer, rest } = dauerAbtrennen(item.meta ?? '', item.mins)
  return (
    <div className="prog-row">
      <div className="prog-row-text">
        <div className="prog-title">
          {item.num != null && <span className="prog-num">{item.num} </span>}
          {title ?? tpw(item.title)}
        </div>
        {rest && <div className="prog-item-meta">{tpw(rest)}</div>}
      </div>
      {dauer && <span className="prog-dauer">{tpw(dauer)}</span>}
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

/**
 * Die Plätze eines Dienstes, Platz für Platz — genau so weit, wie
 * `service.count` reicht; ein freier Platz ist `undefined`.
 *
 * Die gleiche Grenze, nach der `countOpenSlots`, `deriveMyTasks` und
 * `helperWorkload` rechnen. Reduziert der Planer die Platzzahl, bleiben die
 * Namen dahinter in den Wochendaten stehen; das Programmblatt nannte dann
 * jemanden, den die Aufgabenliste, die Auslastung und der Planen-Screen längst
 * nicht mehr kennen.
 */
function plaetzeVon(helpers: Meeting['helpers'], service: Service): Array<HelperSlot | undefined> {
  return Array.from({ length: service.count }, (_unused, pos) => helpers[service.key]?.[pos])
}

/** Die Hilfsdienste einer Zusammenkunft: je Dienst eine Zeile. */
function Hilfsdienste({ helpers, me }: { helpers: Meeting['helpers']; me: Person | undefined }) {
  const { state } = useApp()
  const { t, tu } = useT()
  return (
    <section className="prog-abschnitt prog-helpers" data-farbe="neutral2">
      <div className="prog-abschnitt-kopf">
        <h2 className="prog-abschnitt-name">{t.hilfsdienste}</h2>
      </div>
      {state.services.map((service) => (
        <div key={service.key} className="prog-dienst">
          <span className="prog-dienst-name">{tu(service.name)}</span>
          <DienstWer plaetze={plaetzeVon(helpers, service)} me={me} />
        </div>
      ))}
    </section>
  )
}

/**
 * Die Hilfsdienste beider Tage als Tabelle (Desktop): eine Zeile je Dienst,
 * eine Spalte je Tag. Der Kopf nennt den Tag; fällt die Zusammenkunft aus,
 * steht er durchgestrichen da, wie auf der Karte des Tages.
 */
function HilfsdiensteTabelle({ week, rawWeek, me }: { week: Week; rawWeek: Week; me: Person | undefined }) {
  const { state } = useApp()
  const { t, tu } = useT()
  const titelId = useId()
  const tagName = datumsFormat(state.lang, 'wochentag')
  const tagZahl = datumsFormat(state.lang, 'tagZahl')
  return (
    <section className="prog-abschnitt prog-helpers" data-farbe="neutral2">
      <div className="prog-abschnitt-kopf">
        <h2 id={titelId} className="prog-abschnitt-name">
          {t.hilfsdienste}
        </h2>
      </div>
      <table className="prog-dienste" aria-labelledby={titelId}>
        <thead>
          <tr>
            <td />
            {MEETING_TABS.map((key) => {
              const datum = meetingDate(rawWeek, key, state.congregation.times)
              const tag = `${tagName.format(datum)} ${tagZahl.format(datum)}`
              return (
                <th key={key} scope="col">
                  {istAusgefallen(rawWeek, key) ? <s>{tag}</s> : tag}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {state.services.map((service) => (
            <tr key={service.key}>
              <th scope="row" className="prog-dienst-name">
                {tu(service.name)}
              </th>
              {MEETING_TABS.map((key) => (
                <td key={key}>
                  <DienstWer plaetze={plaetzeVon(week[key].helpers, service)} me={me} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

/** Wer einen Dienst hat: „Du" vorn, wenn man selbst dabei ist, dann die übrigen Namen, „offen" für jeden freien Platz. */
function DienstWer({ plaetze, me }: { plaetze: Array<HelperSlot | undefined>; me: Person | undefined }) {
  const { t, tu } = useT()
  const meiner = (slot: HelperSlot | undefined): boolean => Boolean(me && slot?.name && gehoertZu(slot, me))
  const du = plaetze.some(meiner)
  const namen = plaetze
    .filter((slot): slot is HelperSlot => Boolean(slot?.name) && !meiner(slot))
    .map((slot) => tu(slot.name))
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
      <span>{fill(t.stand, { datum: datumsFormat(state.lang, 'tagMonat').format(new Date()) })}</span>
    </div>
  )
}
