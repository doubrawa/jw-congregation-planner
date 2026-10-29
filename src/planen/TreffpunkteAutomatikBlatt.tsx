import { useApp } from '../app/context'
import { Sheet } from '../components/Sheet'
import { useZweiTipp } from '../components/useZweiTipp'
import { fsInGruppe } from '../data/fs'
import { rechteVon, treffpunktGruppe } from '../data/rechte'
import { besetzungText, useT } from '../i18n/useT'
import { AutomatikFuss } from './AutomatischBlatt'

/**
 * **„Automatisch" bei den Treffpunkten der Woche** (T121, Phase 5e): die
 * offenen Leiter besetzen oder alle leeren — wie bei den Zusammenkünften, nur
 * mit einem Bereich und ohne Umfang. Der Gruppenaufseher, der nicht zuteilt,
 * wirkt nur auf die Treffpunkte seiner Gruppe, wie im Plan darunter.
 */
export function TreffpunkteAutomatikBlatt({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = useApp()
  const { t } = useT()
  const onlyGroup = treffpunktGruppe(rechteVon(state))
  const treffpunkte = (state.fsWeeks[state.week] ?? []).filter((i) => fsInGruppe(i, onlyGroup))
  const besetzt = treffpunkte.filter((i) => i.leader).length
  const leeren = useZweiTipp(() => {
    dispatch({ type: 'fsClear', onlyGroup })
    onClose()
  })

  return (
    <Sheet label={t.autoTitel} title={t.autoTitel} onClose={onClose}>
      <div className="sheet-inhalt automatisch">
        <p className="klein-text">{t.autoHinweis}</p>
        <div className="auto-bereiche">
          <div className="auto-bereich">
            <span className="auto-bereich-text">
              <span className="auto-bereich-name">{t.fsLeiterLbl}</span>
              <span className="klein-text">{besetzungText(t, besetzt, treffpunkte.length)}</span>
            </span>
          </div>
        </div>
      </div>
      <AutomatikFuss
        zuteilen={
          besetzt < treffpunkte.length
            ? () => {
                dispatch({ type: 'fsAutoAssign', onlyGroup })
                onClose()
              }
            : null
        }
        leeren={leeren}
        leerenMoeglich={besetzt > 0}
        onClose={onClose}
      />
    </Sheet>
  )
}
