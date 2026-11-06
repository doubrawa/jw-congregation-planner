/** @vitest-environment happy-dom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { bestaetigen } from '../../tests/zwei-tipps'
import { AppDispatchContext, AppStateContext, AppStoreContext, type AppState, useStaticStore } from '../app/context'
import { demoZustand } from '../../tests/testdaten/demo-start'
import { gebundenesDatum } from '../components/datum-anzeige'
import { dict } from '../i18n/ui'
import { fill } from '../i18n/useT'
import type { EinmalCode } from '../lib/zugang'

/**
 * **Die Karte „Anmeldung"**: ein Einmal-Code fürs nächste Gerät und
 * „Zugang erneuern". Gerufen wird die Function über `lib/zugang.ts` — hier
 * nachgestellt; was die Function dabei prüft, steht in
 * `supabase/functions/_test/anmelden.test.ts`.
 */

const einmalCodeHolen = vi.fn<() => Promise<EinmalCode | null>>()
const zugangErneuern = vi.fn<() => Promise<boolean>>()
vi.mock('../lib/zugang', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/zugang')>()),
  einmalCodeHolen: () => einmalCodeHolen(),
  zugangErneuern: () => zugangErneuern(),
}))

const { AnmeldungKarte } = await import('./AnmeldungKarte')

const t = dict('de')
const JETZT = new Date(2026, 10, 6, 14, 20)
const BIS = new Date(2026, 10, 6, 14, 35)
const CODE: EinmalCode = { code: 'K7RD 2QWM', zettelUrl: 'https://app.test/#code=K7RD2QWM', gueltigBis: BIS.toISOString() }

function zeige(over: Partial<AppState> = {}) {
  const dispatch = vi.fn()
  const state: AppState = { ...demoZustand(), dataStatus: 'ready', userId: 'u1', personId: 'p-a', ...over }
  function Buehne() {
    const store = useStaticStore(state)
    return (
      <AppDispatchContext.Provider value={dispatch}>
        <AppStoreContext.Provider value={store}>
          <AppStateContext.Provider value={state}>
            <AnmeldungKarte />
          </AppStateContext.Provider>
        </AppStoreContext.Provider>
      </AppDispatchContext.Provider>
    )
  }
  return { dispatch, ...render(<Buehne />) }
}

const knopf = (c: HTMLElement, text: string) => [...c.querySelectorAll('button')].find((b) => b.textContent === text)
const toasts = (dispatch: ReturnType<typeof vi.fn>) =>
  dispatch.mock.calls.map(([a]) => a as { type: string; text?: string }).filter((a) => a.type === 'showToast').map((a) => a.text)

