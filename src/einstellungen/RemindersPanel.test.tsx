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
import { emptyQualifications } from '../data/helpers'
import { dict } from '../i18n/ui'
import type { Group, Person } from '../data/types'
import { RemindersPanel } from './RemindersPanel'

/**
 * **Erinnerungen** — das Panel, das bis zu seinem Umbau (T121, Phase 6c-4) als
 * Unteransicht der Einstellungen steht. Die Übersicht prüft
 * `EinstellungenScreen.test.tsx`, die Gruppen `GruppenInhalt.test.tsx`.
 */

vi.mock('../lib/supabase', () => ({ supabase: null, isSupabaseConfigured: false, performLogout: vi.fn() }))

const t = dict('de')

const person = (id: string, fn: string, ln: string, over: Partial<Person> = {}): Person => ({
  id, fn, ln, role: 'verkuendiger', female: false, tel: '', mail: '', priv: emptyQualifications(),
  grp: null, ...over,
})

const AELTESTER = person('p-ae', 'Anton', 'Alt', { role: 'aeltester' })
const GEHILFE = person('p-dg', 'Bernd', 'Brand', { role: 'dienstamtgehilfe' })
const BRUDER = person('p-v', 'Carlo', 'Cohn')
const SCHWESTER = person('p-s', 'Dora', 'Dietz', { female: true })
const PERSONEN = [AELTESTER, GEHILFE, BRUDER, SCHWESTER]

const GRUPPEN: Group[] = [{ id: 'g1', name: 'Gruppe 1', overseerId: 'p-ae', assistantId: null }]

function zeige(_was: 'reminders', over: Partial<AppState> = {}) {
  const dispatch = vi.fn()
  const state: AppState = {
    ...demoZustand(),
    screen: 'einstellungen', dataStatus: 'ready',
    congregationId: 'c1', userId: 'u1', personId: 'p-ae', planner: true,
    persons: PERSONEN, groups: GRUPPEN, services: [],
    weeks: [], fsWeeks: [], fsRules: [], absences: [],
    congregation: { name: 'Nordheim', hall: 'Königreichssaal', times: { mid: { wd: 2, time: '19:00' }, we: { wd: 0, time: '10:00' } } },
    ...over,
  }
  function Buehne() {
    const store = useStaticStore(state)
    return (
      <AppDispatchContext.Provider value={dispatch}>
        <AppStoreContext.Provider value={store}>
          <AppStateContext.Provider value={state}>
            <RemindersPanel />
          </AppStateContext.Provider>
        </AppStoreContext.Provider>
      </AppDispatchContext.Provider>
    )
  }
  return { dispatch, ...render(<Buehne />) }
}

afterEach(cleanup)

describe('Erinnerungen', () => {
  const zeilen = (c: HTMLElement) => [...c.querySelectorAll('.svc-row')]

  /*
   * Drei Zeilen, nicht mehr vier. Die erste war „Bei Zuteilung · Sofort" (T74)
   * und steuerte die Mitteilung „Zuteilung gesendet" an die **Planer**. Mit
   * T99 gibt es die nicht mehr — der Planer drückt jetzt „Plan senden", und
   * die Nachricht geht an die eingeteilte Person. Damit steuerte der Schalter
   * nichts mehr, und ein Schalter ohne Wirkung ist schlimmer als keiner.
   */
  it('drei Zeilen: erste, letzte, wiederholen', () => {
    const { container } = zeige('reminders')
    expect(zeilen(container).map((r) => r.querySelector('.svc-name')?.textContent)).toEqual([
      t.remErste, t.remLetzte, t.remRepeat,
    ])
  })

  it('die Tage lassen sich in Einerschritten verstellen', () => {
    const { container, dispatch } = zeige('reminders')
    const erste = zeilen(container)[0]!
    fireEvent.click(erste.querySelector(`[aria-label="${t.a11yIncrease}"]`)!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'changeReminder', key: 'first', delta: 1 })
    fireEvent.click(erste.querySelector(`[aria-label="${t.a11yDecrease}"]`)!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'changeReminder', key: 'first', delta: -1 })
  })

  it('unter der Zahl steht, was sie bedeutet — in Worten', () => {
    const { container } = zeige('reminders', {
      reminders: { first: 7, last: 1, repeat: false },
    })
    expect(zeilen(container)[0]!.querySelector('.svc-sub')?.textContent).toBe('Tage vorher: 7')
    expect(zeilen(container)[1]!.querySelector('.svc-sub')?.textContent).toBe('Tage vorher: 1')
  })

  it('null Tage heißt „am Tag der Aufgabe", nicht „Tage vorher: 0"', () => {
    const { container } = zeige('reminders', {
      reminders: { first: 7, last: 0, repeat: false },
    })
    expect(zeilen(container)[1]!.querySelector('.svc-sub')?.textContent).toBe(t.remAmTag)
  })

  it('„täglich wiederholen" ist der letzte Schalter', () => {
    const { container, dispatch } = zeige('reminders')
    fireEvent.click(zeilen(container)[2]!.querySelector('[role="switch"]')!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'toggleReminderRepeat' })
  })
})
