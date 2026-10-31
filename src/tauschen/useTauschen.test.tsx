/** @vitest-environment happy-dom */
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppDispatchContext, AppStateContext, AppStoreContext, type AppState, useStaticStore } from '../app/context'
import type { TauschAnfrage } from '../data/tausch'
import { DE } from '../i18n/de'
import { demoZustand } from '../../tests/testdaten/demo-start'

/**
 * **Was der Hook mit den Antworten der Function macht** (31.10.2026). Die
 * Oberflächen-Tests gehen die geglückten Wege; hier stehen die übrigen:
 * offline, ohne eigene Person, gescheitert — und wann die App deshalb
 * nachlädt. Die Function selbst prüft `supabase/functions/_test/tauschen.test.ts`.
 */

const lib = vi.hoisted(() => ({
  tauschAngebote: vi.fn(),
  tauschAnfragen: vi.fn(),
  tauschDirekt: vi.fn(),
  tauschZurueckziehen: vi.fn(),
  tauschAblehnen: vi.fn(),
  tauschAnnehmen: vi.fn(),
}))
vi.mock('../lib/tauschen', () => lib)
const nachladen = vi.hoisted(() => vi.fn())
vi.mock('../app/hydrate', () => ({ loadAndHydrate: nachladen }))

const { useTauschen, useTauschFehler } = await import('./useTauschen')

const ANFRAGE: TauschAnfrage = { id: 'a1', von: 'p9', an: 'p1', gibtAb: '2026-09-13|we|helper|mik|0', nimmt: '2026-09-20|we|helper|mik|0', bis: '2026-09-13' }
const ANGEBOT = { nimmt: '2026-09-20|we|helper|mik|0', personId: 'p1', konto: false }

function zustand(over: Partial<AppState> = {}): AppState {
  return { ...demoZustand(), dataStatus: 'ready', userId: 'u1', personId: 'p9', staleAt: null, ...over }
}

/** Der Zustand als Kontext um den Hook — `dispatch` zum Mitschreiben. */
function rahmenFuer(state: AppState, dispatch: (a: unknown) => void) {
  return function Rahmen({ children }: { children: ReactNode }) {
    const store = useStaticStore(state)
    return (
      <AppDispatchContext.Provider value={dispatch}>
        <AppStoreContext.Provider value={store}>
          <AppStateContext.Provider value={state}>{children}</AppStateContext.Provider>
        </AppStoreContext.Provider>
      </AppDispatchContext.Provider>
    )
  }
}

function mitZustand(state: AppState) {
  const dispatch = vi.fn()
  const { result } = renderHook(() => useTauschen(), { wrapper: rahmenFuer(state, dispatch) })
  return { result, dispatch }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useTauschen: was ohne Verbindung und ohne Person geht', () => {
  it('offline fragt sie nichts an — und liest auch keine Angebote', async () => {
    const { result } = mitZustand(zustand({ staleAt: Date.now() }))
    expect(await result.current.angebote(ANFRAGE.gibtAb)).toEqual({ ok: false, fehler: 'offline' })
    expect(await result.current.annehmen(ANFRAGE)).toBe('offline')
    expect(lib.tauschAngebote).not.toHaveBeenCalled()
    expect(lib.tauschAnnehmen).not.toHaveBeenCalled()
  })

  it('ohne eigene Person gibt es nichts zu tauschen', async () => {
    const { result } = mitZustand(zustand({ personId: null }))
    expect(await result.current.angebote(ANFRAGE.gibtAb)).toEqual({ ok: false, fehler: 'offline' })
    expect(await result.current.anfragen(ANFRAGE.gibtAb, ANGEBOT)).toBe('offline')
    expect(await result.current.direkt(ANFRAGE.gibtAb, ANGEBOT)).toBe('offline')
    expect(lib.tauschAnfragen).not.toHaveBeenCalled()
    expect(lib.tauschDirekt).not.toHaveBeenCalled()
  })
})