beforeEach(() => {
  // Nur das Datum: Mit gefälschten Zeitgebern käme `waitFor` nicht weiter.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(JETZT)
  einmalCodeHolen.mockReset().mockResolvedValue(CODE)
  zugangErneuern.mockReset().mockResolvedValue(true)
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('Ein weiteres Gerät anmelden', () => {
  it('ohne Person keine Karte — ohne sie gibt es weder Zettel noch Code', () => {
    const { container } = zeige({ personId: null })
    expect(container.textContent).toBe('')
  })

  it('„Code anzeigen" zeigt den Code, den QR-Code, bis wann er gilt und wie es weitergeht', async () => {
    const { container } = zeige()
    fireEvent.click(knopf(container, t.codeAnzeigen)!)
    await waitFor(() => expect(container.querySelector('.anmeldung-code-wert')?.textContent).toBe('K7RD 2QWM'))
    expect(container.querySelector('svg.anmeldung-qr path')?.getAttribute('d')).toMatch(/^M\d/)
    expect(container.textContent).toContain(fill(t.einmalCodeGilt, { zeit: gebundenesDatum(BIS, 'de', 'uhrzeit') }))
    expect(container.textContent).toContain(fill(t.einmalCodeAnleitung, { knopf: t.codeEintippen }))
    expect(knopf(container, t.codeAnzeigen)).toBeUndefined()
  })

  it('läuft er ab, verschwindet er — und der Knopf ist wieder da', async () => {
    // Die Uhr steht (nur das Datum ist gefälscht); der Code gilt noch 50 ms.
    einmalCodeHolen.mockResolvedValue({ ...CODE, gueltigBis: new Date(JETZT.getTime() + 50).toISOString() })
    const { container } = zeige()
    fireEvent.click(knopf(container, t.codeAnzeigen)!)
    await waitFor(() => expect(container.querySelector('.anmeldung-code-wert')).not.toBeNull())
    await waitFor(() => expect(container.querySelector('.anmeldung-code-wert')).toBeNull())
    expect(knopf(container, t.codeAnzeigen)).toBeDefined()
  })

  it('geht es nicht, sagt es ein Hinweis — und kein Code steht da', async () => {
    einmalCodeHolen.mockResolvedValue(null)
    const { container, dispatch } = zeige()
    fireEvent.click(knopf(container, t.codeAnzeigen)!)
    await waitFor(() => expect(toasts(dispatch)).toEqual([t.zugangFehler]))
    expect(container.querySelector('.anmeldung-code-wert')).toBeNull()
  })

  it('wirft der Aufruf (etwa ein fehlendes Bündel nach einem Deploy), sagt es ein Hinweis — und der Knopf geht wieder', async () => {
    const fehler = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      einmalCodeHolen.mockRejectedValueOnce(new Error('weg'))
      const { container, dispatch } = zeige()
      fireEvent.click(knopf(container, t.codeAnzeigen)!)
      await waitFor(() => expect(toasts(dispatch)).toEqual([t.zugangFehler]))
      expect(knopf(container, t.codeAnzeigen)?.disabled).toBe(false)
      fireEvent.click(knopf(container, t.codeAnzeigen)!)
      await waitFor(() => expect(container.querySelector('.anmeldung-code-wert')?.textContent).toBe('K7RD 2QWM'))
    } finally {
      fehler.mockRestore()
    }
  })

  it('offline fragt er gar nicht erst — der Hinweis sagt, warum', () => {
    const { container, dispatch } = zeige({ staleAt: JETZT.getTime() })
    fireEvent.click(knopf(container, t.codeAnzeigen)!)
    expect(einmalCodeHolen).not.toHaveBeenCalled()
    expect(toasts(dispatch)).toEqual([t.offlineReadOnly])
  })
})

describe('Zugang erneuern', () => {
  it('fragt erst nach — der zweite Tipp erneuert, der Hinweis sagt es, ein gezeigter Code verschwindet', async () => {
    const { container, dispatch } = zeige()
    fireEvent.click(knopf(container, t.codeAnzeigen)!)
    await waitFor(() => expect(container.querySelector('.anmeldung-code-wert')).not.toBeNull())
    fireEvent.click(knopf(container, t.zugangErneuern)!)
    expect(zugangErneuern).not.toHaveBeenCalled()
    bestaetigen(knopf(container, t.zugangErneuernSicher))
    await waitFor(() => expect(toasts(dispatch)).toEqual([t.zugangErneuert]))
    expect(zugangErneuern).toHaveBeenCalledTimes(1)
    expect(container.querySelector('.anmeldung-code-wert')).toBeNull()
  })

  it('geht es nicht, sagt es der Hinweis', async () => {
    zugangErneuern.mockResolvedValue(false)
    const { container, dispatch } = zeige()
    fireEvent.click(knopf(container, t.zugangErneuern)!)
    bestaetigen(knopf(container, t.zugangErneuernSicher))
    await waitFor(() => expect(toasts(dispatch)).toEqual([t.zugangFehler]))
  })

  it('offline erneuert er nicht', () => {
    const { container, dispatch } = zeige({ staleAt: JETZT.getTime() })
    fireEvent.click(knopf(container, t.zugangErneuern)!)
    bestaetigen(knopf(container, t.zugangErneuernSicher))
    expect(zugangErneuern).not.toHaveBeenCalled()
    expect(toasts(dispatch)).toEqual([t.offlineReadOnly])
  })
})
