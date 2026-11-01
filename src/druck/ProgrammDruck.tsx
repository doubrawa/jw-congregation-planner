import { Fragment } from 'react'
import { useApp } from '../app/context'
import { hatAuxKlasse } from '../data/aux-class'
import { abweichungsGrund, dauerAbtrennen, istAusgefallen, MEETING_TABS } from '../data/helpers'
import { deutschesDatum, meetingDate, meetingTime } from '../data/meeting-dates'
import type { MeetingKey, SlotAssignment, Week } from '../data/types'
import { zusammenkunftName } from '../components/anlass-name'
import { wochentagMitZahl } from '../components/datum-anzeige'
import { platzName, useT } from '../i18n/useT'
import { abschnittZeilen, plaetzeVon, rolleNebenDemNamen } from '../programm/programm-zeilen'
import { Balken, Offen } from './DruckBlatt'
import { schlussgebetVorOrt } from '../../supabase/functions/_shared/planung.ts'

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
  const { t } = useT()
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
            const rawSection = rawMeeting.sections[si]
            const { lieder, zeilen } = abschnittZeilen(section, rawSection, tpw)
            const vorOrt = (slot: SlotAssignment): boolean => schlussgebetVorOrt(rawMeeting.sections, rawSection, slot)
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
                            <Personen slots={item.names} />
                            <span className="druck-raum">{t.auxKlasse}</span>
                            <Personen slots={item.aux ?? []} />
                          </>
                        ) : (
                          <Personen slots={item.names} vorOrt={vorOrt} />
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
                  <Personen slots={[rawMeeting.auxRatgeber]} />
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
 * **Die Hilfsdienste beider Tage** als Tabelle: eine Zeile je Dienst, eine
 * Spalte je Tag. Ein freier Platz steht gepunktet da; fällt ein Tag aus, ist
 * sein Kopf durchgestrichen. Am Bildschirm steht seit dem 21.10.2026 jeder
 * Tag mit seinen eigenen Diensten (`ZusammenkunftAnsicht`).
 */
export function HilfsdiensteDruck({ week, rawWeek }: { week: Week; rawWeek: Week }) {
  const { state } = useApp()
  const i18n = useT()
  const { t, tu } = i18n
  return (
    <section className="druck-hilfsdienste" data-farbe="neutral2">
      <AbschnittKopf name={t.hilfsdienste} lieder={[]} />
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
                {frei && <Offen breite={84} />}
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

/** Ein Tag, der ausfällt, steht durchgestrichen da — wie auf der Karte des Tages. */
function TagDatum({ ausgefallen, children }: { ausgefallen: boolean; children: string }) {
  return ausgefallen ? <s>{children}</s> : <>{children}</>
}

/**
 * Die Personen eines Punkts, ausführlich: Name und Rolle — beim Gastredner
 * seine Versammlung, wie am Bildschirm (`rolleNebenDemNamen`) —, frei = gepunktet.
 * Das Schlussgebet am Wochenende plant niemand (`vorOrt`, T133): Leer sagt es,
 * wer es übernimmt.
 */
function Personen({ slots, vorOrt }: { slots: readonly SlotAssignment[]; vorOrt?: (slot: SlotAssignment) => boolean }) {
  const { t, tu } = useT()
  return (
    <span className="druck-personen">
      {slots.map((slot, i) => {
        const rolle = rolleNebenDemNamen(slot, tu)
        return (
          <Fragment key={i}>
            {i > 0 && ' · '}
            {slot.name ? (
              <>
                <span className="druck-name">{slot.name}</span>
                {rolle && <span className="druck-leise"> {rolle}</span>}
              </>
            ) : vorOrt?.(slot) ? (
              <span className="druck-leise">{t.schlussgebetVorOrt}</span>
            ) : (
              <Offen />
            )}
          </Fragment>
        )
      })}
    </span>
  )
}
