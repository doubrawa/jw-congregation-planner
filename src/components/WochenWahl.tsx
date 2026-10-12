import type { ReactNode } from 'react'
import { useApp } from '../app/context'
import { anlassArt } from '../data/anlass'
import { currentWeekIndex } from '../data/meeting-dates'
import type { Week } from '../data/types'
import { useT } from '../i18n/useT'
import { WeekNav } from './WeekNav'
import './components.css'

/**
 * **Die Woche wählen** (T121, Baustein `GWoche`) — beim Ansehen wie beim
 * Planen dieselbe Zeile: die Pfeile, dazwischen die Woche groß, darunter ihr
 * Anlass oder „Aktuelle Woche" und das Bibellesen. Ab dem Tablet steht die
 * Woche links gebündelt, und rechts daneben, was die Seite zur Woche anbietet
 * (`rechts` — beim Ansehen „Drucken").
 *
 * `week` ist die angezeigte Fassung (Sprachvariante), `rawWeek` die
 * kanonische: Der Anlass wird an ihr erkannt.
 */
export function WochenWahl({
  week,
  rawWeek,
  tpw,
  rechts,
}: {
  week: Week
  rawWeek: Week
  tpw: (s: string) => string
  rechts?: ReactNode
}) {
  const { state, dispatch } = useApp()
  return (
    <div className="wochenwahl">
      <WeekNav
        canPrev={state.week > 0}
        canNext={state.week < state.weeks.length - 1}
        onPrev={() => dispatch({ type: 'prevWeek' })}
        onNext={() => dispatch({ type: 'nextWeek' })}
      >
        <WochenZeile week={week} rawWeek={rawWeek} istAktuell={currentWeekIndex(state.weeks) === state.week} tpw={tpw} />
      </WeekNav>
      {rechts}
    </div>
  )
}

/**
 * Die Mitte der Wochenwahl: die Woche groß, darunter ihr Anlass — Besuch des
 * Kreisaufsehers, Gedächtnismahl, Kongress — oder, ohne Anlass, „Aktuelle
 * Woche". Daneben das Bibellesen der Woche.
 *
 * Gefragt wird über `anlassArt`, nicht über die Wirkungen (`co`/`mem`): Der
 * Kongress hat keine — er wirkt als Ausfall beider Zusammenkünfte (T64).
 */
function WochenZeile({
  week,
  rawWeek,
  istAktuell,
  tpw,
}: {
  week: Week
  rawWeek: Week
  istAktuell: boolean
  tpw: (s: string) => string
}) {
  const { t } = useT()
  const art = anlassArt(rawWeek)
  const anlass = art === 'co' ? t.coWoche : art === 'mem' ? t.memWoche : art === 'kongress' ? t.kongress : null
  return (
    <>
      <span className="woche-zeitraum">{tpw(week.range)}</span>
      <span className="woche-unterzeile">
        {anlass ? (
          <span className="woche-hinweis">{anlass}</span>
        ) : (
          istAktuell && <span className="woche-hinweis is-aktuell">{t.aktuelleWoche}</span>
        )}
        {week.book && <span className="woche-buch">{tpw(week.book)}</span>}
      </span>
    </>
  )
}
