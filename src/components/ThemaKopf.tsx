import type { ReactNode } from 'react'
import { useApp } from '../app/context'
import { aufseherGruppe } from '../data/helpers'
import { darfPlanen, themaVon } from '../data/rechte'
import type { Thema } from '../data/types'
import { useT } from '../i18n/useT'
import './components.css'

/**
 * Kopf eines Themas (T120): der Titel — Zusammenkünfte oder Predigtdienst —
 * und, für wen das Thema zu planen ist, der Schalter **Ansehen/Planen**.
 *
 * Der Schalter wechselt nur den Bildschirm (`programm` ↔ `planen`); Woche,
 * Thema und Reiter bleiben. Wer nicht planen darf, sieht ihn gar nicht — für
 * ihn gibt es nur das Ansehen, und ein Schalter mit einer einzigen Stellung
 * wäre keiner.
 *
 * `zusatz` steht neben dem Titel (die offenen Zuteilungen beim Planen).
 * `thema` gibt der Bildschirm mit, wenn er es selbst entscheidet: Den
 * Gruppenaufseher führt `PlanenScreen` auch mit einem Reiter von früher zu den
 * Treffpunkten — der Kopf muss dann nennen, was darunter steht.
 */
export function ThemaKopf({ zusatz, thema: vorgegeben }: { zusatz?: ReactNode; thema?: Thema }) {
  const { state, dispatch } = useApp()
  const { t } = useT()
  const thema = vorgegeben ?? themaVon(state.tab)
  const fsOverseer = aufseherGruppe(state.planner, state.groups, state.personId) !== null
  const titel =
    thema === 'predigtdienst' ? t.tabFs : thema === 'weitere' ? t.navWeiterePlaene : t.navZusammenkuenfte
  const planen = state.screen === 'planen'
  return (
    <div className="screen-head thema-kopf">
      <div className="thema-kopf-titel">
        <h1 className="screen-title">{titel}</h1>
        {zusatz}
      </div>
      {darfPlanen(state.planner, fsOverseer, thema) && (
        <div className="modus-schalter" role="group" aria-label={titel}>
          <button
            type="button"
            className={planen ? 'modus-knopf' : 'modus-knopf is-active'}
            aria-pressed={!planen}
            onClick={() => planen && dispatch({ type: 'navigate', screen: 'programm', thema })}
          >
            {t.ansehen}
          </button>
          <button
            type="button"
            className={planen ? 'modus-knopf is-active' : 'modus-knopf'}
            aria-pressed={planen}
            onClick={() => planen || dispatch({ type: 'navigate', screen: 'planen', thema })}
          >
            {t.planen}
          </button>
        </div>
      )}
    </div>
  )
}
