/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
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
import { ServicesPanel } from './ServicesPanel'

/**
 * T79 — wie viele Personen für einen Hilfsdienst freigegeben sind.
 *
 * Der Befund des Betreibers: selbst angelegte Dienste werden nicht verteilt.
 * Grund ist der Aufgabenbereich `svc:<key>`, den ein neuer Dienst mitbringt und
 * den zunächst **keine** Person gesetzt hat — die Auto-Zuteilung findet dann
 * keinen Kandidaten und lässt den Platz still liegen. Diese Zahl macht es
 * sichtbar, und zwar dort, wo der Planer es ändern kann.
 */

function Buehne({ state }: { state: AppState }) {
  const store = useStaticStore(state)
  return (
    <AppDispatchContext.Provider value={() => {}}>
      <AppStoreContext.Provider value={store}>
        <AppStateContext.Provider value={state}>
          <ServicesPanel />
        </AppStateContext.Provider>
      </AppStoreContext.Provider>
    </AppDispatchContext.Provider>
  )
}

afterEach(cleanup)

const DIENSTE: Service[] = [
  { key: 'ton', name: 'Ton / Video', count: 1, groups: false },
  { key: 'svc-neu', name: 'Parkplatz', count: 1, groups: false }, // gerade angelegt
  { key: 'rein', name: 'Reinigung', count: 1, groups: true },
]

const person = (id: string, dienste: string[]): Person => ({
  id, fn: 'T', ln: id, role: 'verkuendiger', tel: '', mail: '',
  priv: { ...emptyQualifications(), ...Object.fromEntries(dienste.map((k) => [serviceQualKey(k), true])) },
})

const zeigeMit = (persons: Person[]) =>
  render(<Buehne state={{ ...initialState(), services: DIENSTE, persons }} />)

/** Die Unterzeile des Dienstes mit diesem Namen. */
function unterzeile(c: HTMLElement, name: string): HTMLElement | null | undefined {
  const zeile = [...c.querySelectorAll('.svc-row')].find(
    (el) => el.querySelector('.svc-name')?.textContent === name,
  )
  return zeile?.querySelector('.svc-sub')
}

describe('T79 — Hilfsdienste zeigen, für wie viele Personen sie freigegeben sind', () => {
  it('nennt die Zahl je Dienst', () => {
    const { container } = zeigeMit([person('a', ['ton']), person('b', ['ton']), person('c', [])])
    expect(unterzeile(container, 'Ton / Video')?.textContent).toContain('2')
  })

  it('hebt hervor, wenn niemand freigegeben ist — der Fall des neuen Dienstes', () => {
    const { container } = zeigeMit([person('a', ['ton'])])
    const neu = unterzeile(container, 'Parkplatz')
    expect(neu?.textContent).toContain('0')
    expect(neu?.className).toContain('svc-sub--leer')
    // Der besetzbare Dienst daneben bleibt unauffällig.
    expect(unterzeile(container, 'Ton / Video')?.className).not.toContain('svc-sub--leer')
  })

  it('die Gruppen-Rotation braucht niemanden und wird nie hervorgehoben', () => {
    // Reinigung geht reihum durch die Predigtdienstgruppen — sie hat gar keinen
    // Aufgabenbereich, eine 0 wäre dort eine falsche Warnung.
    const { container } = zeigeMit([person('a', ['ton'])])
    const rein = unterzeile(container, 'Reinigung')
    expect(rein?.className).not.toContain('svc-sub--leer')
    expect(rein?.textContent).not.toContain('0')
  })
})
