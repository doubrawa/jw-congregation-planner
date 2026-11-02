import { useApp } from '../app/context'
import { anlassArt } from '../data/anlass'
import { ersteZusammenkunftNach, istAusgefallen, MEETING_TABS } from '../data/helpers'
import { meetingDate, meetingTime } from '../data/meeting-dates'
import { allePlaetze, leerVorOrt } from '../data/plaetze'
import type { Week } from '../data/types'
import { anlassName } from '../components/anlass-name'
import { gebundenesDatum } from '../components/datum-anzeige'
import { fill, programmSpanne, useProgWeeks, useT } from '../i18n/useT'
import { monatsName, wochenDesMonats, wochenZeitraum } from '../programm/druck'
import { Bogen } from './Bogen'
import { Offen } from './DruckBlatt'
import { TagVoll, type DruckTag } from './ProgrammDruck'

/**
 * **Die Zusammenkünfte einer Woche auf einem Blatt** (T121, Phase 9; Entwurf
 * `GDruckWoche`): links unter der Woche, rechts das Wochenende. Ausführlich:
 * je Punkt die Personen mit ihrer Rolle, frei = gepunktet.
 *
 * Bis Phase 9 druckte die App den Bildschirm — je Zusammenkunft für sich, am
 * Desktop beide Tage auf zwei Seiten. Die Hilfsdienste standen von Phase 9 bis
 * zum 2.11.2026 unter dem Wochenende; seitdem nicht mehr auf dem Aushang
 * (Betreiber).
 *
 * Der Anlass der Woche (Kreisaufseher, Gedächtnismahl, Kongress) steht hinter
 * dem Zeitraum im Kopf des Blatts — im Monat steht er im Kopf der Woche.
 */
export function WochenBogen({ wi }: { wi: number }) {
  const { state } = useApp()
  const { t } = useT()
  const progWeek = useProgWeeks()
  const rawWeek = state.weeks[wi]
  if (!rawWeek) return null
  const { week, tpw } = progWeek(rawWeek)
  const zeitraum = [wochenZeitraum(rawWeek, state.lang, programmSpanne({ week, tpw })), anlassName(anlassArt(rawWeek), t)]
    .filter(Boolean)
    .join(' · ')
  return (
    <Bogen
      titel={t.navZusammenkuenfte}
      zeitraum={zeitraum}
      bloecke={[{ key: rawWeek.start ?? String(wi), inhalt: <WochenInhalt wi={wi} week={week} rawWeek={rawWeek} tpw={tpw} /> }]}
    />
  )
}

/**
 * **Die Zusammenkünfte eines Monats** (T121, Phase 9): je Woche ihr Kopf und
 * darunter dieselbe Woche wie auf dem Wochenbogen (`WochenInhalt`), so viele
 * Wochen je Blatt, wie passen (gemessen, siehe `Bogen`). Zum Monat gehört jede
 * Woche, deren Montag in ihm liegt (`wochenDesMonats`).
 *
 * Bis zum 1.11.2026 stand hier eine eigene, knappe Fassung (Entwurf
 * `GDruckMonat`): je Punkt eine Zeile, die Namen rechts, ohne Dauer und
 * Zusatz. Zwei Wochen je Blatt sollte sie fassen; mit den damals noch
 * gedruckten Hilfsdiensten einer echten Versammlung war es trotzdem nur eine.
 * Woche und Monat sehen jetzt gleich aus (Betreiber).
 */
export function MonatsBogen({ monat }: { monat: string }) {
  const { state } = useApp()
  const { t } = useT()
  const bloecke = wochenDesMonats(state.weeks, monat).map((wi) => ({
    key: state.weeks[wi]?.start ?? String(wi),
    inhalt: <MonatsWoche wi={wi} />,
  }))
  return <Bogen titel={t.navZusammenkuenfte} zeitraum={monatsName(monat, state.lang)} bloecke={bloecke} />
}

/** Eine Woche auf dem Monatsbogen: ihr Kopf, darunter die Woche wie auf ihrem eigenen Bogen. */
function MonatsWoche({ wi }: { wi: number }) {
  const { state } = useApp()
  const { t } = useT()
  const progWeek = useProgWeeks()
  const rawWeek = state.weeks[wi]
  if (!rawWeek) return null
  const { week, tpw } = progWeek(rawWeek)
  const anlass = anlassName(anlassArt(rawWeek), t)
  return (
    <section className="druck-monat-woche">
      <div className="druck-monat-kopf">
        <h2 className="druck-monat-titel">{programmSpanne({ week, tpw })}</h2>
        {anlass && <span className="druck-anlass">{anlass}</span>}
      </div>
      <WochenInhalt wi={wi} week={week} rawWeek={rawWeek} tpw={tpw} />
    </section>
  )
}

/**
 * **Was von einer Woche auf dem Papier steht** — auf dem Wochen- und dem
 * Monatsbogen dasselbe: links unter der Woche, rechts das Wochenende — ohne
 * Hilfsdienste. In der Kongresswoche ein Satz und wann die nächste
 * Zusammenkunft ist.
 *
 * Was die gepunktete Linie heißt, steht nur da, wenn auf dem Blatt eine ist
 * (2.11.2026): Ohne Hilfsdienste ist eine ganz besetzte Woche der Normalfall,
 * und „noch frei" unter einem vollen Programm las sich, als fehle etwas.
 */
function WochenInhalt({ wi, week, rawWeek, tpw }: { wi: number } & Omit<DruckTag, 'tab'>) {
  const { t } = useT()
  if (anlassArt(rawWeek) === 'kongress') return <KongressZeilen wi={wi} />
  const tag = { week, rawWeek, tpw }
  return (
    <div className="druck-woche">
      <TagVoll tab="mid" {...tag} />
      <div className="druck-spalte">
        <TagVoll tab="we" {...tag} />
        {hatFreienPlatz(rawWeek) && (
          <p className="druck-hinweis">
            <Offen breite={28} />
            {t.druckNochFrei}
          </p>
        )}
      </div>
    </div>
  )
}

/**
 * Steht auf dem Bogen ein freier Platz? Dieselben Plätze, die `TagVoll`
 * druckt — Programm, Zusätzliche Klasse und ihr Ratgeber, ohne das
 * Schlussgebet vor Ort (`leerVorOrt`) —, an den Tagen, die stattfinden.
 */
function hatFreienPlatz(rawWeek: Week): boolean {
  return MEETING_TABS.some(
    (tab) =>
      !istAusgefallen(rawWeek, tab) &&
      [...allePlaetze(rawWeek[tab])].some((platz) => !platz.slot.name && !leerVorOrt(rawWeek[tab], platz)),
  )
}

/** Die Kongresswoche: alle Zusammenkünfte fallen aus — und wann die nächste ist. */
function KongressZeilen({ wi }: { wi: number }) {
  const { state } = useApp()
  const { t } = useT()
  const naechste = ersteZusammenkunftNach(state.weeks, wi)
  const zeiten = state.congregation.times
  return (
    <>
      <p className="druck-kongress">{t.kongressAusfall}</p>
      {naechste && (
        <p className="druck-hinweis">
          {fill(t.naechsteZusammenkunft, {
            wann: [
              gebundenesDatum(meetingDate(naechste.week, naechste.tab, zeiten), state.lang, 'tag'),
              meetingTime(naechste.week, naechste.tab, zeiten),
            ]
              .filter(Boolean)
              .join(' · '),
          })}
        </p>
      )}
    </>
  )
}
