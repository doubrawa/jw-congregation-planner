import { useApp } from '../app/context'
import { eigenePerson } from '../app/eigene-person'
import { Punkt } from '../bausteine/Punkt'
import { Zeichen } from '../bausteine/Zeichen'
import type { TrolleyTermin } from '../data/types'
import { fill, useT } from '../i18n/useT'
import { mitWem, nameVon, tagKurz, trolleyNameVon, vornameVon } from './trolley-anzeige'
import { Zeitspanne } from './Zeitspanne'

/**
 * **Deine Termine** (Entwurf `GZeugnis`): je Termin Tag und Zeit, darunter der
 * Trolley und mit wem — oder „Partner gesucht". Wer als Partner eingetragen
 * wurde, liest auch, wer es war („Jonas hat euch beide eingetragen"). Ein Tipp
 * öffnet den Termin.
 */
export function DeineTermine({
  termine,
  onTermin,
}: {
  termine: readonly TrolleyTermin[]
  onTermin: (termin: TrolleyTermin) => void
}) {
  const { state } = useApp()
  const { t } = useT()
  const trolleyName = (id: string) => trolleyNameVon(state.trolleys, id)
  const ich = eigenePerson(state)?.id
  return (
    <section className="karte trolley-karte" aria-label={t.trolleyDeineTermine}>
      <h2 className="karte-titel">{t.trolleyDeineTermine}</h2>
      {termine.map((termin) => {
        const teile = [
          trolleyName(termin.trolleyId),
          mitWem(termin, ich, state.persons, t),
          ...(termin.gemeinsam && termin.partner === ich
            ? [fill(t.trolleyBeideEingetragen, { name: vornameVon(state.persons, termin.pid) })]
            : []),
        ]
        return (
          <button key={termin.id} type="button" className="trolley-zeile" onClick={() => onTermin(termin)}>
            {/* Derselbe Punkt wie unter „Meine Aufgaben" (T194): voll mit Partner, gestrichelt, solange einer gesucht wird. */}
            <Punkt art={termin.partner ? 'voll' : 'offen'} />
            <span className="trolley-zeile-text">
              <span className="trolley-zeile-titel">
                {tagKurz(termin.datum, state.lang)} · <Zeitspanne termin={termin} />
              </span>
              <span className="wann-zeile" dir="auto">
                {teile.filter(Boolean).join(' · ')}
              </span>
            </span>
            <Zeichen name="weiter" />
          </button>
        )
      })}
    </section>
  )
}

/**
 * **Partner gesucht** (Entwurf `GZeugnis`): wo andere allein stehen — Tag,
 * Zeit, Trolley, wer. „Dazukommen" öffnet den Termin (`onTermin`); erst der
 * Knopf dort trägt ein. Ein Tipp in der Liste benachrichtigte sonst gleich den
 * anderen, und zurück ginge es nur über „Austragen" — mit einer zweiten
 * Mitteilung. Ohne Trolley-Recht steht die Zeile ohne Knopf da.
 */
export function PartnerGesucht({
  termine,
  darf,
  onTermin,
}: {
  termine: readonly TrolleyTermin[]
  darf: boolean
  onTermin: (termin: TrolleyTermin) => void
}) {
  const { state } = useApp()
  const { t } = useT()
  const trolleyName = (id: string) => trolleyNameVon(state.trolleys, id)
  return (
    <section className="karte trolley-karte" aria-label={t.trolleyPartnerGesucht}>
      <h2 className="karte-titel">{t.trolleyPartnerGesucht}</h2>
      {termine.map((termin) => (
        <div key={termin.id} className="trolley-zeile">
          <Punkt art="offen" />
          <span className="trolley-zeile-text">
            <span className="trolley-zeile-titel">{tagKurz(termin.datum, state.lang)}</span>
            <span className="wann-zeile" dir="auto">
              <Zeitspanne termin={termin} />
              {[trolleyName(termin.trolleyId), nameVon(state.persons, termin.pid)]
                .filter(Boolean)
                .map((teil) => ` · ${teil}`)
                .join('')}
            </span>
          </span>
          {darf && (
            <button type="button" className="knopf-pille knopf-pille--akzent" onClick={() => onTermin(termin)}>
              {t.trolleyDazukommen}
            </button>
          )}
        </div>
      ))}
    </section>
  )
}
