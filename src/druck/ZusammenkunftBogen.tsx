import { useApp } from '../app/context'
import { anlassArt } from '../data/anlass'
import { ersteZusammenkunftNach } from '../data/helpers'
import { meetingDate, meetingTime } from '../data/meeting-dates'
import { anlassName } from '../components/anlass-name'
import { gebundenesDatum } from '../components/datum-anzeige'
import { fill, programmSpanne, useProgWeeks, useT } from '../i18n/useT'
import { monatsName, wochenDesMonats, wochenZeitraum } from '../programm/druck'
import { Bogen } from './Bogen'
import { Offen } from './DruckBlatt'
import { HilfsdiensteDruck, TagKnapp, TagVoll } from './ProgrammDruck'

/**
 * **Die Zusammenkünfte einer Woche auf einem Blatt** (T121, Phase 9; Entwurf
 * `GDruckWoche`): links unter der Woche, rechts das Wochenende und darunter
 * die Hilfsdienste beider Tage. Ausführlich: je Punkt die Personen mit ihrer
 * Rolle, frei = gepunktet.
 *
 * Bis Phase 9 druckte die App den Bildschirm — je Zusammenkunft für sich, ohne
 * Hilfsdienste, am Desktop beide Tage auf zwei Seiten.
 */
export function WochenBogen({ wi }: { wi: number }) {
  const { state } = useApp()
  const { t } = useT()
  const progWeek = useProgWeeks()
  const rawWeek = state.weeks[wi]
  if (!rawWeek) return null
  const { week, tpw } = progWeek(rawWeek)
  const tag = { week, rawWeek, tpw }
  const inhalt = (
    <div className="druck-woche">
      <TagVoll tab="mid" {...tag} />
      <div className="druck-spalte">
        <TagVoll tab="we" {...tag} />
        <HilfsdiensteDruck week={week} rawWeek={rawWeek} />
        <p className="druck-hinweis">
          <Offen breite={28} />
          {t.druckNochFrei}
        </p>
      </div>
    </div>
  )
  return (
    <Bogen
      titel={t.navZusammenkuenfte}
      zeitraum={wochenZeitraum(rawWeek, state.lang, programmSpanne({ week, tpw }))}
      bloecke={[{ key: rawWeek.start ?? String(wi), inhalt }]}
    />
  )
}

/**
 * **Die Zusammenkünfte eines Monats** (T121, Phase 9; Entwurf `GDruckMonat`):
 * knapp — je Programmpunkt eine Zeile, die Namen rechts —, so viele Wochen je
 * Blatt, wie passen (im Entwurf zwei; gemessen, siehe `Bogen`). Zum Monat
 * gehört jede Woche, deren Montag in ihm liegt (`wochenDesMonats`); eine
 * Kongresswoche steht mit einem Satz da.
 */
export function MonatsBogen({ monat }: { monat: string }) {
  const { state } = useApp()
  const { t } = useT()
  const bloecke = wochenDesMonats(state.weeks, monat).map((wi) => ({
    key: state.weeks[wi]?.start ?? String(wi),
    inhalt: <MonatsWoche wi={wi} />,
  }))
  return <Bogen titel={t.navZusammenkuenfte} zeitraum={monatsName(monat, state.lang)} art="monat" bloecke={bloecke} />
}

/** Eine Woche auf dem Monatsbogen: ihr Kopf, links unter der Woche, rechts das Wochenende und die Hilfsdienste. */
function MonatsWoche({ wi }: { wi: number }) {
  const { state } = useApp()
  const { t } = useT()
  const progWeek = useProgWeeks()
  const rawWeek = state.weeks[wi]
  if (!rawWeek) return null
  const { week, tpw } = progWeek(rawWeek)
  const art = anlassArt(rawWeek)
  const anlass = anlassName(art, t)
  const tag = { week, rawWeek, tpw }
  return (
    <section className="druck-monat-woche">
      <div className="druck-monat-kopf">
        <h2 className="druck-monat-titel">{programmSpanne({ week, tpw })}</h2>
        {anlass && <span className="druck-anlass">{anlass}</span>}
      </div>
      {art === 'kongress' ? (
        <KongressZeilen wi={wi} />
      ) : (
        <div className="druck-monat-tage">
          <TagKnapp tab="mid" {...tag} />
          <div className="druck-rechts">
            <TagKnapp tab="we" {...tag} />
            <HilfsdiensteDruck week={week} rawWeek={rawWeek} knapp />
          </div>
        </div>
      )}
    </section>
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
