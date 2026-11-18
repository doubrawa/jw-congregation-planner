import { useApp } from '../app/context'
import { Sheet } from '../components/Sheet'
import { fill, useT } from '../i18n/useT'
import type { Angebot } from './angebot-auswahl'
import { AufgabeTermin, AufgabeText, ZuteilungenText } from './AufgabeText'
import { useAlsBeantwortet } from './useAlsBeantwortet'
import './aufgaben.css'

/**
 * **Übernehmen?** (T185): Der Tipp auf „Übernehmen" trägt nicht mehr gleich
 * ein, sondern legt vor, was man zusagt — Dienst, Termin, für wen, und was man
 * an dem Tag schon hat. Erst der Knopf hier trägt ein.
 *
 * Warum ein Blatt: Das Übernehmen benachrichtigt sofort die Person, die
 * abgesagt hat, und wer plant. Ein Fehltipp ließe sich nur über „Ich kann
 * nicht" zurücknehmen — mit einer neuen Absage und einem neuen Gesuch.
 */
export function UebernehmenBlatt({ angebot }: { angebot: Angebot }) {
  const { dispatch } = useApp()
  const { t, tu } = useT()
  const alsBeantwortet = useAlsBeantwortet()
  const schliessen = () => dispatch({ type: 'closeUebernehmen' })

  const gesuch = angebot.art === 'gesuch' ? angebot.req : null
  const eintrag = angebot.art === 'gesuch' ? angebot.req : angebot.platz
  const titel = angebot.art === 'gesuch' ? tu(angebot.req.title) : <AufgabeText task={angebot.platz} />

  const uebernehmen = () => {
    // Wer übernimmt, hat die Mitteilung „Ersatz gesucht" beantwortet.
    alsBeantwortet(eintrag.key)
    dispatch(gesuch ? { type: 'takeSubstitute', key: eintrag.key } : { type: 'platzUebernehmen', key: eintrag.key })
  }

  return (
    <Sheet
      variante="oben"
      label={t.uebernehmenFrage}
      eyebrow={
        <div className="sheet-marke">
          {titel} · <AufgabeTermin task={eintrag} />
        </div>
      }
      title={t.uebernehmenFrage}
      onClose={schliessen}
    >
      <div className="sheet-inhalt uebernehmen">
        {gesuch && <p>{fill(t.uebernehmenGesuch, { name: gesuch.declinedBy })}</p>}
        {eintrag.schonHeute.length > 0 && (
          <p className="hinweis-schon">
            {t.sheetSchonHeute}: <ZuteilungenText liste={eintrag.schonHeute} />
          </p>
        )}
        <p className="klein-text">{fill(t.uebernehmenDanach, { ort: t.navAufgabenLong })}</p>
      </div>
      <div className="absage-fuss">
        <button type="button" className="knopf-haupt" onClick={uebernehmen}>
          {t.uebernehmen}
        </button>
        <button type="button" className="knopf-leise" onClick={schliessen}>
          {t.abbrechen}
        </button>
      </div>
    </Sheet>
  )
}
