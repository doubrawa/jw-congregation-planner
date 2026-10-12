import { useState } from 'react'
import { useApp } from '../app/context'
import { Option } from '../bausteine/Option'
import { Zeichen } from '../bausteine/Zeichen'
import { DatePicker } from '../components/DatePicker'
import { datumsFormat } from '../components/datum-anzeige'
import { anlassArt } from '../data/anlass'
import { istAusgefallen, MEETING_TABS, weichtAb } from '../data/helpers'
import { meetingDate, meetingTime } from '../data/meeting-dates'
import type { Anlass, AnlassArt, MeetingKey } from '../data/types'
import type { Dict } from '../i18n/ui'
import { LOCALES } from '../i18n/langs'
import { useProgWeek, useT } from '../i18n/useT'
import { ProgrammBlatt } from './ProgrammBlatt'
import { SonderwochePanel } from './SonderwochePanel'
import { TerminePanel } from './TerminePanel'

type DictKey = keyof Dict

/**
 * Die vier Anlässe in der Reihenfolge des Entwurfs, je mit dem, was er für die
 * Woche bedeutet. Der Kongress nennt dieselbe Folge wie seine Karte beim
 * Ansehen (`kongressAusfall`).
 */
const ANLAESSE: ReadonlyArray<readonly [AnlassArt | null, DictKey, DictKey]> = [
  [null, 'anlassNormal', 'anlassNormalText'],
  ['co', 'coWoche', 'anlassCoText'],
  ['kongress', 'kongress', 'kongressAusfall'],
  ['mem', 'memWoche', 'anlassMemText'],
]

/**
 * **Woche einrichten** (T121, Entwurf `GWochePlanen`; die Bearbeiten-Ansicht
 * aus T64) — hinter dem Zeichen neben den Karten der Tage, nur beim Admin.
 *
 * Entstanden ist die Ansicht, weil der Kreisaufseher-Schalter im Panel
 * **einer** Zusammenkunft stand, aber **beide** änderte. Daraus die Regel: Ein
 * Bedienelement gehört auf die Ebene, die es verändert. Hier steht deshalb,
 * was der ganzen Woche gehört, in Karten untereinander:
 *
 * | Karte | Was hier eingestellt wird |
 * | --- | --- |
 * | **Anlass der Woche** | normal, Kreisaufseher, Kongress, Gedächtnismahl — samt Termin |
 * | **Zusammenkünfte dieser Woche** | je Zusammenkunft: findet statt · Wochentag · Uhrzeit · Grund („Verlegen") |
 * | **Weitere Termine** | Pionierbesprechung und was sonst ansteht (T63) |
 * | **Programm** | die Punkte unter „Unser Leben als Christ" (`ProgrammBlatt`) |
 */
