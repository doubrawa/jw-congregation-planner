/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { DE } from '../i18n/de'
import {
  AppDispatchContext,
  AppStateContext,
  AppStoreContext,
  type AppState,
  useStaticStore,
} from '../app/context'
import { demoZustand } from '../../tests/testdaten/demo-start'
import { emptyQualifications, serviceQualKey } from '../data/helpers'
import type { Person, Service } from '../data/types'
import { HilfsdienstBlatt } from './HilfsdienstBlatt'

/**
 * **Ein Hilfsdienst** — wer ihn übernehmen darf (T79), seine Stelle in der
 * Folge und Entfernen (T121, Phase 6c-2).
 *
 * Das Personen-Detail zeigt eine Person und ihre Bereiche; für einen neuen
 * Dienst hieß das: einmal durch die ganze Versammlung. Hier steht ein Bereich
 * und seine Personen.
 */

const DIENSTE: Service[] = [
  { key: 'rund', name: 'Rundgangsordner', count: 1, groups: false },
  { key: 'mik', name: 'Mikrofone', count: 2, groups: false },
  { key: 'rein', name: 'Reinigung', count: 1, groups: true },
]

const person = (ln: string, dienste: string[] = []): Person => ({
  id: `p-${ln}`, fn: 'Max', ln, role: 'verkuendiger', tel: '', mail: '',
  priv: { ...emptyQualifications(), ...Object.fromEntries(dienste.map((k) => [serviceQualKey(k), true])) },
})

const PERSONEN = [person('Berger', ['rund']), person('Albrecht'), person('Winkler')]

function zeige(over: Partial<AppState> = {}, svcKey = 'rund') {
  const dispatch = vi.fn()
  const state: AppState = { ...demoZustand(), services: DIENSTE, persons: PERSONEN, ...over }
  function Buehne() {
    const store = useStaticStore(state)
    return (
      <AppDispatchContext.Provider value={dispatch}>
        <AppStoreContext.Provider value={store}>
          <AppStateContext.Provider value={state}>
            <HilfsdienstBlatt svcKey={svcKey} />
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

  it('sie sucht wie über der Personenliste — auch „Vorname Nachname"', () => {
    // Bis zur Phase 6c-2 fand sie nur „Nachname, Vorname", wie die Zeile ihn zeigt.
    const { container } = zeige()
    fireEvent.change(container.querySelector('.lang-search')!, { target: { value: 'max berger' } })
    expect(schalter(container).map((s) => s.getAttribute('aria-label'))).toEqual(['Berger, Max'])
  })

  it('das ✕, der Hintergrund und Escape schließen alle drei', () => {
    // Escape fehlte, während die Geschwister (Sprachauswahl, Zuteilungs-Sheet,
    // S-89) sie längst hatten. Am Schreibtisch ist die Taste der gewohnte Weg
    // hinaus — hier blieb das Blatt stehen.
    const { container, dispatch } = zeige()
    fireEvent.click(container.querySelector(`[aria-label="${DE.a11yClose}"]`)!)
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

const knopf = (c: HTMLElement, text: string) => [...c.querySelectorAll('button')].find((b) => b.textContent === text)!

describe('Die Reihenfolge — sie gilt auch im Programm', () => {
  it('„Nach oben" und „Nach unten" verschieben den Dienst um eine Stelle', () => {
    const { container, dispatch } = zeige({}, 'mik')
    fireEvent.click(knopf(container, DE.a11yMoveUp))
    expect(dispatch).toHaveBeenCalledWith({ type: 'moveService', key: 'mik', dir: -1 })
    fireEvent.click(knopf(container, DE.a11yMoveDown))
    expect(dispatch).toHaveBeenCalledWith({ type: 'moveService', key: 'mik', dir: 1 })
  })

  it('am Rand ist die Richtung gesperrt — ohne den Fokus abzugeben', () => {
    const erster = zeige({}, 'rund')
    expect(knopf(erster.container, DE.a11yMoveUp).getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(knopf(erster.container, DE.a11yMoveUp))
    expect(erster.dispatch).not.toHaveBeenCalled()
    cleanup()
    const letzter = zeige({}, 'rein')
    expect(knopf(letzter.container, DE.a11yMoveDown).getAttribute('aria-disabled')).toBe('true')
    expect(knopf(letzter.container, DE.a11yMoveUp).getAttribute('aria-disabled')).toBe('false')
  })
})

describe('Entfernen', () => {
  it('nennt über dem Knopf, was mitgeht — und entfernt erst mit dem zweiten Tipp', () => {
    const { container, dispatch } = zeige()
    expect(container.querySelector('.hd-fuss .klein-text')?.textContent).toBe(DE.hdEntfernenHinweis)
    fireEvent.click(knopf(container, DE.hdEntfernen))
    expect(dispatch).not.toHaveBeenCalledWith({ type: 'removeService', key: 'rund' })
    // „löschen", nicht „entfernen": Mit dem Dienst geht gespeicherte Planung.
    fireEvent.click(knopf(container, DE.loeschenSicher))
    expect(dispatch).toHaveBeenCalledWith({ type: 'removeService', key: 'rund' })
  })
})

describe('Ein Gruppen-Dienst (Reinigung)', () => {
  it('hat keinen Aufgabenbereich — keine Liste, nur Reihenfolge und Entfernen', () => {
    const { container } = zeige({}, 'rein')
    expect(container.querySelector('.sheet-sub')?.textContent).toBe(DE.gruppenRotation)
    expect(schalter(container)).toHaveLength(0)
    expect(container.querySelector('.lang-search')).toBeNull()
    expect(knopf(container, DE.hdEntfernen)).toBeDefined()
  })
})
