/** @vitest-environment jsdom */
// jsdom statt happy-dom: Ein offenes Blatt liegt mit einem echten Verlaufseintrag
// im Stapel (`useBackDismiss`), und sein Schließen räumt ihn wie im Browser ab.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { demoZustand } from '../../tests/testdaten/demo-start'
import { ausklingen } from '../../tests/verlauf'
import { useBackDismiss } from '../components/useBackDismiss'
import { AppDispatchContext, AppStateContext, AppStoreContext, type AppState, useStaticStore } from './context'
import { letztesLadenBegann, loadAndHydrate } from './hydrate'
import { NACHLADEN_NACH_MS, useNachladenBeiRueckkehr } from './useNachladenBeiRueckkehr'

/**
 * **Die offene App lädt nach, wenn man zu ihr zurückkehrt** — sonst sähe, wer
 * sie im Hintergrund liegen lässt und über das Symbol zurückkommt, den alten
 * Stand. Sie lädt still nach: frühestens fünf Minuten nach dem letzten Laden,
 * nicht ohne Netz und nicht, solange ein Blatt offen ist oder ein Feld den Fokus
 * hat — was während des Ladens getippt wird, verwirft das Einspielen. Dann holt
 * sie es nach, sobald Blatt oder Feld frei sind.
 *
 * Das Laden selbst ist hier ein Mitschreiber; wie still es lädt, prüft
 * `hydrate.test.ts`.
 */

vi.mock('./hydrate', () => ({ loadAndHydrate: vi.fn(), letztesLadenBegann: vi.fn() }))
const laden = vi.mocked(loadAndHydrate)

const JETZT = new Date(2026, 10, 14, 12, 0).getTime()
/** Wann das letzte Laden begann — das Laden unten setzt es, wie das echte. */
let begonnen: number
let sichtbar: DocumentVisibilityState
let online: boolean
/** `navigator.serviceWorker` — über ihn meldet der Worker einen Push (`fensternMelden` in `sw.js`). */
let worker: EventTarget & { startMessages: () => void }

beforeEach(() => {
  worker = Object.assign(new EventTarget(), { startMessages: vi.fn() })
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, get: () => worker })
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(JETZT)
  begonnen = JETZT - NACHLADEN_NACH_MS
  sichtbar = 'hidden'
  online = true
  laden.mockReset()
  laden.mockImplementation(async () => {
    begonnen = Date.now()
  })
  vi.mocked(letztesLadenBegann).mockImplementation(() => begonnen)
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => sichtbar })
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => online })
})

afterEach(async () => {
  cleanup()
  await ausklingen()
  vi.useRealTimers()
  delete (document as { visibilityState?: unknown }).visibilityState
  delete (navigator as { onLine?: unknown }).onLine
  delete (navigator as { serviceWorker?: unknown }).serviceWorker
})

/** Eine offene Ebene im Stapel von `useBackDismiss` — ein Blatt oder eine Unteransicht. */
function Ebene({ art }: { art: 'blatt' | 'unteransicht' }) {
  useBackDismiss(true, () => {}, art)
  return null
}

function Hook() {
  useNachladenBeiRueckkehr()
  return null
}

const dispatch = vi.fn()

/** Die App mit dem Hook — wahlweise mit offenem Blatt und mit Feldern. */
function zeige(over: Partial<AppState> = {}) {
  const state: AppState = {
    ...demoZustand(),
    dataStatus: 'ready',
    congregationId: 'c1',
    userId: 'u1',
    staleAt: null,
    ...over,
  }
  function Buehne({ ebene }: { ebene: 'blatt' | 'unteransicht' | null }) {
    const store = useStaticStore(state)
    return (
      <AppDispatchContext.Provider value={dispatch}>
        <AppStoreContext.Provider value={store}>
          <AppStateContext.Provider value={state}>
            <Hook />
            {ebene && <Ebene art={ebene} />}
            <input aria-label="Name" />
            <input type="checkbox" aria-label="Schalter" />
          </AppStateContext.Provider>
        </AppStoreContext.Provider>
      </AppDispatchContext.Provider>
    )
  }
  const ansicht = render(<Buehne ebene={null} />)
  return {
    blattAuf: () => ansicht.rerender(<Buehne ebene="blatt" />),
    blattZu: () => ansicht.rerender(<Buehne ebene={null} />),
    unteransichtAuf: () => ansicht.rerender(<Buehne ebene="unteransicht" />),
    feld: (name: string) => ansicht.getByLabelText(name) as HTMLInputElement,
  }
}

