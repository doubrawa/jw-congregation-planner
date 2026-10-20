import type { CSSProperties, MouseEvent } from 'react'
import { useApp } from '../app/context'
import { datumsFormat } from '../components/datum-anzeige'
import { fromIso } from '../data/meeting-dates'
import type { Trolley, TrolleyTermin } from '../data/types'
import { versammlungsSprache } from '../i18n/langs'
import { fill, useT } from '../i18n/useT'
import {
  anteilVon,
  lageImPlan,
  nameVon,
  PLAN_STUNDEN,
  tagLang,
  werImTermin,
  wochenTage,
  zeitAnStelle,
  zeitSpanne,
} from './trolley-anzeige'

/**
 * **Die Tage der Woche zur Wahl** (Entwurf `GZeugnis`): Wochentag kurz, die
 * Zahl darunter, ein Punkt unter Tagen mit Terminen. Der gewählte steht dunkel.
 */
export function TagWahl({
  montag,
  datum,
  termine,
  onDatum,
}: {
  montag: string
  datum: string
  termine: readonly TrolleyTermin[]
  onDatum: (datum: string) => void
}) {
  const { state } = useApp()
  const { t } = useT()
  return (
    <div role="group" aria-label={t.trolleyTag} className="trolley-tagwahl">
      {wochenTage(montag).map((tag) => {
        const belegt = termine.some((x) => x.datum === tag)
        const lang = tagLang(tag, state.lang)
        return (
          <button
            key={tag}
            type="button"
            className="trolley-tagknopf"
            aria-pressed={tag === datum}
            aria-label={belegt ? fill(t.trolleyTagMitTerminen, { tag: lang }) : lang}
            onClick={() => onDatum(tag)}
          >
            <span className="trolley-tagknopf-kurz">{datumsFormat(state.lang, 'wochentagKurz').format(fromIso(tag))}</span>
            <span className="trolley-tagknopf-zahl">{datumsFormat(state.lang, 'tagNummer').format(fromIso(tag))}</span>
            <span className={belegt ? 'trolley-tagknopf-punkt is-belegt' : 'trolley-tagknopf-punkt'} aria-hidden="true" />
          </button>
        )
      })}
    </div>
  )
}

/**
 * **Ein Tag mit einer Spalte je Trolley** von 6 bis 22 Uhr (Entwurf
 * `GZeugnis`, am Tablet mit breiten Spalten `GTabletTrolleys`). Ein Termin
 * steht als Block zu seiner Zeit — mit Partner gefüllt, wer einen sucht
 * gestrichelt. Ein Tipp auf einen Termin öffnet ihn, ein Tipp auf eine freie
 * Stelle schlägt dort einen Termin vor (`onFrei`) — nur, wo man eintragen
 * kann (`eintragbar`: das Trolley-Recht, und der Tag ist nicht vorbei).
 *
 * Lage und Höhe stehen als Anteil des Plans da (`lageImPlan`): Seine Höhe
 * wächst mit der Schriftstufe, und die kennt nur das Stylesheet.
 */
export function TrolleyTag({
  datum,
  trolleys,
  termine,
  eintragbar,
  onTermin,
  onFrei,
}: {
  datum: string
  trolleys: readonly Trolley[]
  termine: readonly TrolleyTermin[]
  eintragbar: boolean
  onTermin: (termin: TrolleyTermin) => void
  onFrei: (trolleyId: string, von: string) => void
}) {
  const { state } = useApp()
  const { t } = useT()
  const titel = tagLang(datum, state.lang)
  const sprache = versammlungsSprache(state.congLang)
  const amTag = termine.filter((x) => x.datum === datum)
  const frei = (trolleyId: string) => (e: MouseEvent<HTMLButtonElement>) => {
    const feld = e.currentTarget.getBoundingClientRect()
    onFrei(trolleyId, zeitAnStelle(feld.height > 0 ? (e.clientY - feld.top) / feld.height : 0))
  }
  return (
    <section className="karte trolley-tag" aria-label={titel}>
      <h2 className="karte-titel">{titel}</h2>
      <div className="trolley-tag-kopf" style={{ '--trolleys': trolleys.length } as CSSProperties}>
        <span />
        {/* Name und Ort trägt die Versammlung ein: Getrennt wird nach ihrer
            Sprache, nicht nach der des Lesers (T128). */}
        {trolleys.map((tr) => (
          <span key={tr.id} className="trolley-spaltenkopf" lang={sprache}>
            <span className="trolley-spaltenkopf-name" dir="auto">
              {tr.name}
            </span>
            {tr.ort && (
              <span className="klein-text" dir="auto">
                {tr.ort}
              </span>
            )}
          </span>
        ))}
      </div>
      <div className="trolley-plan" style={{ '--trolleys': trolleys.length } as CSSProperties}>
        <div className="trolley-uhr" aria-hidden="true">
          {PLAN_STUNDEN.map((h) => (
            <span key={h} style={{ top: `${anteilVon(`${String(h).padStart(2, '0')}:00`) * 100}%` }}>
              {String(h).padStart(2, '0')}
            </span>
          ))}
        </div>
        {trolleys.map((tr) => (
          <div key={tr.id} className="trolley-spalte">
            {eintragbar && (
              <button
                type="button"
                className="trolley-frei"
                aria-label={fill(t.trolleyFreiWaehlen, { trolley: tr.name })}
                onClick={frei(tr.id)}
              />
            )}
            {amTag
              .filter((x) => x.trolleyId === tr.id)
              .map((termin) => (
                <TerminBlock key={termin.id} termin={termin} trolley={tr.name} onTermin={onTermin} />
              ))}
          </div>
        ))}
      </div>
      {eintragbar && <p className="klein-text trolley-tipp">{t.trolleyTippFrei}</p>}
    </section>
  )
}

/** Ein Termin als Block im Tagesplan: Zeit, die Namen — oder wer einen Partner sucht. */
function TerminBlock({
  termin,
  trolley,
  onTermin,
}: {
  termin: TrolleyTermin
  trolley: string
  onTermin: (termin: TrolleyTermin) => void
}) {
  const { state } = useApp()
  const { t } = useT()
  const { oben, hoehe } = lageImPlan(termin)
  const person = nameVon(state.persons, termin.pid)
  const partner = nameVon(state.persons, termin.partner)
  return (
    <button
      type="button"
      className={termin.partner ? 'trolley-termin' : 'trolley-termin is-gesucht'}
      style={{ top: `${oben * 100}%`, height: `${hoehe * 100}%` }}
      aria-label={fill(t.trolleyTerminLabel, { trolley, zeit: zeitSpanne(termin), wer: werImTermin(termin, state.persons, t) })}
      onClick={() => onTermin(termin)}
    >
      <span className="trolley-termin-zeit">{zeitSpanne(termin)}</span>
      <span className="trolley-termin-name" dir="auto">
        {person}
      </span>
      {partner ? (
        <span className="trolley-termin-name" dir="auto">
          {partner}
        </span>
      ) : (
        <span className="trolley-termin-gesucht">{t.trolleyPartnerGesucht}</span>
      )}
    </button>
  )
}
