/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import {
  AppDispatchContext,
  AppStateContext,
  AppStoreContext,
  type AppState,
  useStaticStore,
} from '../app/context'
import { initialState } from '../app/init'
import { emptyQualifications, serviceQualKey } from '../data/helpers'
import type { Person, Service } from '../data/types'
import { ServicePersonsSheet } from './ServicePersonsSheet'

/**
 * T79 — die Freigabe eines Hilfsdienstes von der anderen Seite.
 *
 * Das Personen-Detail zeigt eine Person und ihre Bereiche; für einen neuen
 * Dienst hieß das: einmal durch die ganze Versammlung. Hier steht ein Bereich
 * und seine Personen.
 */

const DIENSTE: Service[] = [
  { key: 'rund', name: 'Rundgangsordner', count: 1, groups: false },
]

const person = (ln: string, dienste: string[] = []): Person => ({
  id: `p-${ln}`, fn: 'Max', ln, role: 'verkuendiger', tel: '', mail: '',
  priv: { ...emptyQualifications(), ...Object.fromEntries(dienste.map((k) => [serviceQualKey(k), true])) },
})

const PERSONEN = [person('Berger', ['rund']), person('Albrecht'), person('Winkler')]

function zeige(over: Partial<AppState> = {}) {
  const dispatch = vi.fn()
  const state: AppState = { ...initialState(), services: DIENSTE, persons: PERSONEN, ...over }
  function Buehne() {
    const store = useStaticStore(state)
    return (
      <AppDispatchContext.Provider value={dispatch}>
        <AppStoreContext.Provider value={store}>
          <AppStateContext.Provider value={state}>
            <ServicePersonsSheet svcKey="rund" />
          </AppStateContext.Provider>
        </AppStoreContext.Provider>
      </AppDispatchContext.Provider>
    )
  }
  return { dispatch, ...render(<Buehne />) }
}

afterEach(cleanup)

// Das Sheet lässt sich nach unten wegwischen; die Geste fragt zuerst, ob wir am
// Schreibtisch sitzen. jsdom kennt matchMedia nicht — hier: kein Schreibtisch.
window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia

const schalter = (c: HTMLElement) => [...c.querySelectorAll('[role="switch"]')]

describe('T79 — Freigabe-Liste eines Hilfsdienstes', () => {
  it('zeigt alle Personen und wer schon freigegeben ist', () => {
    const { container } = zeige()
    expect(schalter(container)).toHaveLength(3)
    const an = schalter(container).filter((s) => s.getAttribute('aria-checked') === 'true')
    expect(an).toHaveLength(1)
    expect(an[0]?.getAttribute('aria-label')).toContain('Berger')
    // Sortiert wie die Personenliste: nach Nachname.
    expect(schalter(container).map((s) => s.getAttribute('aria-label'))).toEqual([
      'Albrecht, Max', 'Berger, Max', 'Winkler, Max',
    ])
  })

  it('nennt im Kopf, für wie viele der Dienst freigegeben ist', () => {
    const { container } = zeige()
    expect(container.querySelector('.sheet-title')?.textContent).toBe('Rundgangsordner')
    expect(container.querySelector('.sheet-sub')?.textContent).toContain('1')
  })

  it('ein Schalter gibt genau diesen Bereich frei — und nichts sonst', () => {
    const { container, dispatch } = zeige()
    const winkler = schalter(container).find((s) => s.getAttribute('aria-label')?.includes('Winkler'))
    fireEvent.click(winkler!)
    expect(dispatch).toHaveBeenCalledWith({
      type: 'updatePerson',
      id: 'p-Winkler',
      patch: { priv: expect.objectContaining({ 'svc:rund': true }) },
    })
  })

  it('nimmt eine Freigabe auch wieder zurück', () => {
    const { container, dispatch } = zeige()
    const berger = schalter(container).find((s) => s.getAttribute('aria-label')?.includes('Berger'))
    fireEvent.click(berger!)
    expect(dispatch).toHaveBeenCalledWith({
      type: 'updatePerson',
      id: 'p-Berger',
      patch: { priv: expect.objectContaining({ 'svc:rund': false }) },
    })
  })

  it('die Suche grenzt die Liste ein', () => {
    const { container } = zeige()
    const feld = container.querySelector('.lang-search') as HTMLInputElement
    fireEvent.change(feld, { target: { value: 'wink' } })
    expect(schalter(container)).toHaveLength(1)
    expect(schalter(container)[0]?.getAttribute('aria-label')).toContain('Winkler')
  })

  it('das ✕, der Hintergrund und Escape schließen alle drei', () => {
    // Escape fehlte, während die Geschwister (Sprachauswahl, Zuteilungs-Sheet,
    // S-89) sie längst hatten. Am Schreibtisch ist die Taste der gewohnte Weg
    // hinaus — hier blieb das Blatt stehen.
    const { container, dispatch } = zeige()
    fireEvent.click(container.querySelector('.sheet-close')!)
    fireEvent.click(container.querySelector('.sheet-backdrop')!)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(dispatch.mock.calls.filter((c) => c[0].type === 'closeServiceSheet')).toHaveLength(3)
  })

  it('zu einem gelöschten Dienst zeigt es nichts', () => {
    // Der Reducer schließt das Sheet beim Löschen; falls doch einmal ein
    // Schlüssel ohne Dienst hereinkommt, darf hier kein halbes Blatt stehen.
    const { container } = zeige({ services: [] })
    expect(container.querySelector('.sheet')).toBeNull()
  })
})
