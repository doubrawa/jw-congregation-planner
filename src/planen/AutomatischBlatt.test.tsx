/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { bestaetigen } from '../../tests/zwei-tipps'
import {
  AppDispatchContext,
  AppStateContext,
  AppStoreContext,
  type AppState,
  useStaticStore,
} from '../app/context'
import { demoZustand } from '../../tests/testdaten/demo-start'
import type { Section, Service, Week } from '../data/types'
import { dict } from '../i18n/ui'
import { zahlBinden } from '../i18n/zahl-binden'
import { AutomatischBlatt } from './AutomatischBlatt'

/**
 * **Automatisch zuteilen** (T121, Phase 5c, Entwurf `GAutomatisch`) — das Blatt
 * hinter „Automatisch" in der Aktionsleiste: welche Bereiche, wie weit sie
 * besetzt sind, und ob nur der gezeigte Tag oder die ganze Woche (Entscheid
 * vom 13.10.2026). Was die Aktionen in den Wochen bewirken, prüfen
 * `reducer.test.ts` und `planning.test.ts`; hier, was das Blatt zählt und
 * welche Aktion es schickt.
 */

const t = dict('de')

// Das Blatt lässt sich nach unten wegwischen; die Geste fragt zuerst, ob wir am
// Schreibtisch sitzen. jsdom kennt matchMedia nicht — hier: kein Schreibtisch.
window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia

const DIENSTE: Service[] = [{ key: 'mik', name: 'Mikrofone', count: 2, groups: false }]

/** Zwei Programmplätze, einer besetzt — und ein Gastredner, den „Automatisch" nie anfasst. */
const programm = (besetzt: boolean): Section[] => [
  {
    label: 'SCHÄTZE AUS GOTTES WORT', farbe: 'petrol',
    items: [
      { iid: 'i1', num: 1, title: 'Schätze', meta: '10 Min.', names: [{ name: besetzt ? 'Anton Abel' : '' }] },
      { iid: 'i2', num: 2, title: 'Perlen', meta: '10 Min.', names: [{ name: '' }] },
      { iid: 'i3', num: 3, title: 'Vortrag', meta: '30 Min.', names: [{ name: '', rolle: 'Gastredner' }] },
    ],
  },
]

function woche(over: Partial<Week> = {}): Week {
  return {
    range: '7.–13. September', book: 'JEREMIA 32', start: '2026-09-07',
    mid: { date: '', end: '20:45', sections: programm(true), helpers: { mik: [] } },
    we: { date: '', end: '11:45', sections: programm(false), helpers: { mik: [{ name: 'Bruno Berg' }] } },
    ...over,
  }
}

function zeige(over: Partial<AppState> = {}) {
  const dispatch = vi.fn()
  const onClose = vi.fn()
  const state: AppState = {
    ...demoZustand(),
    screen: 'planen', tab: 'mid', dataStatus: 'ready', planner: true,
    services: DIENSTE, weeks: [woche()], week: 0,
    congregation: { name: 'Nordheim', hall: 'Saal', times: { mid: { wd: 2, time: '19:00' }, we: { wd: 0, time: '10:00' } } },
    ...over,
  }
  function Buehne() {
    const store = useStaticStore(state)
    return (
      <AppDispatchContext.Provider value={dispatch}>
        <AppStoreContext.Provider value={store}>
          <AppStateContext.Provider value={state}>
            <AutomatischBlatt onClose={onClose} />
          </AppStateContext.Provider>
        </AppStoreContext.Provider>
      </AppDispatchContext.Provider>
    )
  }
  render(<Buehne />)
  return { dispatch, onClose }
}

const blatt = () => document.querySelector<HTMLElement>('[role="dialog"]')!
const bereiche = () => [...blatt().querySelectorAll<HTMLElement>('.auto-bereich')]
const stand = () => bereiche().map((b) => b.querySelector('.klein-text')?.textContent)
const kaestchen = () => bereiche().map((b) => b.querySelector<HTMLInputElement>('input')!)
const knopf = (text: string) => [...blatt().querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === text)!
const zuteilen = () => knopf(t.spurZuteilen)
const leeren = () => blatt().querySelector<HTMLButtonElement>('.auto-leeren')!

afterEach(cleanup)

