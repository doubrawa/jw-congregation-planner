/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import {
  AppDispatchContext,
  AppStateContext,
  AppStoreContext,
  type AppState,
  useStaticStore,
} from '../app/context'
import { initialState } from '../app/init'
import { emptyQualifications } from '../data/helpers'
import { sentKey } from '../data/planning'
import { dict } from '../i18n/ui'
import type { PartItem, Person, Service, Week } from '../data/types'
import { PlanSendenPanel } from './PlanSendenPanel'

/**
 * **„Plan senden" — der Knopf, mit dem eine Woche freigegeben wird.**
 *
 * Er ist die einzige Stelle, an der eine Nachricht an die halbe Versammlung
 * ausgelöst wird. Deshalb geht es hier nicht um Aussehen, sondern um vier
 * Zusicherungen, die man nicht sieht:
 *
 *  1. Er erscheint **nur** bei Planern — jeder andere bekäme von der Function
 *     ein 403, und ein Knopf, der verlässlich scheitert, ist schlimmer als
 *     keiner.
 *  2. Er sagt, **wie viele** noch nichts wissen, und nennt sie beim Namen.
 *  3. Ist nichts zu tun, lässt er sich nicht drücken.
 *  4. Wer kein Konto hat, bleibt danach **sichtbar** stehen — den muss der
 *     Planer persönlich ansprechen, und ein Toast wäre nach drei Sekunden weg.
 */

const t = dict('de')

/* Die Function wird nicht wirklich gerufen — geprüft wird, was die Oberfläche
   mit ihrer Antwort macht. */
const sendPlan = vi.fn()
vi.mock('../lib/data', () => ({ sendPlan: (w: string) => sendPlan(w) }))
/* Das stille Nachladen nach dem Senden braucht hier keine Datenbank. */
vi.mock('../app/hydrate', () => ({ loadAndHydrate: vi.fn(() => Promise.resolve()) }))

const MONTAG = '2026-09-07'

const person = (id: string, fn: string, ln: string): Person => ({
  id, fn, ln, role: 'aeltester', female: false, tel: '', mail: '', priv: emptyQualifications(),
})

const DIENSTE: Service[] = [{ key: 'mik', name: 'Mikrofone', count: 1, groups: false }]

const punkt = (iid: string, titel: string, name: string): PartItem =>
  ({ iid, title: titel, mins: 5, names: [{ name }] }) as unknown as PartItem

function woche(namen: string[] = ['A. Berg']): Week {
  return {
    range: '7.–13. September',
    book: '',
    start: MONTAG,
    current: true,
    mid: {
      date: '',
      end: '',
      sections: [
        {
          label: 'SCHÄTZE AUS GOTTES WORT',
          items: namen.map((n, i) => punkt(`i${i}`, `Punkt ${i}`, n)),
        },
      ],
      helpers: {},
    },
    we: { date: '', end: '', sections: [], helpers: {} },
  } as unknown as Week
}

/** Schlüssel des Platzes im n-ten Punkt. */
const key = (i: number) => `${MONTAG}|mid|part|i${i}|0`

function buehne(over: Partial<AppState> = {}) {
  const dispatch = vi.fn()
  const state: AppState = {
    ...initialState(),
    dataStatus: 'ready', congregationId: 'c1', userId: 'u1', planner: true,
    persons: [person('p-a', 'Anna', 'Berg')], services: DIENSTE, groups: [], absences: [],
    weeks: [woche()], fsWeeks: [[]], week: 0,
    fsBase: new Date(2026, 8, 7, 12, 0),
    congregation: { name: 'Test', hall: 'Saal', meetings: 'Di 19:00 · So 10:00' },
    ...over,
  }
  function Buehne() {
    const store = useStaticStore(state)
    return (
      <AppDispatchContext.Provider value={dispatch}>
        <AppStoreContext.Provider value={store}>
          <AppStateContext.Provider value={state}>
            <PlanSendenPanel />
          </AppStateContext.Provider>
        </AppStoreContext.Provider>
      </AppDispatchContext.Provider>
    )
  }
  return { dispatch, ...render(<Buehne />) }
}

const knopf = (c: HTMLElement) => c.querySelector<HTMLButtonElement>('.plan-senden .plan-auto-btn')

beforeEach(() => {
  sendPlan.mockReset()
  sendPlan.mockResolvedValue({ personen: 1, aufgaben: 1, ohneKonto: [] })
})
afterEach(cleanup)

describe('Wer den Knopf zu sehen bekommt', () => {
  it('ein Planer', () => {
    expect(buehne().container.querySelector('.plan-senden')).toBeTruthy()
  })

  it('ein Verkündiger nicht — die Function wiese ihn ohnehin ab', () => {
    expect(buehne({ planner: false }).container.querySelector('.plan-senden')).toBeNull()
  })

  it('und an einer Woche, in der es nichts freizugeben gibt, gar nichts', () => {
    const { container } = buehne({ weeks: [woche([])] })
    expect(container.querySelector('.plan-senden')).toBeNull()
  })
})

