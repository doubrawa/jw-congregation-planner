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
import { demoZustand } from '../../tests/testdaten/demo-start'
import { sentKey } from '../data/planning'
import { dict } from '../i18n/ui'
import type { FsInstance, PartItem, Service, Week } from '../data/types'
import { PlanenAktionen } from './PlanenAktionen'

/**
 * **Plan senden** (T121, Phase 5c, Entwurf `GSenden`) — das Blatt hinter dem
 * Knopf der Aktionsleiste, geöffnet wie beim Planer über die Leiste. Es
 * übernimmt, was der Kasten im Plan zusicherte (`PlanSendenPanel.test.tsx`):
 * wie viele noch nichts wissen, bei den letzten ein paar mit Namen — jetzt samt
 * Tag und Aufgabe —, gesendet wird die ganze Woche, und wer kein Konto hat,
 * bleibt danach stehen, auch wenn das Blatt zwischendurch zu war.
 */

const t = dict('de')

const sendPlan = vi.fn()
vi.mock('../lib/data', () => ({ sendPlan: (w: string, heute: string) => sendPlan(w, heute) }))
vi.mock('../app/hydrate', () => ({ loadAndHydrate: vi.fn(() => Promise.resolve()) }))

// Das Blatt lässt sich nach unten wegwischen; die Geste fragt zuerst, ob wir am
// Schreibtisch sitzen. jsdom kennt matchMedia nicht — hier: kein Schreibtisch.
window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia

const MONTAG = '2026-09-07'
const DIENSTE: Service[] = [{ key: 'mik', name: 'Mikrofone', count: 1, groups: false }]

const punkt = (iid: string, titel: string, name: string): PartItem => ({ iid, title: titel, mins: 5, names: [{ name }] })

function woche(namen: string[] = ['A. Berg']): Week {
  return {
    range: '7.–13. September', book: '', start: MONTAG,
    mid: {
      date: '', end: '',
      sections: [{ label: 'SCHÄTZE AUS GOTTES WORT', farbe: 'petrol', items: namen.map((n, i) => punkt(`i${i}`, `Punkt ${i}`, n)) }],
      helpers: {},
    },
    we: { date: '', end: '', sections: [], helpers: {} },
  }
}

const key = (i: number) => `${MONTAG}|mid|part|i${i}|0`

function zeige(over: Partial<AppState> = {}) {
  const state: AppState = {
    ...demoZustand(),
    dataStatus: 'ready', congregationId: 'c1', userId: 'u1', planner: true,
    services: DIENSTE, weeks: [woche()], fsWeeks: [[]], week: 0, confirmations: {}, sentLog: {},
    congregation: { name: 'Test', hall: 'Saal', times: { mid: { wd: 2, time: '19:00' }, we: { wd: 0, time: '10:00' } } },
    ...over,
  }
  function Buehne() {
    const store = useStaticStore(state)
    return (
      <AppDispatchContext.Provider value={vi.fn()}>
        <AppStoreContext.Provider value={store}>
          <AppStateContext.Provider value={state}>
            <PlanenAktionen leiste />
          </AppStateContext.Provider>
        </AppStoreContext.Provider>
      </AppDispatchContext.Provider>
    )
  }
  const { container } = render(<Buehne />)
  const oeffnen = () => fireEvent.click(container.querySelector('.planen-senden')!)
  oeffnen()
  return { oeffnen }
}

const blatt = () => document.querySelector<HTMLElement>('[role="dialog"]')!
const zeilen = () => [...blatt().querySelectorAll<HTMLElement>('.senden-zeile')]
const senden = () => blatt().querySelector<HTMLButtonElement>('.senden-fuss .knopf-haupt')!
const ausgang = () => blatt().querySelector<HTMLButtonElement>('.senden-fuss .knopf-leise')!

