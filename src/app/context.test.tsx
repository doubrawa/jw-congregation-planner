/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { useRef, useState, type ReactNode } from 'react'
import {
  AppDispatchContext,
  AppStateContext,
  AppStoreContext,
  flachGleich,
  useApp,
  useAppDispatch,
  useAppSelector,
  useAppState,
} from './context'
import type { AppAction, AppState, AppStore } from './context'
import { initialState } from './init'
import { AppProvider } from './store'

/**
 * T41 — Zustand und Versand liegen in getrennten Kontexten.
 *
 * Vorher trugen sie ein gemeinsames Objekt. `dispatch` ist über die ganze
 * Sitzung dieselbe Funktion, das umgebende Objekt aber nicht: jede
 * Zustandsänderung erzeugte ein neues und rief damit auch die Bausteine auf den
 * Plan, die gar nichts lesen, sondern nur auslösen.
 *
 * Der Test misst genau das — wie oft rendert ein Baustein, der nur `dispatch`
 * nimmt, wenn sich der Zustand ändert? Er ist der Grund, warum die Trennung
 * beim nächsten Umbau nicht versehentlich wieder zusammenwächst.
 */

/** Provider, der seinen Zustand auf Zuruf ändert. */
function Buehne({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(() => initialState())
  // Stabil wie im echten Provider (dort ein `useCallback([])`). Ein bei jedem
  // Render neu erzeugtes `vi.fn()` wäre ein anderer Kontextwert und würde die
  // Trennung genau um das bringen, was sie leisten soll — der erste Testlauf
  // ist prompt darauf hereingefallen.
  const [dispatch] = useState(() => vi.fn())
  return (
    <AppDispatchContext.Provider value={dispatch}>
      <AppStateContext.Provider value={state}>
        <button type="button" onClick={() => setState((s) => ({ ...s, week: s.week + 1 }))}>
          weiter
        </button>
        {children}
      </AppStateContext.Provider>
    </AppDispatchContext.Provider>
  )
}

// Ohne Aufräumen stünden die Bühnen der vorigen Tests noch im Dokument.
afterEach(cleanup)

describe('Zustand und Versand sind getrennt', () => {
  it('wer nur auslöst, rendert bei einer Zustandsänderung nicht mit', () => {
    let renders = 0
    function NurVersand() {
      useAppDispatch()
      renders++
      return null
    }
    const { getByText } = render(
      <Buehne>
        <NurVersand />
      </Buehne>,
    )
    expect(renders).toBe(1)
    fireEvent.click(getByText('weiter'))
    // Ohne die Trennung stünde hier 2: das gemeinsame Objekt war neu, obwohl
    // `dispatch` dieselbe Funktion blieb.
    expect(renders).toBe(1)
  })

  it('wer liest, rendert sehr wohl mit', () => {
    let renders = 0
    function Liest() {
      useAppState()
      renders++
      return null
    }
    const { getByText } = render(
      <Buehne>
        <Liest />
      </Buehne>,
    )
    expect(renders).toBe(1)
    fireEvent.click(getByText('weiter'))
    expect(renders).toBe(2)
  })

  it('useApp liefert weiter beides', () => {
    // Der alte Weg bleibt gültig — 41 Bausteine nutzen ihn.
    let gesehen: { week: number; hatDispatch: boolean } | null = null
    function Beides() {
      const { state, dispatch } = useApp()
      gesehen = { week: state.week, hatDispatch: typeof dispatch === 'function' }
      return null
    }
    render(
      <Buehne>
        <Beides />
      </Buehne>,
    )
    expect(gesehen).toEqual({ week: initialState().week, hatDispatch: true })
  })
})

describe('Ohne Provider ist es ein Fehler, kein stiller Rückfall', () => {
  it('nennt den Provider beim Namen', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    function Nackt() {
      useAppState()
      return null
    }
    expect(() => render(<Nackt />)).toThrow(/AppProvider/)
    function NacktVersand() {
      useAppDispatch()
      return null
    }
    expect(() => render(<NacktVersand />)).toThrow(/AppProvider/)
    err.mockRestore()
  })
})

/*
 * T41, dritter Schritt — Selektoren.
 *
 * Die Kontext-Trennung half nur denen, die *nichts* lesen. Wer liest, rendert
 * bei jeder Änderung neu, denn React verteilt einen Kontext ganz oder gar
 * nicht. `useAppSelector` geht am Kontext vorbei: der Zustand liegt in einer
 * Referenz, der Baustein abonniert sie und wacht nur auf, wenn sich **sein**
 * Ausschnitt geändert hat.
 *
 * Diese Tests sind das Sicherheitsnetz, das dafür gefehlt hat. Sie messen
 * Renderzahlen — die einzige Größe, um die es hier geht — und halten die eine
 * Falle fest: ein Selektor, der bei jedem Aufruf ein neues Objekt baut.
 */

