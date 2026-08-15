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
import { emptyQualifications } from '../data/helpers'
import type { Person, Service } from '../data/types'
import { PersonDetail } from './PersonDetail'

/**
 * T73. Aufgaben und Hilfsdienste standen in **einem** Bereich, in der
 * Reihenfolge des Programms bzw. der Einstellungen. Beides sind verschiedene
 * Dinge, und in einer Liste aus einem Dutzend Schaltern sucht man nach dem
 * Wort. Diese Tests halten die Aufteilung und die Sortierung fest.
 */
const person = (): Person => ({
  id: 'p1',
  fn: 'Simon',
  ln: 'Krüger',
  role: 'verkuendiger',
  tel: '',
  mail: '',
  priv: emptyQualifications(),
})

const dienst = (key: string, name: string, groups = false): Service =>
  ({ key, name, count: 1, groups }) as Service

function Buehne({ state }: { state: AppState }) {
  const store = useStaticStore(state)
  return (
    <AppDispatchContext.Provider value={() => {}}>
      <AppStoreContext.Provider value={store}>
        <AppStateContext.Provider value={state}>
          <PersonDetail person={person()} />
        </AppStateContext.Provider>
      </AppStoreContext.Provider>
    </AppDispatchContext.Provider>
  )
}

function zeige(services: Service[]) {
  const state: AppState = { ...initialState(), persons: [person()], services }
  return render(<Buehne state={state} />)
}

/** Die Schalter-Beschriftungen des Bereichs mit dieser Überschrift. */
function bereich(container: HTMLElement, label: string): string[] {
  const panel = [...container.querySelectorAll('.panel')].find(
    (p) => p.querySelector('.panel-label')?.textContent === label,
  )
  if (!panel) throw new Error(`Bereich „${label}" nicht gefunden`)
  return [...panel.querySelectorAll('.priv-label')].map((e) => e.textContent?.trim() ?? '')
}

afterEach(cleanup)

describe('PersonDetail — Aufgaben und Hilfsdienste sind zwei Bereiche (T73)', () => {
  const dienste = [
    dienst('ton', 'Tonanlage'),
    dienst('ord', 'Ordner'),
    dienst('mik', 'Mikrofone'),
    dienst('rein', 'Reinigung', true), // Gruppen-Dienst: gehört keiner Person
  ]

  it('die Hilfsdienste stehen in einem eigenen Bereich, nicht bei den Aufgaben', () => {
    const { container } = zeige(dienste)
    const aufgaben = bereich(container, 'AUFGABENBEREICHE')
    const hilfsdienste = bereich(container, 'HILFSDIENSTE')

    expect(hilfsdienste).toContain('Tonanlage')
    expect(aufgaben).not.toContain('Tonanlage')
    expect(aufgaben.some((l) => l.startsWith('Vorsitz'))).toBe(true)
  })

  it('beide Bereiche stehen alphabetisch', () => {
    const { container } = zeige(dienste)
    const sortiert = (liste: string[]) => [...liste].sort((a, b) => a.localeCompare(b, 'de'))

    expect(bereich(container, 'HILFSDIENSTE')).toEqual(['Mikrofone', 'Ordner', 'Tonanlage'])
    const aufgaben = bereich(container, 'AUFGABENBEREICHE')
    expect(aufgaben).toEqual(sortiert(aufgaben))
  })

  it('Gruppen-Dienste bleiben draußen — sie rotieren Gruppen statt Personen', () => {
    const { container } = zeige(dienste)
    expect(bereich(container, 'HILFSDIENSTE')).not.toContain('Reinigung')
  })

  it('ohne konfigurierte Dienste bleibt der Bereich leer, aber vorhanden', () => {
    const { container } = zeige([])
    expect(bereich(container, 'HILFSDIENSTE')).toEqual([])
  })
})
