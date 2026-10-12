import { useId, useState } from 'react'
import { createPortal } from 'react-dom'
import { useApp } from '../app/context'
import { ZeitraumKalender } from '../bausteine/ZeitraumKalender'
import { Sheet } from './Sheet'
import { useT } from '../i18n/useT'

/**
 * **Abwesenheit eintragen** (T121): ein Zeitraum im Kalender, ein Grund nach
 * Wunsch. In dieser Zeit teilt niemand die Person ein; wo sie schon eingeteilt
 * ist, sehen die Planer einen Konflikt.
 *
 * Über ein Portal am Ende des Dokuments: Das Blatt liegt `position: fixed`, und
 * ein Vorfahr mit `transform` würde es sonst an sich binden (siehe den
 * Vortragsplan, T122).
 */
export function AbwesenheitBlatt({ personId, onClose }: { personId: string | null; onClose: () => void }) {
  const { state, dispatch } = useApp()
  const { t } = useT()
  const [von, setVon] = useState('')
  const [bis, setBis] = useState('')
  const [grund, setGrund] = useState('')
  const grundId = useId()

  const eintragen = () => {
    if (!von || !bis) {
      dispatch({ type: 'showToast', text: t.toastVonBis })
      return
    }
    dispatch({
      type: 'addAbsence',
      // personId verknüpft die Abwesenheit mit dem Programm — ohne sie weiß die
      // Planung nicht, wer fehlt. userId bleibt der Ersteller (siehe Absence).
      absence: { id: crypto.randomUUID(), personId, userId: state.userId, from: von, to: bis, reason: grund.trim() },
    })
    onClose()
  }

  return createPortal(
    <Sheet label={t.abwEintragen} title={t.abwEintragen} onClose={onClose}>
      <div className="sheet-inhalt">
        <ZeitraumKalender
          von={von}
          bis={bis}
          lang={state.lang}
          onWahl={(v, b) => {
            setVon(v)
            setBis(b)
          }}
        />
        <div className="abw-grund">
          <label className="feld-marke" htmlFor={grundId}>
            {t.grundOpt}
          </label>
          <input
            id={grundId}
            className="feld"
            type="text"
            dir="auto"
            maxLength={120}
            placeholder={t.grundPh}
            value={grund}
            onChange={(e) => setGrund(e.target.value)}
          />
        </div>
      </div>
      <div className="abw-fuss">
        <p className="klein-text">{t.abwHinweis}</p>
        <button type="button" className="knopf-haupt" onClick={eintragen}>
          {t.abwEintragen}
        </button>
      </div>
    </Sheet>,
    document.body,
  )
}
