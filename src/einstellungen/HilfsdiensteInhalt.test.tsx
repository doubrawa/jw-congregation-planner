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
import { demoZustand } from '../../tests/testdaten/demo-start'
import { emptyQualifications, privSetzen, serviceQualKey } from '../data/helpers'
import type { Person, Qualifications, Service } from '../data/types'
import { dict } from '../i18n/ui'
import { HilfsdiensteInhalt } from './HilfsdiensteInhalt'

/**
 * **Hilfsdienste** (T121, Phase 6c-2, Entwurf `GHilfsdienste`): je Dienst die
 * Plätze je Zusammenkunft, in der Folge des Programms; ein Tipp öffnet den
 * Dienst, „Hilfsdienst hinzufügen" legt einen an.
 *
 * Dazu ein Fall, der sonst unsichtbar bliebe (T79): Ein **neu angelegter**
 * Dienst bringt einen Aufgabenbereich mit, den bis dahin keine Person gesetzt
 * hat. Sein Platz bliebe Woche für Woche offen, ohne dass irgendwo stünde,
 * woran es liegt. Deshalb steht die Zahl der Freigegebenen an der Zeile — und
 * hebt sich ab, wenn sie 0 ist.
 */

vi.mock('../lib/supabase', () => ({ supabase: null, isSupabaseConfigured: false }))

const t = dict('de')

const priv = (...keys: string[]): Qualifications => {
  const q = emptyQualifications()
  for (const k of keys) privSetzen(q, k, true)
  return q
}

const person = (id: string, ln: string, ...q: string[]): Person => ({
  id, fn: 'Max', ln, role: 'verkuendiger', female: false, tel: '', mail: '', priv: priv(...q),
})

const DIENSTE: Service[] = [
  { key: 'mik', name: 'Mikrofone', count: 2, groups: false },
  { key: 'rein', name: 'Reinigung', count: 1, groups: true },
]

function zeige(over: Partial<AppState> = {}) {
  const dispatch = vi.fn()
  const state: AppState = {
    ...demoZustand(),
    dataStatus: 'ready', congregationId: 'c1', userId: 'u1', planner: true,
    persons: [], services: DIENSTE, groups: [],
    ...over,
  }
  function Buehne() {
    const store = useStaticStore(state)
    return (
      <AppDispatchContext.Provider value={dispatch}>
        <AppStoreContext.Provider value={store}>
          <AppStateContext.Provider value={state}>
            <HilfsdiensteInhalt />
          </AppStateContext.Provider>
        </AppStoreContext.Provider>
      </AppDispatchContext.Provider>
    )
  }
  return { dispatch, ...render(<Buehne />) }
}

afterEach(cleanup)

// Das Blatt lässt sich nach unten wegwischen; die Geste fragt zuerst, ob wir am
// Schreibtisch sitzen. jsdom kennt matchMedia nicht — hier: kein Schreibtisch.
window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia

const zeilen =(c: HTMLElement) => [...c.querySelectorAll<HTMLElement>('.hd-zeile')]
const name = (zeile: HTMLElement) => zeile.querySelector('.einst-zeile-name')?.textContent
const unter = (zeile: HTMLElement) => zeile.querySelector('.hd-name .klein-text')
const knopf = (wo: ParentNode, text: string) =>
  [...wo.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === text)!
/** Das Blatt „Hilfsdienst hinzufügen" — es liegt am Dokument, nicht in der Ansicht. */
const neuBlatt = () => document.querySelector<HTMLElement>(`[role="dialog"][aria-label="${t.hilfsdienstHinzu}"]`)!

describe('Die Liste', () => {
  it('jeder Dienst steht mit Name und Plätzen da — in der Folge des Programms', () => {
    const { container } = zeige()
    expect(zeilen(container).map(name)).toEqual(['Mikrofone', 'Reinigung'])
    expect(zeilen(container)[0]!.querySelector('.plus-minus-wert')?.textContent).toBe('2')
    expect(container.querySelector('.einst-einleitung')?.textContent).toBe(t.hdDesc)
  })

  it('die Plätze lassen sich in Einerschritten ändern', () => {
    const { container, dispatch } = zeige()
    const zeile = zeilen(container)[0]!
    fireEvent.click(zeile.querySelector(`[aria-label="${t.a11yIncrease}"]`)!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'changeServiceCount', key: 'mik', delta: 1 })
    fireEvent.click(zeile.querySelector(`[aria-label="${t.a11yDecrease}"]`)!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'changeServiceCount', key: 'mik', delta: -1 })
  })

  it('der Zähler sagt, wessen Plätze er zählt', () => {
    const { container } = zeige()
    expect(zeilen(container)[0]!.querySelector('.plus-minus')?.getAttribute('aria-label')).toBe('Plätze für Mikrofone')
  })

  it('ein Tipp auf den Namen öffnet den Dienst — auch einen Gruppen-Dienst, für Folge und Entfernen', () => {
    const { container, dispatch } = zeige()
    fireEvent.click(zeilen(container)[1]!.querySelector('.hd-name')!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'openServiceSheet', key: 'rein' })
  })
})

