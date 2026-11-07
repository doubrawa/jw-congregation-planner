import type { ReactNode } from 'react'
import type { MeetingAssignment, SubstituteReq } from '../data/types'
import { useT } from '../i18n/useT'
import { AufgabeTermin, ZuteilungenText } from './AufgabeText'
import './aufgaben.css'

/**
 * **Was man übernehmen kann** — ein Ersatzgesuch oder ein freier Platz: was,
 * wann, und darunter, was man an dem Tag schon hat. Der Hinweis steht **vor**
 * dem Zusagen, nicht als Toast danach; Wortlaut wie im Zuteilungs-Blatt des
 * Planers.
 *
 * Stand dreimal ausgeschrieben da — Einspringen und freie Plätze unter „Meine
 * Aufgaben", Einspringen im Blatt beim Öffnen.
 */
export function AngebotText({
  titel,
  wann,
  schonHeute,
  hinweis,
}: {
  /** Titel und Termin dürfen aus zwei Sprachen bestehen (`AufgabeText`, `AufgabeWann`). */
  titel: ReactNode
  wann: ReactNode
  schonHeute: readonly MeetingAssignment[]
  /** Eine Zeile darunter — beim Tauschen: „Ohne App-Konto — vorher persönlich absprechen". */
  hinweis?: string
}) {
  const { t } = useT()
  return (
    <span className="angebot-text">
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
 * Ein Ersatzgesuch: der Dienst, sein Termin und wer abgesagt hat — sein Name
 * ohne Übersetzer, wie überall (`platzName`).
 */
export function GesuchText({ req }: { req: SubstituteReq }) {
  const { tu } = useT()
  return (
    <AngebotText
      titel={tu(req.title)}
      wann={
        <>
          <AufgabeTermin task={req} /> · {req.declinedBy}
        </>
      }
      schonHeute={req.schonHeute}
    />
  )
}