/** Die App kommt zurück in den Vordergrund (am Handy aus einer anderen App). */
function zurueckkehren(): void {
  sichtbar = 'visible'
  document.dispatchEvent(new Event('visibilitychange'))
}

/** Die App geht in den Hintergrund. */
function verlassen(): void {
  sichtbar = 'hidden'
  document.dispatchEvent(new Event('visibilitychange'))
}

/** Der Worker meldet eine Nachricht — `push` bei jedem Push, `navigate` beim Tipp auf die Meldung. */
function workerMeldet(type = 'push'): void {
  worker.dispatchEvent(new MessageEvent('message', { data: { type, url: '#go=aufgaben' } }))
}

describe('Zurück in der App: still nachladen', () => {
  it('nach fünf Minuten lädt sie still nach — und sagt nichts, wenn es scheitert', () => {
    zeige()
    zurueckkehren()
    expect(laden).toHaveBeenCalledTimes(1)
    expect(laden).toHaveBeenCalledWith(dispatch, 'u1', { silent: true, ohneHinweis: true })
  })

  it('Gegenprobe: kurz nach dem letzten Laden nicht — App-Wechsel kommen im Sekundentakt', () => {
    begonnen = JETZT - NACHLADEN_NACH_MS + 1
    zeige()
    zurueckkehren()
    expect(laden).not.toHaveBeenCalled()
  })

  it('am Computer reicht der Fokus zurück ins Fenster — und beides zusammen lädt einmal', () => {
    zeige()
    sichtbar = 'visible'
    window.dispatchEvent(new Event('focus'))
    expect(laden).toHaveBeenCalledTimes(1)
    zurueckkehren()
    expect(laden).toHaveBeenCalledTimes(1)
  })

  it('wer die App verlässt, löst nichts aus', () => {
    zeige()
    document.dispatchEvent(new Event('visibilitychange'))
    expect(laden).not.toHaveBeenCalled()
  })

  it.each([
    ['ohne Konto', { userId: null }],
    ['solange die App noch lädt', { dataStatus: 'loading' as const }],
    ['über dem letzten Stand — dort lädt der Provider, sobald das Netz zurück ist', { staleAt: JETZT - 60_000 }],
  ])('nicht %s', (_fall, over) => {
    zeige(over)
    zurueckkehren()
    expect(laden).not.toHaveBeenCalled()
  })

  it('nicht ohne Netz', () => {
    online = false
    zeige()
    zurueckkehren()
    expect(laden).not.toHaveBeenCalled()
  })
})

/*
 * **Nicht unter den Fingern.** Was während des Ladens getippt und noch nicht
 * gespeichert ist, verwirft das Einspielen (`wartendesVerwerfen`). Im Blatt für
 * Name oder Saal der Versammlung geht jeder Buchstabe sofort in den Zustand —
 * ein Nachladen in diesem Augenblick nähme die letzten wieder weg.
 */
