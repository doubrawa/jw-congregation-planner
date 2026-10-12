import { useApp } from '../app/context'
import { bereichsTitel, zumAnsehen, zumPlanen } from '../app/bereich'
import { darfPlanen, rechteVon, themaVon } from '../data/rechte'
import type { Thema } from '../data/types'
import { useT } from '../i18n/useT'
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
 * `thema` gibt der Bildschirm mit, wenn er es selbst entscheidet: Den
 * Gruppenaufseher führt `PlanenScreen` auch mit einem Reiter von früher zu den
 * Treffpunkten — der Titel muss dann nennen, was darunter steht.
 */
export function Bereichstitel({ thema: vorgegeben }: { thema?: Thema }) {
  const { state, dispatch } = useApp()
  const { t } = useT()
  const thema = vorgegeben ?? themaVon(state.tab)
  const planen = state.screen === 'planen'
  const knopf = planen ? (
    <button
      type="button"
      className="planen-knopf"
      onClick={() => dispatch(zumAnsehen(thema))}
    >
      {t.fertig}
    </button>
  ) : (
    darfPlanen(rechteVon(state), thema) && (
      <button
        type="button"
        className="planen-knopf"
        onClick={() => dispatch(zumPlanen(thema))}
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