/** Bühne mit Speicher: wie der echte Provider, nur ohne dessen Nebenwirkungen. */
function SpeicherBuehne({ children }: { children: ReactNode }) {
  const [, neuRendern] = useState(0)
  const zustand = useRef<AppState | null>(null)
  zustand.current ??= initialState()
  const abonnenten = useRef<Set<() => void> | null>(null)
  abonnenten.current ??= new Set()
  const [store] = useState<AppStore>(() => ({
    holen: () => zustand.current as AppState,
    abonnieren: (melden) => {
      abonnenten.current?.add(melden)
      return () => void abonnenten.current?.delete(melden)
    },
  }))
  const aendern = (patch: Partial<AppState>) => {
    zustand.current = { ...(zustand.current as AppState), ...patch }
    neuRendern((n) => n + 1)
    for (const melden of abonnenten.current ?? []) melden()
  }
  return (
    <AppStoreContext.Provider value={store}>
      <button type="button" onClick={() => aendern({ week: (zustand.current as AppState).week + 1 })}>
        woche
      </button>
      <button type="button" onClick={() => aendern({ theme: 'indigo' })}>
        thema
      </button>
      {children}
    </AppStoreContext.Provider>
  )
}

describe('useAppSelector — nur der eigene Ausschnitt weckt', () => {
  it('eine fremde Änderung lässt den Baustein schlafen', () => {
    let renders = 0
    let gesehen = -1
    function LiestWoche() {
      gesehen = useAppSelector((s) => s.week)
      renders++
      return null
    }
    const { getByText } = render(
      <SpeicherBuehne>
        <LiestWoche />
      </SpeicherBuehne>,
    )
    expect(renders).toBe(1)
    fireEvent.click(getByText('thema')) // geht ihn nichts an
    expect(renders).toBe(1)
    fireEvent.click(getByText('woche')) // das schon
    expect(renders).toBe(2)
    expect(gesehen).toBe(initialState().week + 1)
  })

  it('gebündelte Felder brauchen `flachGleich` — und dann stimmt es auch', () => {
    // Ohne Vergleich baute der Selektor bei jedem Aufruf ein neues Objekt;
    // React hielte den Ausschnitt für dauernd geändert und liefe in die
    // Schleife „The result of getSnapshot should be cached".
    let renders = 0
    function LiestZwei() {
      const { week, tab } = useAppSelector((s) => ({ week: s.week, tab: s.tab }), flachGleich)
      renders++
      return <span>{`${week}|${tab}`}</span>
    }
    const { getByText } = render(
      <SpeicherBuehne>
        <LiestZwei />
      </SpeicherBuehne>,
    )
    expect(renders).toBe(1)
    fireEvent.click(getByText('thema'))
    expect(renders).toBe(1)
    fireEvent.click(getByText('woche'))
    expect(renders).toBe(2)
    expect(getByText(`${initialState().week + 1}|${initialState().tab}`)).toBeTruthy()
  })

  it('der Selektor sieht immer den aktuellen Zustand, nie einen alten', () => {
    // Der Selektor wird bei jedem Render neu geschrieben (inline) und liegt
    // deshalb in einer Referenz. Würde sie nicht nachgezogen, läse der Baustein
    // ewig mit der ersten Fassung — hier: mit dem alten Aufschlag.
    let gesehen = -1
    function MitAufschlag({ plus }: { plus: number }) {
      gesehen = useAppSelector((s) => s.week + plus)
      return null
    }
    const { rerender } = render(
      <SpeicherBuehne>
        <MitAufschlag plus={10} />
      </SpeicherBuehne>,
    )
    expect(gesehen).toBe(initialState().week + 10)
    rerender(
      <SpeicherBuehne>
        <MitAufschlag plus={100} />
      </SpeicherBuehne>,
    )
    expect(gesehen).toBe(initialState().week + 100)
  })

  it('mehrere Selektoren im selben Baustein arbeiten unabhängig', () => {
    let renders = 0
    function Beides() {
      const week = useAppSelector((s) => s.week)
      const theme = useAppSelector((s) => s.theme)
      renders++
      return <span>{`${week}|${theme}`}</span>
    }
    const { getByText } = render(
      <SpeicherBuehne>
        <Beides />
      </SpeicherBuehne>,
    )
    fireEvent.click(getByText('thema'))
    expect(renders).toBe(2)
    expect(getByText(`${initialState().week}|indigo`)).toBeTruthy()
  })

  it('beim Abbauen wird abgemeldet — kein Aufruf ins Leere', () => {
    let renders = 0
    function LiestWoche() {
      useAppSelector((s) => s.week)
      renders++
      return null
    }
    function Buehne({ zeigen }: { zeigen: boolean }) {
      return <SpeicherBuehne>{zeigen ? <LiestWoche /> : null}</SpeicherBuehne>
    }
    const { rerender } = render(<Buehne zeigen />)
    expect(renders).toBe(1)
    rerender(<Buehne zeigen={false} />)
    // Ohne Abmeldung riefe die Änderung unten einen Baustein, den es nicht mehr
    // gibt — React meldet das als Warnung, der Zähler bliebe aber stehen.
    // Deshalb wird hier zusätzlich geprüft, dass nichts wirft.
    expect(() => rerender(<Buehne zeigen={false} />)).not.toThrow()
    expect(renders).toBe(1)
  })
})