describe('useTauschen: was nach einem Aufruf geschieht', () => {
  it('scheitert er am Stand, lädt die App still nach — am Netz nicht, das ist kein neuer Stand', async () => {
    const { result } = mitZustand(zustand())
    lib.tauschAnfragen.mockResolvedValueOnce({ ok: false, fehler: 'stand' })
    expect(await act(() => result.current.anfragen(ANFRAGE.gibtAb, ANGEBOT))).toBe('stand')
    expect(nachladen).toHaveBeenCalledWith(expect.any(Function), 'u1', { silent: true })
    nachladen.mockClear()
    lib.tauschAnfragen.mockResolvedValueOnce({ ok: false, fehler: 'netz' })
    expect(await act(() => result.current.anfragen(ANFRAGE.gibtAb, ANGEBOT))).toBe('netz')
    expect(nachladen).not.toHaveBeenCalled()
  })

  it('direkt getauscht: der Tausch steht im Zustand, mit „ohne Konto"', async () => {
    const { result, dispatch } = mitZustand(zustand())
    lib.tauschDirekt.mockResolvedValueOnce({ ok: true, wert: undefined })
    expect(await act(() => result.current.direkt(ANFRAGE.gibtAb, ANGEBOT))).toBeNull()
    expect(dispatch).toHaveBeenCalledWith({
      type: 'getauscht',
      tausch: { von: 'p9', an: 'p1', gibtAb: ANFRAGE.gibtAb, nimmt: ANGEBOT.nimmt },
      ohneKonto: true,
    })
    lib.tauschDirekt.mockResolvedValueOnce({ ok: false, fehler: 'has-account' })
    dispatch.mockClear()
    expect(await act(() => result.current.direkt(ANFRAGE.gibtAb, ANGEBOT))).toBe('has-account')
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'getauscht' }))
  })

  it('ablehnen und zurückziehen: Die Anfrage geht, wenn es glückt oder sie schon fort ist — sonst bleibt sie', async () => {
    const { result, dispatch } = mitZustand(zustand())
    lib.tauschAblehnen.mockResolvedValueOnce({ ok: true, wert: undefined })
    expect(await act(() => result.current.ablehnen(ANFRAGE))).toBeNull()
    expect(dispatch).toHaveBeenCalledWith({ type: 'tauschWeg', id: 'a1' })
    dispatch.mockClear()
    lib.tauschZurueckziehen.mockResolvedValueOnce({ ok: false, fehler: 'gone' })
    expect(await act(() => result.current.zurueckziehen(ANFRAGE))).toBe('gone')
    expect(dispatch).toHaveBeenCalledWith({ type: 'tauschWeg', id: 'a1' })
    dispatch.mockClear()
    lib.tauschZurueckziehen.mockResolvedValueOnce({ ok: false, fehler: 'netz' })
    expect(await act(() => result.current.zurueckziehen(ANFRAGE))).toBe('netz')
    expect(dispatch).not.toHaveBeenCalledWith({ type: 'tauschWeg', id: 'a1' })
  })

  it('annehmen: getauscht, fort oder gescheitert — nur „fort" räumt die Anfrage weg', async () => {
    const { result, dispatch } = mitZustand(zustand())
    lib.tauschAnnehmen.mockResolvedValueOnce({ ok: true, wert: undefined })
    expect(await act(() => result.current.annehmen(ANFRAGE))).toBeNull()
    expect(dispatch).toHaveBeenCalledWith({ type: 'getauscht', tausch: ANFRAGE })
    dispatch.mockClear()
    lib.tauschAnnehmen.mockResolvedValueOnce({ ok: false, fehler: 'gone' })
    expect(await act(() => result.current.annehmen(ANFRAGE))).toBe('gone')
    expect(dispatch).toHaveBeenCalledWith({ type: 'tauschWeg', id: 'a1' })
    dispatch.mockClear()
    lib.tauschAnnehmen.mockResolvedValueOnce({ ok: false, fehler: 'stand' })
    expect(await act(() => result.current.annehmen(ANFRAGE))).toBe('stand')
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'tauschWeg' }))
  })

  it('wirft der Aufruf, sind die Knöpfe danach wieder frei', async () => {
    const { result } = mitZustand(zustand())
    lib.tauschAnnehmen.mockRejectedValueOnce(new Error('kaputt'))
    await act(async () => {
      await expect(result.current.annehmen(ANFRAGE)).rejects.toThrow('kaputt')
    })
    expect(result.current.laeuft).toBe(false)
  })
})

describe('useTauschFehler', () => {
  it('nennt den Grund des gescheiterten Schritts — und räumt ihn, wenn der nächste glückt', async () => {
    const { result } = renderHook(() => useTauschFehler(), { wrapper: rahmenFuer(zustand(), vi.fn()) })
    await act(() => result.current.ausfuehren(async () => 'already-asked'))
    expect(result.current.fehler).toBe(DE.tauschFehlerSchonGefragt)
    await act(() => result.current.ausfuehren(async () => null))
    expect(result.current.fehler).toBeNull()
  })
})