describe('Für wie viele der Dienst freigegeben ist (T79)', () => {
  it('zählt die Personen mit diesem Aufgabenbereich', () => {
    const { container } = zeige({
      persons: [person('p1', 'Alt', serviceQualKey('mik')), person('p2', 'Brand'), person('p3', 'Cohn', serviceQualKey('mik'))],
    })
    expect(unter(zeilen(container)[0]!)?.textContent).toBe('Personen: 2')
  })

  it('hebt hervor, wenn niemand freigegeben ist — der Fall des neuen Dienstes', () => {
    const { container } = zeige({ persons: [person('p1', 'Alt')] })
    expect(unter(zeilen(container)[0]!)?.classList.contains('hd-niemand')).toBe(true)
  })

  it('mit Freigegebenen nicht mehr', () => {
    const { container } = zeige({ persons: [person('p1', 'Alt', serviceQualKey('mik'))] })
    expect(unter(zeilen(container)[0]!)?.classList.contains('hd-niemand')).toBe(false)
  })

  it('die Gruppen-Rotation braucht niemanden — sie sagt es und hebt sich nie ab', () => {
    const { container } = zeige({ persons: [] })
    const rein = zeilen(container)[1]!
    expect(unter(rein)?.textContent).toBe(t.gruppenRotation)
    expect(unter(rein)?.classList.contains('hd-niemand')).toBe(false)
  })
})

describe('Hilfsdienst hinzufügen', () => {
  const oeffne = () => {
    const z = zeige()
    fireEvent.click(knopf(z.container, t.hilfsdienstHinzu))
    return z
  }

  it('ohne Namen geht der Knopf nicht', () => {
    const { dispatch } = oeffne()
    const hinzu = knopf(neuBlatt(), t.hinzufuegenKnopf)
    expect(hinzu.disabled).toBe(true)
    fireEvent.change(neuBlatt().querySelector('input')!, { target: { value: '   ' } })
    expect(knopf(neuBlatt(), t.hinzufuegenKnopf).disabled).toBe(true)
    expect(dispatch.mock.calls.some((c) => c[0].type === 'addService')).toBe(false)
  })

  it('mit Namen entsteht er mit einem Platz und eigenem Schlüssel — und sein Blatt öffnet sich', () => {
    // Ein neuer Dienst hat noch niemanden, der ihn übernehmen darf; im Blatt
    // steht das gleich als Nächstes an (T79).
    const { dispatch } = oeffne()
    fireEvent.change(neuBlatt().querySelector('input')!, { target: { value: '  Parkplatz  ' } })
    fireEvent.click(knopf(neuBlatt(), t.hinzufuegenKnopf))
    const svc = dispatch.mock.calls.find((c) => c[0].type === 'addService')![0].service
    expect(svc).toMatchObject({ name: 'Parkplatz', count: 1, groups: false })
    expect(svc.key).toMatch(/^svc-/)
    expect(dispatch).toHaveBeenCalledWith({ type: 'openServiceSheet', key: svc.key })
  })

  it('zwei nacheinander angelegte bekommen verschiedene Schlüssel', () => {
    const { container, dispatch } = zeige()
    for (const wort of ['Eins', 'Zwei']) {
      fireEvent.click(knopf(container, t.hilfsdienstHinzu))
      fireEvent.change(neuBlatt().querySelector('input')!, { target: { value: wort } })
      fireEvent.click(knopf(neuBlatt(), t.hinzufuegenKnopf))
    }
    const keys = dispatch.mock.calls.filter((c) => c[0].type === 'addService').map((c) => c[0].service.key)
    expect(new Set(keys).size).toBe(2)
  })
})

describe('Wer darf was?', () => {
  it('Aufgabenbereiche vergibt man bei der Person — die Zeile führt hin', () => {
    const { container, dispatch } = zeige()
    const zeile = [...container.querySelectorAll<HTMLElement>('.einst-zeile')].find(
      (z) => z.querySelector('.einst-zeile-name')?.textContent === t.werDarfWas,
    )!
    expect(zeile.querySelector('.klein-text')?.textContent).toBe(t.bereicheBeiPerson)
    fireEvent.click(zeile)
    expect(dispatch).toHaveBeenCalledWith({ type: 'navigate', screen: 'personen' })
  })
})