export function WochePanel() {
  const { state, dispatch } = useApp()
  const { t } = useT()
  const rawWeek = state.weeks[state.week]
  const { week, tpw } = useProgWeek(rawWeek)
  const [programmOffen, setProgrammOffen] = useState(false)
  if (!rawWeek || !week) return null

  const art = anlassArt(rawWeek)
  const termin = rawWeek.anlass
  const termine = (patch: Partial<Anlass>) => dispatch({ type: 'setAnlassTermin', patch })
  // Der eigene Datumswähler statt des nativen Feldes — wie bei den
  // Abwesenheiten. Die gemeinsamen Beschriftungen einmal binden.
  const dp = {
    locale: LOCALES[state.lang],
    placeholder: t.datumPh,
    prevLabel: t.a11yPrevMonth,
    nextLabel: t.a11yNextMonth,
  }

  return (
    <>
      <section className="karte einrichten-karte">
        <h2 className="abschnitt-titel einrichten-karte-titel">{t.anlassDerWoche}</h2>
        <div role="radiogroup" aria-label={t.anlassDerWoche} className="anlass-liste">
          {ANLAESSE.map(([wert, name, text]) => (
            <Option
              key={wert ?? 'normal'}
              an={(art ?? null) === wert}
              titel={t[name]}
              unter={t[text]}
              onWahl={() => dispatch({ type: 'setAnlass', art: wert })}
            />
          ))}
        </div>

        {/* Das Gedächtnismahl ist ein Abend nach Sonnenuntergang: ein Zeitpunkt. */}
        {art === 'mem' && (
          <div className="sonder-row sonder-row--termin">
            <div className="sonder-feld">
              <span className="sonder-label">{t.s89Datum}</span>
              <DatePicker value={termin?.von ?? ''} onChange={(iso) => termine({ von: iso })} {...dp} ariaLabel={t.s89Datum} />
            </div>
            <label className="sonder-feld">
              <span className="sonder-label">{t.a11yTime}</span>
              <input
                type="time"
                className="sonder-time"
                value={termin?.zeit ?? ''}
                onChange={(e) => termine({ zeit: e.target.value })}
              />
            </label>
          </div>
        )}

        {/* Der Kongress ist ein Zeitraum: ein Kreiskongress dauert einen Tag,
            ein Regionalkongress drei. „Bis" übernimmt beim Eintragen von „Von"
            denselben Wert (siehe setAnlassTermin) — der kurze Fall braucht damit
            keine zweite Eingabe, und beide Werte sind trotzdem immer gefüllt. */}
        {art === 'kongress' && (
          <div className="sonder-row sonder-row--termin">
            <div className="sonder-feld">
              <span className="sonder-label">{t.von}</span>
              <DatePicker value={termin?.von ?? ''} onChange={(iso) => termine({ von: iso })} {...dp} ariaLabel={t.von} />
            </div>
            <div className="sonder-feld">
              <span className="sonder-label">{t.bis}</span>
              <DatePicker
                value={termin?.bis ?? ''}
                onChange={(iso) => termine({ bis: iso })}
                min={termin?.von || undefined}
                {...dp}
                ariaLabel={t.bis}
              />
            </div>
          </div>
        )}
      </section>

      {/* Beide Zusammenkünfte, in der Reihenfolge der Woche. Der Anlass oben hat
          seine Wirkung schon gesetzt — hier kann der Admin sie übersteuern:
          fällt der Kongress nur aufs Wochenende, schaltet er die Zusammenkunft
          unter der Woche wieder an. */}
      <section className="karte einrichten-karte">
        <h2 className="abschnitt-titel einrichten-karte-titel">{t.zusammenkuenfteDieserWoche}</h2>
        {MEETING_TABS.map((tab) => (
          <ZusammenkunftZeile key={tab} tab={tab} />
        ))}
      </section>

      {/* Weitere Termine der Woche (T63) — sie gehören der Woche, nicht einer
          Zusammenkunft. */}
      <section className="karte einrichten-karte">
        <h2 className="abschnitt-titel einrichten-karte-titel">{t.weitereTermine}</h2>
        <p className="klein-text einrichten-text">{t.weitereTermineText}</p>
        <TerminePanel />
      </section>

      <section className="karte einrichten-karte">
        <h2 className="abschnitt-titel einrichten-karte-titel">{t.programmTitel}</h2>
        <button type="button" className="einrichten-verweis" onClick={() => setProgrammOffen(true)}>
          <span className="einrichten-verweis-text">
            <span>{t.programmpunkteBearbeiten}</span>
            {week.book && <span className="klein-text">{tpw(week.book)}</span>}
          </span>
          <Zeichen name="weiter" />
        </button>
      </section>

      {programmOffen && <ProgrammBlatt onClose={() => setProgrammOffen(false)} />}
    </>
  )
}

/**
 * Eine Zusammenkunft der Woche: wann sie stattfindet — durchgestrichen, wenn
 * sie ausfällt — und „Verlegen", das ihre Abweichung aufklappt (Tag, Uhrzeit,
 * findet statt, Grund). Weicht sie schon ab, steht die Abweichung offen da.
 */
function ZusammenkunftZeile({ tab }: { tab: MeetingKey }) {
  const { state } = useApp()
  const { t } = useT()
  const week = state.weeks[state.week]
  const [offen, setOffen] = useState(() => weichtAb(week, tab))
  if (!week) return null
  const zeiten = state.congregation.times
  const wann = `${datumsFormat(state.lang, 'tag').format(meetingDate(week, tab, zeiten))} · ${meetingTime(week, tab, zeiten)}`
  return (
    <div className="einrichten-zusammenkunft">
      <div className="einrichten-zeile">
        <span className="einrichten-zeile-text">
          <span className="einrichten-wann">{istAusgefallen(week, tab) ? <s>{wann}</s> : wann}</span>
          <span className="klein-text">{tab === 'we' ? t.tabWe : t.tabMid}</span>
        </span>
        {/* „Verlegen" — dasselbe Wort wie beim Zeugnisgeben, wo ein Termin
            auf einen anderen Tag geht (`ozTagWechseln`). */}
        <button type="button" className="verweis-leise" aria-expanded={offen} onClick={() => setOffen((o) => !o)}>
          {t.ozTagWechseln}
        </button>
      </div>
      {offen && <SonderwochePanel tab={tab} />}
    </div>
  )
}