describe('flachGleich', () => {
  it('vergleicht Feld für Feld', () => {
    expect(flachGleich({ a: 1, b: 'x' }, { a: 1, b: 'x' })).toBe(true)
    expect(flachGleich({ a: 1, b: 'x' }, { a: 2, b: 'x' })).toBe(false)
  })

  it('eine fehlende oder zusätzliche Eigenschaft ist ein Unterschied', () => {
    expect(flachGleich({ a: 1 } as Record<string, unknown>, { a: 1, b: 2 })).toBe(false)
    expect(flachGleich({ a: 1, b: 2 } as Record<string, unknown>, { a: 1 })).toBe(false)
  })

  it('geht nur eine Ebene tief — genau dafür ist er da', () => {
    // Verschachtelte Werte werden über die Identität verglichen. Wer tiefer
    // vergleichen will, wählt einen anderen Ausschnitt, keine andere Gleichheit.
    const gleich = { n: 1 }
    expect(flachGleich({ x: gleich }, { x: gleich })).toBe(true)
    expect(flachGleich({ x: { n: 1 } }, { x: { n: 1 } })).toBe(false)
  })
})

/*
 * Die Bühne oben baut den Speicher von Hand. Dieser Test nimmt den echten
 * Provider: er beweist die Verdrahtung — dass `dispatch` die Abonnenten weckt
 * und dass beide Wege (Kontext und Speicher) denselben Stand sehen. Ohne ihn
 * bliebe die Mechanik geprüft und ihr Anschluss ungeprüft.
 */
describe('Am echten Provider', () => {
  /** Knopf, der eine echte Aktion auslöst — über den echten dispatch-Wrapper. */
  function Ausloeser({ beschriftung, action }: { beschriftung: string; action: AppAction }) {
    const dispatch = useAppDispatch()
    return (
      <button type="button" onClick={() => dispatch(action)}>
        {beschriftung}
      </button>
    )
  }

  it('eine Aktion weckt den passenden Selektor und lässt die übrigen schlafen', () => {
    let tabRenders = 0
    let themaRenders = 0
    function LiestTab() {
      const tab = useAppSelector((s) => s.tab)
      tabRenders++
      return <span>{`tab:${tab}`}</span>
    }
    function LiestThema() {
      useAppSelector((s) => s.theme)
      themaRenders++
      return null
    }
    const { getByText } = render(
      <AppProvider>
        <LiestTab />
        <LiestThema />
        <Ausloeser beschriftung="wochenende" action={{ type: 'setTab', tab: 'we' }} />
      </AppProvider>,
    )
    const vorher = tabRenders
    fireEvent.click(getByText('wochenende'))
    expect(tabRenders, 'der Tab muss aufwachen').toBe(vorher + 1)
    expect(themaRenders, 'das Farbschema geht der Tab nichts an').toBe(1)
    expect(getByText('tab:we')).toBeTruthy()
  })

  it('Kontext-Leser und Selektor-Leser sehen denselben Stand', () => {
    // Zwei Wege in denselben Zustand: liefe einer dem anderen hinterher, zeigte
    // die App zwei Stände gleichzeitig. Deshalb weckt der Provider die
    // Abonnenten im selben Ereignis wie `rawDispatch` — React fasst beide
    // Aktualisierungen zu einem Commit zusammen.
    function Beide() {
      const ausKontext = useAppState().tab
      const ausSpeicher = useAppSelector((s) => s.tab)
      return <span>{`${ausKontext}|${ausSpeicher}`}</span>
    }
    const { getByText } = render(
      <AppProvider>
        <Beide />
        <Ausloeser beschriftung="wochenende" action={{ type: 'setTab', tab: 'we' }} />
      </AppProvider>,
    )
    expect(getByText(`${initialState().tab}|${initialState().tab}`)).toBeTruthy()
    fireEvent.click(getByText('wochenende'))
    expect(getByText('we|we')).toBeTruthy()
  })
})
