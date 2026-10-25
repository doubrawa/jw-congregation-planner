import { useApp } from '../app/context'
import { bereichsTitel, zumAnsehen, zumPlanen, zurueckInDerPlanung } from '../app/bereich'
import { Zeichen } from '../bausteine/Zeichen'
import { darfPlanen, rechteVon, themaVon } from '../data/rechte'
import type { Thema } from '../data/types'
import { useT } from '../i18n/useT'
import { WOCHEN_SPALTE_BREITE, useMedia } from './useMedia'
import '../bausteine/bausteine.css'

/**
 * **Der Titel eines Bereichs mit „Planen"** (T121, Baustein `GBereiche`):
 * Zusammenkünfte, Predigtdienst oder Weitere Pläne — und daneben „Planen" für
 * alle, die den Bereich planen dürfen. Beim Planen steht dort „Fertig".
 *
 * Planen ist ein eigener Modus (entschieden am 11.10.2026): Am Handy trägt dann
 * der Kopf des Planens Titel und „Fertig" (`PlanenKopf`); ab Tablet-Breite
 * steht beides hier.
 *
 * **Unter „Planung"** (T144) — die Seite der Wochen und das Planen, das von
 * dort kam — gibt es nichts zu beenden: Dann steht vor dem Titel Zurück, eine
 * Ebene hinauf (`zurueckInDerPlanung`) — am Handy im Kopf darüber
 * (`UnterseiteKopf`), ab Tablet-Breite hier.
 *
 * `thema` gibt der Bildschirm mit, wenn er es selbst entscheidet: Den
 * Gruppenaufseher führt `PlanenScreen` auch mit einem Reiter von früher zu den
 * Treffpunkten — der Titel muss dann nennen, was darunter steht.
 */
export function Bereichstitel({ thema: vorgegeben }: { thema?: Thema }) {
  const { state, dispatch } = useApp()
  const { t } = useT()
  const mitSpalte = useMedia(WOCHEN_SPALTE_BREITE)
  const thema = vorgegeben ?? themaVon(state.tab)
  const rechte = rechteVon(state)
  const planen = state.screen === 'planen'
  const zurueck = zurueckInDerPlanung(state.screen, state.planenVon, thema, rechte, mitSpalte)
  if (zurueck) {
    return (
      <div className="bereichstitel">
        <div className="bereichstitel-zeile bereichstitel-zeile--zurueck">
          <button type="button" className="rund-knopf bereichstitel-zurueck" aria-label={t.a11yZurueck} onClick={() => dispatch(zurueck)}>
            <Zeichen name="zurueck" />
          </button>
          <h1 className="seitentitel">{bereichsTitel(t, thema)}</h1>
        </div>
      </div>
    )
  }
  const knopf = planen ? (
    <button
      type="button"
      className="planen-knopf"
      onClick={() => dispatch(zumAnsehen(thema))}
    >
      {t.fertig}
    </button>
  ) : (
    darfPlanen(rechte, thema) && (
      <button
        type="button"
        className="planen-knopf"
        onClick={() => dispatch(zumPlanen(thema, 'ansicht'))}
      >
        {t.planen}
      </button>
    )
  )
  return (
    <div className={planen ? 'bereichstitel bereichstitel--planen' : 'bereichstitel'}>
      <div className="bereichstitel-zeile">
        <h1 className="seitentitel">{bereichsTitel(t, thema)}</h1>
        {knopf}
      </div>
    </div>
  )
}
