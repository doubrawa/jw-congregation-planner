import { useState } from 'react'
import { useApp } from '../app/context'
import { anwesendGesamt, zaehltSchon } from '../data/anwesenheit'
import { nameVon } from '../data/helpers'
import type { MeetingKey, Week } from '../data/types'
import { fill, useT } from '../i18n/useT'
import { AnwesenheitBlatt } from './AnwesenheitBlatt'
import { useAnwesenheit } from './useAnwesenheit'
import './anwesenheit.css'

/**
 * **Die Anwesenden im Programm** (T152): nach Beginn der Zusammenkunft
 * „Anwesend: 87", darunter im Saal und per Video. Wer eintragen darf, ändert
 * hier — und sieht, wenn die Zahl fehlt, „Anwesende fehlen" mit „Eintragen".
 * Wer nicht eintragen darf, sieht ohne Zahl nichts.
 */
export function AnwesenheitZeile({ week, tab }: { week: Week; tab: MeetingKey }) {
  const { state } = useApp()
  const { t } = useT()
  const { eintrag, darf } = useAnwesenheit(week, tab)
  const [offen, setOffen] = useState(false)
  if (!zaehltSchon(week, tab, state.congregation.times, new Date())) return null
  const gesamt = anwesendGesamt(eintrag)
  if (gesamt === null && !darf) return null

  // `fill` bindet jede Zahl an ihr Wort (T128).
  const teile = [
    eintrag?.saal != null ? fill(t.anwesendSaalN, { n: eintrag.saal }) : '',
    eintrag?.video != null ? fill(t.anwesendVideoN, { n: eintrag.video }) : '',
  ].filter(Boolean)
  const von = darf ? nameVon(state.persons, eintrag?.pid ?? null) : ''
  return (
    <section className="karte anwesend-zeile" aria-label={t.anwesendTitel}>
      <div className="anwesend-zeile-text">
        {gesamt !== null ? (
          <span className="anwesend-gesamt">{fill(t.anwesendZahl, { n: gesamt })}</span>
        ) : (
          <span className="anwesend-gesamt is-fehlt">{t.anwesendFehlt}</span>
        )}
        {teile.length > 0 && <span className="klein-text">{teile.join(' · ')}</span>}
        {von && <span className="klein-text">{fill(t.anwesendVon, { name: von })}</span>}
      </div>
      {darf && (
        <button type="button" className="knopf-pille" onClick={() => setOffen(true)}>
          {gesamt === null ? t.anwesendEintragen : t.aendern}
        </button>
      )}
      {offen && <AnwesenheitBlatt week={week} tab={tab} onClose={() => setOffen(false)} />}
    </section>
  )
}
