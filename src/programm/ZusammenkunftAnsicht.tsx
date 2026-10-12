import { Fragment } from 'react'
import { useApp } from '../app/context'
import { hatAuxKlasse } from '../data/aux-class'
import { gehoertZu, istBlockSektion, isSong, mtab, splitOpeningSong } from '../data/helpers'
import { meetingDateText } from '../data/meeting-dates'
import type { HelperSlot, Meeting, MeetingTab, PartItem, Person, Section, Week } from '../data/types'
import { fill, useT } from '../i18n/useT'
import { datumsFormat } from '../components/datum-anzeige'
import { AusfallBanner, MemorialBanner } from '../components/WeekBadges'
import { DruckWahl } from './DruckWahl'

/**
 * **Eine Zusammenkunft ansehen** (T121, Entwurf `GAnsehenWoche`): Termin und
 * Drucken, je Abschnitt eine Karte — Farbbalken, Name, das Lied rechts —,
 * darin die Punkte mit ihren Personen; die eigene steht als „Du" da.
 * Darunter die Hilfsdienste.
 */
export function ZusammenkunftAnsicht({
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
  /** Die eigene Person — für „Du". Entschieden wird über `gehoertZu`. */
  me: Person | undefined
  tpw: (s: string) => string
}) {
  const { state } = useApp()
  const { t } = useT()
  // Ob es eine Zusätzliche Klasse gibt, steht in den Wochendaten — nicht am
  // Schalter und erst recht nicht am bloßen Vorhandensein von `item.aux`:
  // dessen Namen bleiben beim Ausschalten stehen, und das Programm zeigte
  // danach weiter beide Räume.
  const mitAux = hatAuxKlasse(rawMeeting)
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
        <DruckWahl zeitraum={tpw(week.range)} erklaerung={t.druckZusammenkuenfte} />
      </div>

      {meeting.sections.map((section, si) => (
        <Abschnitt
          key={section.label}
          section={section}
          rawSection={rawMeeting.sections[si]}
          mitAux={mitAux}
          me={me}
          tpw={tpw}
        />
      ))}

      {/* Ratgeber der Zusätzlichen Klasse — gehört zur ganzen Klasse, nicht
          zu einem Punkt, deshalb eine eigene Karte hinter dem Programm. */}
      {mitAux && rawMeeting.auxRatgeber && (
        <section className="prog-abschnitt" data-farbe="neutral2">
          <div className="prog-abschnitt-kopf">
            <h2 className="prog-abschnitt-name">{t.auxKlassen}</h2>
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

      <Hilfsdienste helpers={meeting.helpers} me={me} />

      {/* Nur im Ausdruck: „Stand" ist der Tag, an dem das Blatt entsteht. */}
      <div className="prog-footer">
        <span>{tpw(meeting.end)}</span>
        <span>{fill(t.stand, { datum: datumsFormat(state.lang, 'tagMonat').format(new Date()) })}</span>
      </div>
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
}: {
  section: Section
  rawSection: Section | undefined
  mitAux: boolean
  me: Person | undefined
  tpw: (s: string) => string
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
  return (
    <section className="prog-abschnitt" data-farbe={section.farbe}>
      <div className="prog-abschnitt-kopf">
        <h2 className="prog-abschnitt-name">{tpw(section.label)}</h2>
        {lieder.length > 0 && <span className="prog-lied">{lieder.join(' · ')}</span>}
      </div>
      {zeilen.map(({ item, title }) => (
        <ProgramRow key={item.iid} item={item} title={title} mitAux={mitAux} me={me} tpw={tpw} />
      ))}
    </section>
  )
}

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
  tpw: (s: string) => string
}) {
  const { t } = useT()
  const zweiRaeume = mitAux && item.aux != null
  return (
    <div className="prog-row">
      <div className="prog-row-text">
        <div className="prog-title">
          {item.num != null && <span className="prog-num">{item.num} </span>}
          {title ?? tpw(item.title)}
        </div>
        {item.meta && <div className="prog-item-meta">{tpw(item.meta)}</div>}
      </div>
      <div className="prog-names">
        {/* Bei einer Zusätzlichen Klasse stehen beide Räume untereinander, jeder
            mit seiner Überschrift. Ohne Klasse bleibt es die schlichte Liste. */}
        {(zweiRaeume ? [false, true] : [false]).map((aux) => (
          <Fragment key={aux ? 'aux' : 'haupt'}>
            {zweiRaeume && <div className="prog-raum">{aux ? t.auxKlasse : t.auxHauptsaal}</div>}
            {(aux ? (item.aux ?? []) : item.names).map((slot, index) => (
              <ProgramPerson key={index} slot={slot} me={me} />
            ))}
          </Fragment>
        ))}
      </div>
    </div>
  )
}

