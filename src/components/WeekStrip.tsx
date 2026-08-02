import { useRef, type Dispatch, type ReactNode } from 'react'
import { AppContext, useApp, type AppAction } from '../app/context'
import { useSwipeWeek } from './useSwipeWeek'
import './week-strip.css'

/**
 * Drei Wochen nebeneinander: vorige | aktuelle | nächste.
 *
 * Vorher wurde nur die aktuelle Woche gezeichnet. Beim Ziehen klaffte deshalb
 * am Rand der App-Untergrund, und im Moment des Loslassens erschien die neue
 * Woche schlagartig darin — auf dem Tablet ein deutliches Aufblitzen. Der
 * Ausweg war ein Standbild der alten Woche, das mit hinauswanderte: es
 * beseitigte den Sprung, nicht aber die Lücke davor.
 *
 * Jetzt sind die Nachbarwochen wirklich da. Es gibt nichts mehr zu füllen und
 * nichts mehr zu tricksen: der Streifen wird verschoben, fertig. Damit
 * entfallen Standbild und erzwungenes Zwischenrendern ersatzlos.
 *
 * Die Nachbarn liegen absolut positioniert links und rechts daneben. Das ist
 * wichtig: nur die mittlere Woche bestimmt die Höhe der Seite. Läge alles im
 * Fluss nebeneinander, richtete sich die Seitenlänge nach der längsten der
 * drei Wochen — man würde unten ins Leere scrollen.
 *
 * Sie sind reine Vorschau: `inert` hält sie aus der Tastatur-Reihenfolge und
 * vom Antippen fern, `aria-hidden` aus der Vorlesereihenfolge, und ihr
 * dispatch läuft ins Leere. Eine Vorschau darf nichts auslösen.
 */
export function WeekStrip({ children }: { children: ReactNode }) {
  const { state, dispatch } = useApp()
  const ref = useRef<HTMLDivElement>(null)
  const canPrev = state.week > 0
  const canNext = state.week < state.weeks.length - 1

  useSwipeWeek(ref, {
    onPrev: () => dispatch({ type: 'prevWeek' }),
    onNext: () => dispatch({ type: 'nextWeek' }),
    canPrev,
    canNext,
  })

  return (
    <div className="week-viewport" ref={ref}>
      <div className="week-strip">
        {canPrev && <Vorschau offset={-1}>{children}</Vorschau>}
        {children}
        {canNext && <Vorschau offset={1}>{children}</Vorschau>}
      </div>
    </div>
  )
}

/** Vorschau tut nichts — sonst löste ein Wisch nebenbei echte Änderungen aus. */
const keinDispatch: Dispatch<AppAction> = () => {}

/** Dieselben Inhalte, nur für eine benachbarte Woche und ohne Bedienbarkeit. */
function Vorschau({ offset, children }: { offset: -1 | 1; children: ReactNode }) {
  const { state } = useApp()
  // Kein useMemo: `state` ist nach jeder Aktion ein neues Objekt, der Vergleich
  // ginge also ohnehin daneben — und `children` ist bei jedem Render neu, der
  // Teilbaum liefe so oder so durch. Der Spread ist billiger als der Anschein
  // von Abschirmung.
  const wert = { state: { ...state, week: state.week + offset }, dispatch: keinDispatch }
  return (
    <div className={`week-page week-page--${offset < 0 ? 'vor' : 'nach'}`} aria-hidden="true" inert>
      <AppContext.Provider value={wert}>{children}</AppContext.Provider>
    </div>
  )
}
