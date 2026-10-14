import { useApp } from '../app/context'
import { eigenePerson } from '../app/eigene-person'
import { GesperrterKnopf } from '../bausteine/GesperrterKnopf'
import { Punkt } from '../bausteine/Punkt'
import { Zeichen } from '../bausteine/Zeichen'
import type { TrolleyTermin } from '../data/types'
import { fill, useT } from '../i18n/useT'
import { mitWem, nameVon, tagKurz, trolleyNameVon, vornameVon, zeitSpanne } from './trolley-anzeige'

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
            <Punkt art="du" />
            <span className="trolley-zeile-text">
              <span className="trolley-zeile-titel">{`${tagKurz(termin.datum, state.lang)} · ${zeitSpanne(termin)}`}</span>
              <span className="klein-text" dir="auto">
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
 * Zeit, Trolley, wer. „Dazukommen" trägt einen gleich als Partner ein; ohne
 * Trolley-Recht steht die Zeile ohne Knopf da.
 */
export function PartnerGesucht({
  termine,
  darf,
  laeuft,
  onDazukommen,
}: {
  termine: readonly TrolleyTermin[]
  darf: boolean
  laeuft: boolean
  onDazukommen: (termin: TrolleyTermin) => void
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
            <span className="klein-text" dir="auto">
              {[zeitSpanne(termin), trolleyName(termin.trolleyId), nameVon(state.persons, termin.pid)]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </span>
          {darf && (
            <GesperrterKnopf
              className="knopf-pille knopf-pille--akzent"
              gesperrt={laeuft}
              onTipp={() => onDazukommen(termin)}
            >
              {t.trolleyDazukommen}
            </GesperrterKnopf>
          )}
        </div>
      ))}
    </section>
  )
}
