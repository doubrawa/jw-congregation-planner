import { useRef, type Dispatch, type ReactNode } from 'react'
import {
  AppDispatchContext,
  AppStateContext,
  AppStoreContext,
  useApp,
  useAppState,
  useStaticStore,
  type AppAction,
} from '../app/context'
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

/**
 * Klassen der beiden Nachbarn — ausgeschrieben, nicht zusammengesetzt.
 *
 * `week-page--${…}` wäre kürzer, aber der Name stünde dann nirgends im
 * Quelltext: eine Suche nach „week-page--vor" fand nichts, die zugehörigen
 * CSS-Regeln galten als tot und wurden entfernt. Danach lagen beide Nachbarn
 * ohne waagerechten Versatz über der aktuellen Woche — Programm und Planen
 * zeigten zwei Wochen übereinander. Ausgeschrieben ist der Name auffindbar.
 */
const SEITE = {
  '-1': 'week-page week-page--vor',
  '1': 'week-page week-page--nach',
} as const

/** Dieselben Inhalte, nur für eine benachbarte Woche und ohne Bedienbarkeit. */
function Vorschau({ offset, children }: { offset: -1 | 1; children: ReactNode }) {
  const state = useAppState()
  // Kein useMemo: `state` ist nach jeder Aktion ein neues Objekt, der Vergleich
  // ginge also ohnehin daneben — und `children` ist bei jedem Render neu, der
  // Teilbaum liefe so oder so durch. Der Spread ist billiger als der Anschein
  // von Abschirmung.
  const wert = { ...state, week: state.week + offset }
  // Der Speicher muss mit überschrieben werden, nicht nur der Kontext: sonst
  // läse ein Baustein der Vorschau den abgewandelten Zustand über `useAppState`
  // und den echten über `useAppSelector` — zwei Wochen gleichzeitig in einer
  // Ansicht (T41).
  const store = useStaticStore(wert)
  return (
    <div className={SEITE[offset]} aria-hidden="true" inert>
      {/* Überschrieben werden Zustand und Speicher; der Versand-Kontext bleibt
          der äußere und wird hier durch `keinDispatch` ersetzt — die Vorschau
          ist `inert`, ein Klick kommt gar nicht erst an. */}
      <AppDispatchContext.Provider value={keinDispatch}>
        <AppStoreContext.Provider value={store}>
          <AppStateContext.Provider value={wert}>{children}</AppStateContext.Provider>
        </AppStoreContext.Provider>
      </AppDispatchContext.Provider>
    </div>
  )
}