describe('Was das Blatt zählt', () => {
  it('die Bereiche mit ihrer Besetzung am gezeigten Tag — ohne den Gastredner', () => {
    zeige()
    expect(blatt().getAttribute('aria-label')).toBe(t.autoTitel)
    expect(bereiche().map((b) => b.querySelector('.auto-bereich-name')?.textContent)).toEqual([t.autoAufgaben, t.hilfsdienste])
    expect(stand()).toEqual([`${t.saalBesetzung}: 1/2`, `${t.saalBesetzung}: 0/2`].map(zahlBinden))
  })

  it('der Tag heißt, wie er heißt — „Nur Dienstag"', () => {
    zeige()
    expect(knopf(t.autoNurTag.replace('{tag}', 'Dienstag'))).toBeDefined()
  })

  it('„Ganze Woche" zählt beide Zusammenkünfte', () => {
    zeige()
    fireEvent.click(knopf(t.ganzeWoche))
    expect(stand()).toEqual([`${t.saalBesetzung}: 1/4`, `${t.saalBesetzung}: 1/4`].map(zahlBinden))
  })

  it('eine ausgefallene Zusammenkunft zählt in der ganzen Woche nicht mit (T30)', () => {
    zeige({ weeks: [woche({ dev: { we: { cancelled: true } } })] })
    fireEvent.click(knopf(t.ganzeWoche))
    expect(stand()).toEqual([`${t.saalBesetzung}: 1/2`, `${t.saalBesetzung}: 0/2`].map(zahlBinden))
  })
})

describe('Was das Blatt schickt', () => {
  it('vorgewählt ist, wo am Tag etwas offen ist — „Zuteilen" schickt beides und schließt', () => {
    const { dispatch, onClose } = zeige()
    expect(kaestchen().map((k) => k.checked)).toEqual([true, true])
    fireEvent.click(zuteilen())
    expect(dispatch).toHaveBeenCalledWith({ type: 'autoAssign', scope: 'all', umfang: 'tag' })
    expect(onClose).toHaveBeenCalled()
  })

  it('ein Bereich allein, für die ganze Woche', () => {
    const { dispatch } = zeige()
    fireEvent.click(kaestchen()[0]!)
    fireEvent.click(knopf(t.ganzeWoche))
    fireEvent.click(zuteilen())
    expect(dispatch).toHaveBeenCalledWith({ type: 'autoAssign', scope: 'helpers', umfang: 'woche' })
  })

  /** Die Aufgaben am Dienstag voll besetzt: nur noch der besetzte Punkt. */
  const aufgabenVoll = (): Week => {
    const w = woche()
    const abschnitt = w.mid.sections[0]
    if (!abschnitt) throw new Error('Testaufbau: Abschnitt fehlt')
    abschnitt.items = abschnitt.items.slice(0, 1)
    return w
  }

  it('ist ein Bereich am Tag voll, ist er nicht vorgewählt', () => {
    zeige({ weeks: [aufgabenVoll()] })
    expect(kaestchen().map((k) => k.checked)).toEqual([false, true])
  })

  it('ist im gewählten Bereich nichts offen, ist „Zuteilen" gesperrt — „Leeren" nicht', () => {
    zeige({ weeks: [aufgabenVoll()] })
    fireEvent.click(kaestchen()[0]!)
    fireEvent.click(kaestchen()[1]!)
    expect(kaestchen().map((k) => k.checked)).toEqual([true, false])
    expect(zuteilen().disabled).toBe(true)
    expect(leeren().disabled).toBe(false)
  })

  it('ohne Wahl gibt es nichts zu tun', () => {
    const { dispatch } = zeige()
    for (const k of kaestchen()) fireEvent.click(k)
    expect(zuteilen().disabled).toBe(true)
    expect(leeren().disabled).toBe(true)
    fireEvent.click(zuteilen())
    expect(dispatch).not.toHaveBeenCalled()
  })
})

describe('„Leeren" fragt nach', () => {
  it('erst der zweite Tipp leert — gewählte Bereiche, gewählter Umfang — und schließt', () => {
    const { dispatch, onClose } = zeige()
    fireEvent.click(leeren())
    expect(leeren().textContent).toBe(t.leerenSicher)
    expect(dispatch).not.toHaveBeenCalled()
    bestaetigen(leeren())
    expect(dispatch).toHaveBeenCalledWith({ type: 'clearAssignments', scope: 'all', umfang: 'tag' })
    expect(onClose).toHaveBeenCalled()
  })

  it('geht der Fokus weg, entschärft es sich — ein Tipp daneben nimmt die Frage zurück', () => {
    // Bis Phase 10 (T121) nur an der alten Zeile `AutoAssignRow` geprüft, die
    // seit Phase 5c niemand mehr zeigte.
    const { dispatch } = zeige()
    fireEvent.click(leeren())
    fireEvent.blur(leeren())
    expect(leeren().textContent).toBe(t.leeren)
    fireEvent.click(leeren())
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('jede andere Wahl nimmt die Frage zurück — sie galt der alten', () => {
    const { dispatch } = zeige()
    fireEvent.click(leeren())
    fireEvent.click(kaestchen()[0]!)
    expect(leeren().textContent).toBe(t.leeren)
    fireEvent.click(leeren())
    fireEvent.click(knopf(t.ganzeWoche))
    expect(leeren().textContent).toBe(t.leeren)
    expect(dispatch).not.toHaveBeenCalled()
  })
})
