import type { ReactNode } from 'react'
import type { MeetingAssignment, SubstituteReq } from '../data/types'
import { fill, useT } from '../i18n/useT'
import { AufgabeTermin, ZuteilungenText } from './AufgabeText'
import './aufgaben.css'

/**
 * **Was man übernehmen kann** — ein Ersatzgesuch oder ein freier Platz: was,
 * wann, und darunter, was man an dem Tag schon hat. Der Hinweis steht **vor**
 * dem Zusagen, nicht als Toast danach; Wortlaut wie im Zuteilungs-Blatt des
 * Planers.
 *
 * Stand dreimal ausgeschrieben da — Einspringen und freie Plätze unter „Meine
 * Aufgaben", Einspringen im Blatt beim Öffnen. Dieselbe Zeile nennt auch die
 * künftigen Aufgaben einer Person, bevor sie frei werden (T181, T182) — dort
 * ohne „An diesem Tag schon".
 */
export function AngebotText({
  titel,
  wann,
  schonHeute = [],
  hinweis,
  id,
}: {
  /** Titel und Termin dürfen aus zwei Sprachen bestehen (`AufgabeText`, `AufgabeWann`). */
  titel: ReactNode
  wann: ReactNode
  schonHeute?: readonly MeetingAssignment[]
  /** Eine Zeile darunter — beim Tauschen: „Ohne App-Konto — vorher persönlich absprechen". */
  hinweis?: string
  /** Für `aria-describedby` am Knopf daneben: Er heißt nur „Übernehmen", der Zusammenhang steht hier. */
  id?: string
}) {
  const { t } = useT()
  return (
    <span className="angebot-text" id={id}>
      <span className="angebot-titel">{titel}</span>
      <span className="klein-text">{wann}</span>
      {hinweis && <span className="klein-text">{hinweis}</span>}
      {schonHeute.length > 0 && (
        <span className="hinweis-schon">
          {t.sheetSchonHeute}: <ZuteilungenText liste={schonHeute} />
        </span>
      )}
    </span>
  )
}

/**
 * Ein Ersatzgesuch: der Dienst, sein Termin und für wen — der Name ohne
 * Übersetzer, wie überall (`platzName`).
 */
export function GesuchText({ req, id }: { req: SubstituteReq; id?: string }) {
  const { t, tu } = useT()
  return (
    <AngebotText
      id={id}
      titel={tu(req.title)}
      wann={
        <>
          <AufgabeTermin task={req} /> · {fill(t.gesuchFuer, { name: req.declinedBy })}
        </>
      }
      schonHeute={req.schonHeute}
    />
  )
}