describe('Zurück in der App: nicht, solange ein Blatt offen ist oder ein Feld den Fokus hat', () => {
  it('ein offenes Blatt hält es auf — sobald es zu ist, wird nachgeholt', async () => {
    const app = zeige()
    app.blattAuf()
    zurueckkehren()
    expect(laden).not.toHaveBeenCalled()
    app.blattZu()
    await vi.waitFor(() => expect(laden).toHaveBeenCalledTimes(1))
    expect(laden).toHaveBeenCalledWith(dispatch, 'u1', { silent: true, ohneHinweis: true })
  })

  it('eine Unteransicht hält nichts auf — ein Personen-Detail soll den frischen Stand zeigen', () => {
    const app = zeige()
    app.unteransichtAuf()
    zurueckkehren()
    expect(laden).toHaveBeenCalledTimes(1)
  })

  it('ein Feld im Fokus hält es auf — sobald es verlassen ist, wird nachgeholt', async () => {
    const app = zeige()
    app.feld('Name').focus()
    zurueckkehren()
    expect(laden).not.toHaveBeenCalled()
    app.feld('Name').blur()
    await vi.waitFor(() => expect(laden).toHaveBeenCalledTimes(1))
  })

  it('… nicht, solange der Fokus von einem Feld ins nächste wandert', async () => {
    const app = zeige()
    app.feld('Name').focus()
    zurueckkehren()
    app.feld('Schalter').focus()
    app.feld('Name').focus()
    await ausklingen()
    expect(laden).not.toHaveBeenCalled()
  })

  it('ein Schalter im Fokus hält nichts auf — in ihn tippt man nicht', () => {
    const app = zeige()
    app.feld('Schalter').focus()
    zurueckkehren()
    expect(laden).toHaveBeenCalledTimes(1)
  })

  it('ohne Rückkehr holt das Schließen nichts nach', async () => {
    const app = zeige()
    app.blattAuf()
    app.blattZu()
    await ausklingen()
    expect(laden).not.toHaveBeenCalled()
  })

  it('hat inzwischen etwas anderes geladen (ein Push-Tipp), holt das Schließen nichts nach', async () => {
    const app = zeige()
    app.blattAuf()
    zurueckkehren()
    begonnen = Date.now()
    app.blattZu()
    await ausklingen()
    expect(laden).not.toHaveBeenCalled()
  })
})

/*
 * **Nach einem Push gilt die Frist nicht.** Den Push zeigt der Worker, samt
 * Zahl am Symbol. Lüde die Rückkehr erst nach fünf Minuten, sagte das Symbol
 * 3, „Meine Aufgaben" 2 — und wer dort zusagte, setzte es auf 1.
 */
describe('Nach einem Push: ohne Frist nachladen', () => {
  const KURZ_DANACH = JETZT - 60_000

  it('kam ein Push, lädt die Rückkehr auch eine Minute nach dem letzten Laden', () => {
    begonnen = KURZ_DANACH
    zeige()
    workerMeldet()
    expect(laden).not.toHaveBeenCalled()
    zurueckkehren()
    expect(laden).toHaveBeenCalledTimes(1)
    expect(laden).toHaveBeenCalledWith(dispatch, 'u1', { silent: true, ohneHinweis: true })
  })

  it('ist die App beim Push sichtbar, lädt sie gleich', () => {
    begonnen = KURZ_DANACH
    sichtbar = 'visible'
    zeige()
    workerMeldet()
    expect(laden).toHaveBeenCalledTimes(1)
  })

  it('… aber nicht unter den Fingern: Mit offenem Blatt lädt sie erst nach dem Schließen', async () => {
    begonnen = KURZ_DANACH
    sichtbar = 'visible'
    const app = zeige()
    app.blattAuf()
    workerMeldet()
    expect(laden).not.toHaveBeenCalled()
    app.blattZu()
    await vi.waitFor(() => expect(laden).toHaveBeenCalledTimes(1))
  })

  it('ein Push zählt einmal: Nach dem Laden gilt wieder die Frist', () => {
    begonnen = KURZ_DANACH
    zeige()
    workerMeldet()
    zurueckkehren()
    verlassen()
    zurueckkehren()
    expect(laden).toHaveBeenCalledTimes(1)
  })

  it('Gegenprobe: Der Tipp auf eine Meldung (`navigate`) hebt die Frist nicht auf — dort lädt die App selbst', () => {
    begonnen = KURZ_DANACH
    zeige()
    workerMeldet('navigate')
    zurueckkehren()
    expect(laden).not.toHaveBeenCalled()
  })

  it('ohne Netz auch nach einem Push nicht', () => {
    begonnen = KURZ_DANACH
    online = false
    zeige()
    workerMeldet()
    zurueckkehren()
    expect(laden).not.toHaveBeenCalled()
  })
})
