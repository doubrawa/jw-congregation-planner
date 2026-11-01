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
import { HilfsdiensteDruck, TagVoll } from './ProgrammDruck'

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
  return (
    <Bogen
      titel={t.navZusammenkuenfte}
      zeitraum={wochenZeitraum(rawWeek, state.lang, programmSpanne({ week, tpw }))}
      bloecke={[{ key: rawWeek.start ?? String(wi), inhalt: <WochenInhalt wi={wi} /> }]}
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
 * Zusatz. Zwei Wochen je Blatt sollte sie fassen; mit den Hilfsdiensten einer
 * echten Versammlung war es trotzdem nur eine. Woche und Monat sehen jetzt
 * gleich aus (Betreiber).
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
      <WochenInhalt wi={wi} />
    </section>
  )
}

/**
 * **Was von einer Woche auf dem Papier steht** — auf dem Wochen- und dem
 * Monatsbogen dasselbe: links unter der Woche, rechts das Wochenende, darunter
 * die Hilfsdienste beider Tage. In der Kongresswoche ein Satz und wann die
 * nächste Zusammenkunft ist.
 */
function WochenInhalt({ wi }: { wi: number }) {
  const { state } = useApp()
  const { t } = useT()
  const progWeek = useProgWeeks()
  const rawWeek = state.weeks[wi]
  if (!rawWeek) return null
  if (anlassArt(rawWeek) === 'kongress') return <KongressZeilen wi={wi} />
  const { week, tpw } = progWeek(rawWeek)
  const tag = { week, rawWeek, tpw }
  return (
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