describe('Was er über den Stand der Woche sagt', () => {
  it('nennt die Zahl derer, die noch nichts wissen — und ihre Namen', () => {
    const { container } = buehne({ weeks: [woche(['A. Berg', 'B. Cohn'])] })
    expect(container.querySelector('.plan-banner-count')?.textContent).toBe('2')
    expect(container.querySelector('.plan-senden-namen')?.textContent).toContain('A. Berg')
    expect(container.querySelector('.plan-senden-namen')?.textContent).toContain('B. Cohn')
  })

  it('nennt jeden Namen einmal, auch wenn er mehrere Plätze hat', () => {
    const { container } = buehne({ weeks: [woche(['A. Berg', 'A. Berg'])] })
    expect(container.querySelector('.plan-senden-namen')?.textContent).toBe('A. Berg')
  })

  it('bei einer ganzen frisch geplanten Woche bleibt es bei der Zahl', () => {
    // Gemessen an der Demo-Woche sind es 26 Namen. Eine solche Wand liest
    // niemand, und sie schiebt den Knopf aus dem Bild — die Zahl trägt dort
    // die Aussage, die Namen erst wieder bei den letzten Nachzüglern.
    const viele = Array.from({ length: 12 }, (_u, i) => `P${i}. Beispiel`)
    const { container } = buehne({ weeks: [woche(viele)] })
    expect(container.querySelector('.plan-banner-count')?.textContent).toBe('12')
    expect(container.querySelector('.plan-senden-namen')).toBeNull()
  })

  it('ist alles gemeldet, sagt er das — und der Knopf ist gesperrt', () => {
    const { container } = buehne({
      weeks: [woche(['A. Berg'])],
      sentLog: { [sentKey(key(0), 'A. Berg')]: '2026-08-29T10:00:00Z' },
    })
    expect(container.querySelector('.plan-senden-hint')?.textContent).toBe(t.planSendenAlle)
    expect(knopf(container)?.disabled).toBe(true)
  })

  it('und wann zuletzt etwas hinausging', () => {
    const { container } = buehne({
      weeks: [woche(['A. Berg'])],
      sentLog: { [sentKey(key(0), 'A. Berg')]: new Date().toISOString() },
    })
    expect(container.querySelector('.plan-senden-zuletzt')?.textContent).toBeTruthy()
  })
})

describe('Was beim Drücken geschieht', () => {
  it('die Woche wird über ihre Kennung gesendet, nicht über ihren Index', () => {
    // Der Index ordnet seit T66 nur noch; die Kennung ist der Montag.
    const { container } = buehne()
    fireEvent.click(knopf(container)!)
    expect(sendPlan).toHaveBeenCalledWith(MONTAG)
  })

  it('danach steht im Toast, wie viele benachrichtigt wurden', async () => {
    sendPlan.mockResolvedValue({ personen: 3, aufgaben: 5, ohneKonto: [] })
    const { container, dispatch } = buehne()
    fireEvent.click(knopf(container)!)
    await waitFor(() =>
      expect(dispatch).toHaveBeenCalledWith({ type: 'showToast', text: '3 Personen benachrichtigt' }),
    )
  })

  it('war nichts zu senden, sagt der Toast auch das', async () => {
    sendPlan.mockResolvedValue({ personen: 0, aufgaben: 0, ohneKonto: [] })
    const { container, dispatch } = buehne()
    fireEvent.click(knopf(container)!)
    await waitFor(() =>
      expect(dispatch).toHaveBeenCalledWith({ type: 'showToast', text: t.toastPlanNichts }),
    )
  })

  it('wer kein Konto hat, bleibt danach sichtbar stehen', async () => {
    // Sie stehen im Tagebuch wie alle anderen und verschwänden sonst aus der
    // Liste — dabei sind gerade sie die, die der Planer selbst ansprechen muss.
    sendPlan.mockResolvedValue({ personen: 1, aufgaben: 2, ohneKonto: ['Karl Onto'] })
    const { container } = buehne()
    fireEvent.click(knopf(container)!)
    await waitFor(() =>
      expect(container.querySelector('.plan-senden-ohne')?.textContent).toContain('Karl Onto'),
    )
  })

  it('scheitert der Aufruf, sagt es die App — statt so zu tun, als sei es getan', async () => {
    sendPlan.mockResolvedValue(null)
    const { container, dispatch } = buehne()
    fireEvent.click(knopf(container)!)
    await waitFor(() =>
      expect(dispatch).toHaveBeenCalledWith({ type: 'showToast', text: t.toastSpeicherFehler }),
    )
  })
})
