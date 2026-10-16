import { Fragment, type ReactNode } from 'react'
import { useApp } from '../app/context'
import { hatAuxKlasse } from '../data/aux-class'
import { abweichungsGrund, dauerAbtrennen, istAusgefallen, istBlockSektion, MEETING_TABS } from '../data/helpers'
import { deutschesDatum, meetingDate, meetingTime } from '../data/meeting-dates'
import type { MeetingKey, SlotAssignment, Week } from '../data/types'
import { zusammenkunftName } from '../components/anlass-name'
import { wochentagMitZahl } from '../components/datum-anzeige'
import { fill, platzName, useT } from '../i18n/useT'
import { abschnittZeilen, plaetzeVon } from '../programm/programm-zeilen'
import { Balken, Offen } from './DruckBlatt'

type Uebersetzer = (s: string) => string

/** Was ein Tag zum Drucken braucht: die angezeigte Woche, die kanonische und ihr Übersetzer. */
export interface DruckTag {
  tab: MeetingKey
  week: Week
  rawWeek: Week
  tpw: Uebersetzer
}

/**
 * **Ein Tag, ausführlich** (Wochenbogen, Entwurf `GDruckWoche`): Datum,
 * Uhrzeit, je Abschnitt die Überschrift mit dem Lied und je Punkt Titel,
 * Dauer, Zusatz und darunter die Personen mit ihrer Rolle. Ein freier Platz
 * steht gepunktet da.
 *
 * Dieselben Zeilen wie am Bildschirm (`abschnittZeilen`), nur als Papier:
 * ohne „Du", ohne Bedienelemente — der Aushang gilt allen.
 */
