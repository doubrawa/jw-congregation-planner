import { useApp } from '../app/context'
import { DatePicker } from '../components/DatePicker'
import { anlassArt } from '../data/anlass'
import type { Anlass, AnlassArt, MeetingKey } from '../data/types'
import { LOCALES } from '../i18n/langs'
import { useT } from '../i18n/useT'
import { SonderwochePanel } from './SonderwochePanel'
import { TerminePanel } from './TerminePanel'

/**
 * Die Bearbeiten-Ansicht der Woche (T64) — hinter dem Stift-Reiter.
 *
 * Sie ist entstanden, weil der Kreisaufseher-Schalter im Panel **einer**
 * Zusammenkunft stand, aber **beide** änderte. Daraus die Regel: Ein
 * Bedienelement gehört auf die Ebene, die es verändert. Hier stehen deshalb
 * beide Ebenen untereinander und in dieser Reihenfolge:
 *
 * | Ebene | Was hier eingestellt wird |
 * | --- | --- |
 * | **Woche** | der Anlass samt Termin |
 * | **je Zusammenkunft** | findet statt · Wochentag · Uhrzeit · Grund |
 *
 * Beide Zusammenkünfte auf einmal — vorher ging nur die des gerade offenen
 * Reiters, „Mittwoch statt Dienstag" **und** „Wochenende entfällt" waren zwei
 * Reiterwechsel.
 *
 * **Ohne einen einzigen neuen Wörterbuch-Schlüssel gebaut**, bis auf den
 * gemessenen `kongress`. Das ist kein Selbstzweck: `ui.test.ts` verlangt, dass
 * jedes der 33 Overlays jeden Schlüssel selbst übersetzt — ein neuer Schlüssel
 * heißt 33 Übersetzungen, und eine erfundene ist schlimmer als eine
 * zusammengesetzte aus geprüften Bausteinen. Verwendet werden:
 *
 * | Element | Woher |
 * | --- | --- |
 * | Überschrift, Beschriftung des Auswahlfelds | `einstellungen` |
 * | die drei Anlässe | `coWoche` / `memWoche` / `kongress` |
 * | „kein Anlass" | ein Gedankenstrich — in jeder Schrift derselbe |
 * | Datum, Uhrzeit | `s89Datum` / `a11yTime` |
 * | Von, Bis | `von` / `bis` |
 */
export function WochePanel() {
  const { state, dispatch } = useApp()
  const { t } = useT()
  const week = state.weeks[state.week]
  if (!week) return null

  const art = anlassArt(week)
  const termin = week.anlass
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
      <div className="panel" data-farbe="neutral">
        <h2 className="panel-label">{t.einstellungen}</h2>

        <div className="woche-anlass">
          <select
            className="sonder-select woche-anlass-select"
            aria-label={t.einstellungen}
            value={art ?? ''}
            onChange={(e) =>
              dispatch({ type: 'setAnlass', art: (e.target.value || null) as AnlassArt | null })
            }
          >
            {/* Kein Anlass: 50 von 52 Wochen. Ein Gedankenstrich braucht keine
                Übersetzung, und die drei anderen Einträge tragen die Bedeutung. */}
            <option value="">—</option>
            <option value="co">{t.coWoche}</option>
            <option value="mem">{t.memWoche}</option>
            <option value="kongress">{t.kongress}</option>
          </select>
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
            keine zweite Eingabe, und beide Werte sind trotzdem immer gefüllt.
            Dieselbe Regel gilt seit jeher bei den Abwesenheiten; die Wochen-
            Ansicht folgt ihr, statt eine zweite zu erfinden. */}
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

        {/* Weitere Termine der Woche (T63) — Pionierbesprechung,
            Ältestenbesprechung, was sonst ansteht. Sie stehen im selben Panel
            wie der Anlass, weil sie derselben Ebene gehören: der Woche. Eine
            eigene Überschrift bekämen sie nur mit einem erfundenen Wort. */}
        <TerminePanel />
      </div>

      {/* Beide Zusammenkünfte, in der Reihenfolge der Woche. Der Anlass oben hat
          seine Wirkung schon gesetzt — hier kann der Planer sie übersteuern:
          fällt der Kongress nur aufs Wochenende, schaltet er die Zusammenkunft
          unter der Woche wieder an. */}
      {MEETINGS.map((tab) => (
        <SonderwochePanel key={tab} tab={tab} />
      ))}
    </>
  )
}

const MEETINGS: readonly MeetingKey[] = ['mid', 'we']