beforeEach(() => {
  // Montagmorgen der Testwoche: Vergangenes geht nicht hinaus (T77).
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 8, 7, 8, 0))
  sendPlan.mockReset()
  sendPlan.mockResolvedValue({ personen: 1, ohneKonto: [] })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('Wer noch nichts weiß', () => {
  it('steht mit Namen, Tag und Aufgabe da — die Zahl am Knopf', () => {
    zeige({ weeks: [woche(['A. Berg', 'B. Cohn'])] })
    expect(blatt().querySelector('.senden-satz')?.textContent).toBe(t.planSendenOffen.replace('{n}', '2'))
    expect(zeilen().map((z) => z.querySelector('.senden-name')?.textContent)).toEqual(['A. Berg', 'B. Cohn'])
    expect(zeilen()[0]!.querySelector('.klein-text')?.textContent).toMatch(/^Dienstag, 8\. September.* · Punkt 0$/)
    expect(senden().querySelector('.zahl-marke')?.textContent).toBe('2')
  })

  it('ein Treffpunkt-Leiter steht als solcher da, mit dem Ort im Termin', () => {
    const treffpunkt: FsInstance = { id: 'r1', ruleId: 'r1', grp: null, wd: 4, time: '09:30', place: 'Saal', leader: 'C. Dorn' }
    zeige({ weeks: [woche([])], fsWeeks: [[treffpunkt]] })
    expect(zeilen().map((z) => z.textContent)).toEqual([expect.stringContaining('C. Dorn')])
    expect(zeilen()[0]!.querySelector('.klein-text')?.textContent).toMatch(/Saal.* · Treffpunkt-Leiter$/)
  })

  it('bei vielen bleibt es beim Satz — eine Wand von Namen liest niemand', () => {
    zeige({ weeks: [woche(Array.from({ length: 12 }, (_u, i) => `P${i}. Beispiel`))] })
    expect(blatt().querySelector('.senden-liste')).toBeNull()
    expect(blatt().querySelector('.senden-satz')?.textContent).toBe(t.planSendenOffen.replace('{n}', '12'))
  })
})

describe('Senden', () => {
  it('gibt die ganze Woche hinaus — mit dem Kalendertag, an dem gezählt wurde', async () => {
    zeige()
    fireEvent.click(senden())
    await waitFor(() => expect(sendPlan).toHaveBeenCalledWith(MONTAG, '2026-09-07'))
  })

  it('wer kein Konto hat, steht danach da — auch wenn das Blatt zwischendurch zu war', async () => {
    // Ein Toast wäre nach drei Sekunden weg, und ein Blatt, das beim Schließen
    // vergisst, ebenso: Die Leiste hält den Stand, bis die Woche wechselt.
    sendPlan.mockResolvedValue({ personen: 0, ohneKonto: ['A. Berg'] })
    const { oeffnen } = zeige()
    fireEvent.click(senden())
    await waitFor(() => expect(blatt().querySelector('.senden-ohne')?.textContent).toContain('A. Berg'))
    fireEvent.click(ausgang())
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    oeffnen()
    expect(blatt().querySelector('.senden-ohne')?.textContent).toContain('A. Berg')
  })

  it('ist alles gemeldet: der Satz sagt es, der Knopf ist gesperrt, der Ausgang heißt „Fertig"', () => {
    zeige({ sentLog: { [sentKey(key(0), 'A. Berg')]: '2026-08-29T10:00:00Z' } })
    expect(blatt().querySelector('.senden-satz')?.textContent).toBe(t.planSendenAlle)
    expect(senden().getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(senden())
    expect(sendPlan).not.toHaveBeenCalled()
    expect(ausgang().textContent).toBe(t.fertig)
  })

  it('sind noch welche offen und wurde schon gesendet, wissen die anderen Bescheid', () => {
    zeige({
      weeks: [woche(['A. Berg', 'B. Cohn'])],
      sentLog: { [sentKey(key(0), 'A. Berg')]: '2026-08-29T10:00:00Z' },
    })
    const zuletzt = [...blatt().querySelectorAll('.sheet-inhalt > .klein-text')].map((p) => p.textContent).at(-1)
    expect(zuletzt?.startsWith(`${t.planSendenAndere} `)).toBe(true)
    expect(ausgang().textContent).toBe(t.spaeter)
  })

  it('in einer Woche, in der noch niemand eingeteilt ist, sagt es nicht „alle wissen Bescheid"', () => {
    zeige({ weeks: [woche([])] })
    expect(blatt().querySelector('.senden-satz')).toBeNull()
    expect(senden().getAttribute('aria-disabled')).toBe('true')
  })

  it('„Später" schließt das Blatt', () => {
    zeige()
    fireEvent.click(ausgang())
    expect(document.querySelector('[role="dialog"]')).toBeNull()
  })
})