export function TagVoll({ tab, week, rawWeek, tpw }: DruckTag) {
  const { state } = useApp()
  const { t, tu } = useT()
  const meeting = week[tab]
  const rawMeeting = rawWeek[tab]
  const zeiten = state.congregation.times
  const uhrzeit = [meetingTime(rawWeek, tab, zeiten), tpw(meeting.end)].filter(Boolean).join(' · ')
  const mitAux = hatAuxKlasse(rawMeeting)
  const ausgefallen = istAusgefallen(rawWeek, tab)
  return (
    <section className="druck-spalte">
      <div className="druck-tag-kopf">
        <h2 className="druck-tag-datum">
          <TagDatum ausgefallen={ausgefallen}>{tpw(deutschesDatum(meetingDate(rawWeek, tab, zeiten)))}</TagDatum>
        </h2>
        <span className="druck-tag-zeit">{uhrzeit}</span>
      </div>
      {ausgefallen ? (
        <p className="druck-ausfall">{abweichungsGrund(rawWeek, tab) || zusammenkunftName(tab, t)}</p>
      ) : (
        <>
          {meeting.sections.map((section, si) => {
            const { lieder, zeilen } = abschnittZeilen(section, rawMeeting.sections[si], tpw)
            return (
              <div key={section.label} data-farbe={section.farbe}>
                <AbschnittKopf name={tpw(section.label)} lieder={lieder} />
                {zeilen.map(({ item, title }) => {
                  const { dauer, rest } = dauerAbtrennen(item.meta ?? '', item.mins)
                  const zweiRaeume = mitAux && item.aux != null
                  return (
                    <div key={item.iid} className="druck-punkt">
                      <span className="druck-punkt-nr">{item.num ?? ''}</span>
                      <span className="druck-punkt-text">
                        <span className="druck-punkt-kopf">
                          <span className="druck-punkt-titel">{title ?? tpw(item.title)}</span>
                          {dauer && <span className="druck-punkt-min">{tpw(dauer)}</span>}
                        </span>
                        {rest && <span className="druck-punkt-sub">{tpw(rest)}</span>}
                        {zweiRaeume ? (
                          <>
                            <span className="druck-raum">{t.auxHauptsaal}</span>
                            <Personen slots={item.names} tu={tu} />
                            <span className="druck-raum">{t.auxKlasse}</span>
                            <Personen slots={item.aux ?? []} tu={tu} />
                          </>
                        ) : (
                          <Personen slots={item.names} tu={tu} />
                        )}
                      </span>
                    </div>
                  )
                })}
              </div>
            )
          })}
          {mitAux && rawMeeting.auxRatgeber && (
            <div data-farbe="neutral2">
              <AbschnittKopf name={t.auxKlassen} lieder={[]} />
              <div className="druck-punkt">
                <span className="druck-punkt-nr" />
                <span className="druck-punkt-text">
                  <span className="druck-punkt-titel">{t.auxRatgeber}</span>
                  <Personen slots={[rawMeeting.auxRatgeber]} tu={tu} />
                </span>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  )
}

/**
 * **Ein Tag, knapp** (Monatsbogen, Entwurf `GDruckMonat`): je Programmpunkt
 * eine Zeile — Nummer, Punkt, die Namen rechts. Eröffnung und Abschluss
 * tragen ihre Personen je mit der Rolle als Zeile („Vorsitz", „Gebet"), ihr
 * Lied steht wie überall rechts im Kopf des Abschnitts.
 */
export function TagKnapp({ tab, week, rawWeek, tpw }: DruckTag) {
  const { state } = useApp()
  const { t, tu } = useT()
  const meeting = week[tab]
  const rawMeeting = rawWeek[tab]
  const zeiten = state.congregation.times
  const datum = meetingDate(rawWeek, tab, zeiten)
  const tag = wochentagMitZahl(datum, state.lang)
  const ausgefallen = istAusgefallen(rawWeek, tab)
  const mitAux = hatAuxKlasse(rawMeeting)
  return (
    <div className="druck-knapp-tag">
      <span className="druck-knapp-tag-titel">
        <TagDatum ausgefallen={ausgefallen}>{[tag, meetingTime(rawWeek, tab, zeiten)].filter(Boolean).join(' · ')}</TagDatum>
      </span>
      {ausgefallen ? (
        <p className="druck-ausfall">{abweichungsGrund(rawWeek, tab) || zusammenkunftName(tab, t)}</p>
      ) : (
        meeting.sections.map((section, si) => {
          const rawSection = rawMeeting.sections[si]
          const { lieder, zeilen } = abschnittZeilen(section, rawSection, tpw)
          const sammeltitel = rawSection ? istBlockSektion(rawSection) : false
          return (
            <Fragment key={section.label}>
              <div className="druck-knapp-abschnitt" data-farbe={section.farbe}>
                <span className="druck-abschnitt-name">
                  <Balken />
                  {tpw(section.label)}
                </span>
                {lieder.length > 0 && <span className="druck-lied">{lieder.join(' · ')}</span>}
              </div>
              {zeilen.map(({ item, title }) =>
                sammeltitel ? (
                  // Eröffnung und Abschluss: eine Zeile je Person, die Rolle als Punkt.
                  item.names.map((slot, i) => (
                    <KnappZeile key={`${item.iid}|${i}`} nr="" punkt={slot.rolle ? tu(slot.rolle) : (title ?? tpw(item.title))}>
                      {slot.name || <Offen breite={84} />}
                    </KnappZeile>
                  ))
                ) : (
                  <Fragment key={item.iid}>
                    <KnappZeile nr={item.num ?? ''} punkt={title ?? tpw(item.title)}>
                      <NamenKnapp slots={item.names} />
                    </KnappZeile>
                    {mitAux && item.aux != null && (
                      <KnappZeile nr="" punkt={t.auxKlasse}>
                        <NamenKnapp slots={item.aux} />
                      </KnappZeile>
                    )}
                  </Fragment>
                ),
              )}
            </Fragment>
          )
        })
      )}
      {/* Der Ratgeber der Klasse — wie im Wochenbogen am Ende des Tages, hier
          als eine Zeile. Bis zum 16.10.2026 fehlte er im Monatsbogen, obwohl
          die Plätze der Klasse darin standen. */}
      {!ausgefallen && mitAux && rawMeeting.auxRatgeber && (
        <KnappZeile nr="" punkt={`${t.auxKlasse} · ${t.auxRatgeber}`}>
          <NamenKnapp slots={[rawMeeting.auxRatgeber]} />
        </KnappZeile>
      )}
    </div>
  )
}

/**
 * **Die Hilfsdienste beider Tage** als Tabelle: eine Zeile je Dienst, eine
 * Spalte je Tag. Ein freier Platz steht gepunktet da; fällt ein Tag aus, ist
 * sein Kopf durchgestrichen — wie am Bildschirm (`HilfsdiensteTabelle`).
 */
export function HilfsdiensteDruck({ week, rawWeek, knapp = false }: { week: Week; rawWeek: Week; knapp?: boolean }) {
  const { state } = useApp()
  const i18n = useT()
  const { t, tu } = i18n
  return (
    <section className={knapp ? 'druck-hilfsdienste druck-hilfsdienste--knapp' : 'druck-hilfsdienste'} data-farbe="neutral2">
      {knapp ? (
        <span className="druck-knapp-tag-titel">{t.hilfsdienste}</span>
      ) : (
        <AbschnittKopf name={t.hilfsdienste} lieder={[]} />
      )}
      <div className="druck-dienst-zeile druck-dienst-zeile--kopf">
        <span />
        {MEETING_TABS.map((key) => {
          const datum = meetingDate(rawWeek, key, state.congregation.times)
          return (
            <span key={key}>
              <TagDatum ausgefallen={istAusgefallen(rawWeek, key)}>{wochentagMitZahl(datum, state.lang)}</TagDatum>
            </span>
          )
        })}
      </div>
      {state.services.map((service) => (
        <div key={service.key} className="druck-dienst-zeile">
          <span>{tu(service.name)}</span>
          {MEETING_TABS.map((key) => {
            const plaetze = plaetzeVon(week[key].helpers, service)
            const namen = plaetze
              .filter((slot) => slot?.name)
              .map((slot) => platzName(slot?.name ?? '', Boolean(service.groups), i18n))
            const frei = plaetze.some((slot) => !slot?.name)
            return (
              <span key={key}>
                {namen.join(', ')}
                {namen.length > 0 && frei && ', '}
                {frei && <Offen breite={knapp ? 72 : 84} />}
              </span>
            )
          })}
        </div>
      ))}
    </section>
  )
}

function AbschnittKopf({ name, lieder }: { name: string; lieder: string[] }) {
  return (
    <div className="druck-abschnitt-kopf">
      <h3 className="druck-abschnitt-name">
        <Balken />
        {name}
      </h3>
      {lieder.length > 0 && <span className="druck-lied">{lieder.join(' · ')}</span>}
    </div>
  )
}

function KnappZeile({ nr, punkt, children }: { nr: number | string; punkt: string; children: ReactNode }) {
  return (
    <div className="druck-knapp-zeile">
      <span>{nr}</span>
      <span>{punkt}</span>
      <span>{children}</span>
    </div>
  )
}

/** Ein Tag, der ausfällt, steht durchgestrichen da — wie auf der Karte des Tages. */
function TagDatum({ ausgefallen, children }: { ausgefallen: boolean; children: string }) {
  return ausgefallen ? <s>{children}</s> : <>{children}</>
}

/** Die Personen eines Punkts, ausführlich: Name und Rolle, frei = gepunktet. */
function Personen({ slots, tu }: { slots: readonly SlotAssignment[]; tu: Uebersetzer }) {
  return (
    <span className="druck-personen">
      {slots.map((slot, i) => (
        <Fragment key={i}>
          {i > 0 && ' · '}
          {slot.name ? (
            <>
              <span className="druck-name">{slot.name}</span>
              {slot.rolle && <span className="druck-leise"> {tu(slot.rolle)}</span>}
            </>
          ) : (
            <Offen />
          )}
        </Fragment>
      ))}
    </span>
  )
}

/**
 * Die Personen eines Punkts in einer Zeile: „A mit B" bei Schüler und
 * Partner, „A · Leser B" bei Leiter und Leser, sonst die Namen. Fehlt einer,
 * steht der ganze Platz gepunktet da — eine halbe Besetzung ist auf dem
 * Aushang keine. Der Partner ist der Platz `schulungPartner`, wie beim
 * Zuteilen — nicht das Rollenwort, das nur seine Beschriftung ist.
 */
function NamenKnapp({ slots }: { slots: readonly SlotAssignment[] }) {
  const { t, tu } = useT()
  if (slots.length === 0) return null
  if (slots.some((slot) => !slot.name)) return <Offen breite={84} />
  const [erster, ...rest] = slots
  if (rest.length === 1 && rest[0]?.bereichsKey === 'schulungPartner')
    return <>{fill(t.druckMit, { a: erster?.name ?? '', b: rest[0].name })}</>
  return <>{[erster?.name, ...rest.map((slot) => (slot.rolle ? `${tu(slot.rolle)} ${slot.name}` : slot.name))].join(' · ')}</>
}
