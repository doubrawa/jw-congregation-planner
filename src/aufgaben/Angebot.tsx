import type { MeetingAssignment, SubstituteReq } from '../data/types'
import { aufgabenTp, useT, zuteilungenText } from '../i18n/useT'
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
}: {
  titel: string
  wann: string
  schonHeute: readonly MeetingAssignment[]
}) {
  const i18n = useT()
  return (
    <span className="angebot-text">
      <span className="angebot-titel">{titel}</span>
      <span className="klein-text">{wann}</span>
      {schonHeute.length > 0 && (
        <span className="hinweis-schon">
          {i18n.t.sheetSchonHeute}: {zuteilungenText(schonHeute, i18n)}
        </span>
      )}
    </span>
  )
}

/** Ein Ersatzgesuch: der Dienst, sein Termin und wer abgesagt hat. */
export function GesuchText({ req }: { req: SubstituteReq }) {
  const i18n = useT()
  return (
    <AngebotText
      titel={i18n.tu(req.title)}
      wann={`${aufgabenTp(req, i18n)(req.date)} · ${i18n.tu(req.declinedBy)}`}
      schonHeute={req.schonHeute}
    />
  )
}
