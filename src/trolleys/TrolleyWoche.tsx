import type { CSSProperties } from 'react'
import { useApp } from '../app/context'
import { datumsFormat, wochenSpanne } from '../components/datum-anzeige'
import { fromIso } from '../data/meeting-dates'
import type { Trolley, TrolleyTermin } from '../data/types'
import { fill, useT } from '../i18n/useT'
import { nameVon, tagLang, werImTermin, wochenTage, zeitSpanne } from './trolley-anzeige'

/**
 * **Die Woche als Raster** am Desktop (Entwurf `GDesktopTrolleys`): je Tag
 * eine Zeile, je Trolley eine Spalte. Darin die Termine des Tages — mit
 * Partner gefüllt, wer einen sucht gestrichelt. Ein Klick in ein freies Feld
 * setzt Tag und Trolley ins Formular rechts (`onFrei`) — nur, wer eintragen
 * darf (`eintragbar`), und nicht an einem Tag, der vorbei ist.
 */
export function TrolleyWoche({
  montag,
  heute,
  eintragbar,
  trolleys,
  termine,
  onTermin,
  onFrei,
}: {
  montag: string
  heute: string
  eintragbar: boolean
  trolleys: readonly Trolley[]
  termine: readonly TrolleyTermin[]
  onTermin: (termin: TrolleyTermin) => void
  onFrei: (trolleyId: string, datum: string) => void
}) {
  const { state } = useApp()
  const { t } = useT()
  const spalten = { '--trolleys': trolleys.length } as CSSProperties
  return (
    <section
      className="karte trolley-woche"
      aria-label={fill(t.trolleyWocheLabel, { woche: wochenSpanne(montag, state.lang) })}
    >
      <div className="trolley-woche-kopf" style={spalten}>
        <span />
        {trolleys.map((tr) => (
          <span key={tr.id} className="trolley-spaltenkopf">
            <span className="trolley-spaltenkopf-name" dir="auto">
              {tr.name}
            </span>
            {tr.ort && (
              <span className="klein-text" dir="auto">
                {fill(t.trolleyAbholen, { ort: tr.ort })}
              </span>
            )}
          </span>
        ))}
      </div>
      {wochenTage(montag).map((datum) => (
        <div key={datum} className="trolley-woche-zeile" style={spalten}>
          <span className="trolley-woche-tag">
            <span className="trolley-woche-tag-kurz">{datumsFormat(state.lang, 'wochentagKurz').format(fromIso(datum))}</span>
            <span className="klein-text">{datumsFormat(state.lang, 'tagZahl').format(fromIso(datum))}</span>
          </span>
          {trolleys.map((tr) => {
            const liste = termine.filter((x) => x.datum === datum && x.trolleyId === tr.id)
            if (liste.length > 0) {
              return (
                <span key={tr.id} className="trolley-woche-zelle">
                  {liste.map((termin) => (
                    <Buchung key={termin.id} termin={termin} trolley={tr.name} onTermin={onTermin} />
                  ))}
                </span>
              )
            }
            return !eintragbar || datum < heute ? (
              <span key={tr.id} />
            ) : (
              <button
                key={tr.id}
                type="button"
                className="trolley-woche-frei"
                aria-label={fill(t.trolleyFreiZelle, { tag: tagLang(datum, state.lang), trolley: tr.name })}
                onClick={() => onFrei(tr.id, datum)}
              />
            )
          })}
        </div>
      ))}
    </section>
  )
}

/** Ein Termin in seiner Zelle: Zeit, dann die Namen — oder „Partner gesucht". */
function Buchung({ termin, trolley, onTermin }: { termin: TrolleyTermin; trolley: string; onTermin: (termin: TrolleyTermin) => void }) {
  const { state } = useApp()
  const { t } = useT()
  const person = nameVon(state.persons, termin.pid)
  const partner = nameVon(state.persons, termin.partner)
  return (
    <button
      type="button"
      className={termin.partner ? 'trolley-buchung' : 'trolley-buchung is-gesucht'}
      aria-label={fill(t.trolleyTerminLabel, { trolley, zeit: zeitSpanne(termin), wer: werImTermin(termin, state.persons, t) })}
      onClick={() => onTermin(termin)}
    >
      <span className="trolley-termin-zeit">{zeitSpanne(termin)}</span>
      <span className="trolley-termin-name" dir="auto">
        {partner ? `${person} · ${partner}` : person}
      </span>
      {!partner && <span className="trolley-termin-gesucht">{t.trolleyPartnerGesucht}</span>}
    </button>
  )
}
