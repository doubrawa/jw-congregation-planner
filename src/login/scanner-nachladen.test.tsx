/** @vitest-environment happy-dom */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import {
  AppDispatchContext,
  AppStateContext,
  AppStoreContext,
  type AppState,
  useStaticStore,
} from '../app/context'
import { demoZustand } from '../../tests/testdaten/demo-start'
import { dict } from '../i18n/ui'

/**
 * **Scheitert schon das Nachladen des Scanners, versucht es der nächste Tipp
 * neu** — ohne dass die Seite neu laden muss.
 *
 * Eine eigene Datei, weil hier das `import()` selbst scheitert, nicht der
 * Scanner beim Aufbauen (das prüft `login.test.tsx`): Das Modul darf vorher in
 * keiner Probe geladen worden sein. Ein abgelehntes Nachladen merkt sich React
 * an seinem `lazy` und wirft es bei jedem Zeichnen wieder; nur ein neues
 * `lazy` fragt noch einmal nach.
 */

vi.mock('../lib/supabase', () => ({ isSupabaseConfigured: true, supabase: null }))
vi.mock('../lib/anmelden', () => ({
  codePruefen: vi.fn(),
  mitCodeAnmelden: vi.fn(),
  mitLinkAnmelden: vi.fn(),
}))
// Der erste Abruf scheitert wie ein Bündel, das nach einem Deploy fehlt; jeder
// weitere kommt an.
const abrufe = vi.hoisted(() => ({ n: 0 }))
vi.mock('./ZettelScanner', () => {
  abrufe.n++
  if (abrufe.n === 1) throw new Error('Failed to fetch dynamically imported module')
  return {
    default: () => (
      <button type="button" className="test-scan">
        scan
      </button>
    ),
  }
})

const { LoginScreen } = await import('./LoginScreen')

const t = dict('de')

function zeige() {
  const dispatch = vi.fn()
  const state: AppState = { ...demoZustand(), screen: 'login' }
  function Buehne() {
    const store = useStaticStore(state)
    return (
      <AppDispatchContext.Provider value={dispatch}>
        <AppStoreContext.Provider value={store}>
          <AppStateContext.Provider value={state}>
            <LoginScreen />
          </AppStateContext.Provider>
        </AppStoreContext.Provider>
      </AppDispatchContext.Provider>
    )
  }
  return render(<Buehne />)
}

const knopf = (c: HTMLElement, text: string) => [...c.querySelectorAll('button')].find((b) => b.textContent?.trim() === text)

afterEach(cleanup)

describe('Zettel scannen, wenn das Nachladen scheitert', () => {
  it('erst bleibt das Eintippen, beim nächsten Tipp kommt der Scanner', async () => {
    Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia: vi.fn() }, configurable: true })
    const fehler = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const { container } = zeige()
      fireEvent.click(knopf(container, t.zettelScannen)!)
      await waitFor(() => expect(container.querySelector('h1')?.textContent).toBe(t.mitCodeAnmelden))
      expect(abrufe.n, 'das Nachladen wurde gar nicht versucht').toBe(1)

      fireEvent.click(knopf(container, t.a11yZurueck)!)
      fireEvent.click(knopf(container, t.zettelScannen)!)
      await waitFor(() => expect(container.querySelector('.test-scan')).toBeTruthy())
    } finally {
      fehler.mockRestore()
    }
  })
})