/**
 * Eine Person an einem Punkt: Punkt, Name, Rolle. Die eigene steht als „Du"
 * da, mit dem Punkt in Minze — „Id vor Name", wie überall: `gehoertZu` ist die
 * eine Stelle, an der entschieden wird, wem eine Zuteilung gehört.
 *
 * Gedruckt wird der Name, nicht „Du": Der Aushang gilt allen (`nur-druck`).
 */
function ProgramPerson({ slot, me }: { slot: PartItem['names'][number]; me: Person | undefined }) {
  const { t, tu } = useT()
  const du = me != null && gehoertZu(slot, me)
  const klasse = du ? 'prog-person is-du' : slot.name ? 'prog-person' : 'prog-person is-offen'
  return (
    <div className={klasse}>
      <span className="prog-person-punkt" aria-hidden="true" />
      {du && <span className="prog-du">{t.chipDu}</span>}
      <span className={du ? 'prog-name nur-druck' : 'prog-name'}>{slot.name || t.offenDash}</span>
      {slot.rolle && <span className="prog-role">{tu(slot.rolle)}</span>}
    </div>
  )
}

/**
 * Die Hilfsdienste der Zusammenkunft: je Dienst eine Zeile — „Du" vorn, wenn
 * man selbst dabei ist, dann die übrigen Namen, „offen" für jeden freien Platz.
 *
 * Platz für Platz, genau so weit wie `service.count` reicht — die gleiche
 * Grenze, nach der `countOpenSlots`, `deriveMyTasks` und `helperWorkload`
 * rechnen. Reduziert der Planer die Platzzahl, bleiben die Namen dahinter in
 * den Wochendaten stehen; das Programmblatt nannte dann jemanden, den die
 * Aufgabenliste, die Auslastung und der Planen-Screen längst nicht mehr kennen.
 */
function Hilfsdienste({ helpers, me }: { helpers: Record<string, HelperSlot[]>; me: Person | undefined }) {
  const { state } = useApp()
  const { t, tu } = useT()
  return (
    <section className="prog-abschnitt prog-helpers" data-farbe="neutral2">
      <div className="prog-abschnitt-kopf">
        <h2 className="prog-abschnitt-name">{t.hilfsdienste}</h2>
      </div>
      {state.services.map((service) => {
        const plaetze = Array.from({ length: service.count }, (_unused, pos) => helpers[service.key]?.[pos])
        const du = me != null && plaetze.some((slot) => slot?.name && gehoertZu(slot, me))
        const namen = plaetze
          .filter((slot): slot is HelperSlot => Boolean(slot?.name) && !(me != null && gehoertZu(slot, me)))
          .map((slot) => tu(slot.name))
        const offen = plaetze.some((slot) => !slot?.name)
        return (
          <div key={service.key} className="prog-dienst">
            <span className="prog-dienst-name">{tu(service.name)}</span>
            <span className="prog-dienst-wer">
              {du && <span className="prog-du-pille">{t.chipDu}</span>}
              {namen.length > 0 && <span className="prog-dienst-namen">{namen.join(', ')}</span>}
              {offen && <span className="prog-dienst-offen">{t.offenWort}</span>}
            </span>
          </div>
        )
      })}
    </section>
  )
}
