/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
import { fill } from '../i18n/useT'
import { ProgrammScreen } from '../programm/ProgrammScreen'
import type { OzEintrag, OzTermin, Person } from '../data/types'
import { PlanenScreen } from './PlanenScreen'
import { wochentagNameAusWd } from './wochentage'

/**
 * **Öffentliches Zeugnisgeben an der Oberfläche** (T120, Phase 3): wer den
 * Reiter sieht, was der Planer einstellt und was ein Verkündiger tun kann.
 * Die Regeln dahinter prüfen `data/zeugnis.test.ts` und
 * `app/zeugnis-reducer.test.ts`; hier geht es darum, dass die Knöpfe sie
 * auslösen und nur dort stehen, wo sie gelten.
 */

const t = dict('de')

const person = (id: string, fn: string, zeugnis: boolean): Person => ({
  id,
  fn,
  ln: 'Test',
  role: 'verkuendiger',
  female: false,
  tel: '',
  mail: '',
  priv: { ...emptyQualifications(), zeugnis },
})
const SIMON = person('p-s', 'Simon', true)
const ANNA = person('p-a', 'Anna', true)
const OTTO = person('p-o', 'Otto', false)

const MITTWOCH: OzTermin = { id: 't1', wd: 3, von: '10:00', bis: '12:00', ort: 'Marktplatz', plaetze: 2 }
const eintrag = (pid: string, selbst = false, datum = '2026-09-09'): OzEintrag => ({
  id: `e-${pid}-${datum}`,
  terminId: 't1',
  datum,
  pid,
  selbst,
})

function zeige(Screen: () => React.JSX.Element, over: Partial<AppState> = {}) {
  const dispatch = vi.fn()
  const state: AppState = {
    ...demoZustand(),
    tab: 'fs',
    fsBereich: 'zeugnis',
    dataStatus: 'ready',
    congregationId: 'c1',
    userId: 'u1',
    personId: SIMON.id,
    planner: false,
    persons: [SIMON, ANNA, OTTO],
    absences: [],
    ozTermine: [MITTWOCH],
    ozEintraege: [],
    confirmations: {},
    sentLog: {},
    ...over,
  }
  function Buehne() {
    const store = useStaticStore(state)
    return (
      <AppDispatchContext.Provider value={dispatch}>
        <AppStoreContext.Provider value={store}>
          <AppStateContext.Provider value={state}>
            <Screen />
          </AppStateContext.Provider>
        </AppStoreContext.Provider>
      </AppDispatchContext.Provider>
    )
  }
  return { dispatch, ...render(<Buehne />) }
}

const knopf = (c: HTMLElement, text: string) =>
  [...c.querySelectorAll('button')].filter((b) => b.textContent === text)

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 8, 7, 9, 0))
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('Wer den Reiter sieht', () => {
  const reiter = (c: HTMLElement) => [...c.querySelectorAll('.plan-tabs .meeting-tab')].map((b) => b.textContent)

  it('beim Ansehen jeder, sobald es Termine gibt — ohne Termine fehlt er', () => {
    expect(reiter(zeige(ProgrammScreen, { screen: 'programm' }).container)).toContain(t.privZeugnis)
    cleanup()
    expect(reiter(zeige(ProgrammScreen, { screen: 'programm', ozTermine: [] }).container)).not.toContain(t.privZeugnis)
  })

  it('beim Planen nur der Planer', () => {
    expect(reiter(zeige(PlanenScreen, { screen: 'planen', planner: true }).container)).toContain(t.privZeugnis)
  })
})

describe('Ansehen: selbst eintragen, bestätigen, absagen', () => {
  it('wer den Aufgabenbereich hat, trägt sich mit einem Tipp ein', () => {
    const { container, dispatch } = zeige(ProgrammScreen, { screen: 'programm' })
    expect(container.textContent).toContain(t.ozAnsichtHint)
    const eintragen = knopf(container, t.ozEintragen)
    // Vier Wochen stehen offen da, je eine Schicht am Mittwoch.
    expect(eintragen).toHaveLength(4)
    fireEvent.click(eintragen[0]!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'ozEintragen', terminId: 't1', datum: '2026-09-09' })
  })

  it('ohne den Aufgabenbereich gibt es keinen Knopf, nur den Hinweis', () => {
    const { container } = zeige(ProgrammScreen, { screen: 'programm', personId: OTTO.id })
    expect(container.textContent).toContain(t.ozNichtFreigegeben)
    expect(knopf(container, t.ozEintragen)).toEqual([])
  })

  it('wer eingetragen ist, sieht sich, hat zugesagt — und kann absagen', () => {
    const e = eintrag(SIMON.id, true)
    const { container, dispatch } = zeige(ProgrammScreen, { screen: 'programm', ozEintraege: [e] })
    expect(container.textContent).toContain(t.ozDuEingetragen)
    expect(knopf(container, t.bestaetigen)).toEqual([])
    fireEvent.click(knopf(container, t.ozAbsagen)[0]!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'declineTask', id: `oz|2026-09-07|${e.id}` })
  })

  it('wer zugeteilt wurde, bestätigt hier wie unter „Meine Aufgaben"', () => {
    const e = eintrag(SIMON.id)
    const { container, dispatch } = zeige(ProgrammScreen, { screen: 'programm', ozEintraege: [e] })
    fireEvent.click(knopf(container, t.bestaetigen)[0]!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'confirmTask', id: `oz|2026-09-07|${e.id}` })
  })

  it('eine volle Schicht bietet nichts mehr an', () => {
    const { container } = zeige(ProgrammScreen, {
      screen: 'programm',
      ozEintraege: [eintrag(ANNA.id, true), eintrag(OTTO.id)],
      ozTermine: [{ ...MITTWOCH }],
    })
    // Die erste Woche ist voll, die drei folgenden nicht.
    expect(knopf(container, t.ozEintragen)).toHaveLength(3)
  })
})

describe('Planen: Termine, Zuteilen, Senden', () => {
  it('ein Termin lässt sich anlegen und ändern', () => {
    const { container, dispatch } = zeige(PlanenScreen, { screen: 'planen', planner: true })
    fireEvent.click(knopf(container, t.ozTerminAdd)[0]!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'ozTerminAdd' })
    const ort = container.querySelector(`input[aria-label="${t.fsOrtPh}"]`) as HTMLInputElement
    fireEvent.change(ort, { target: { value: 'Bahnhof' } })
    expect(dispatch).toHaveBeenCalledWith({ type: 'ozTerminUpdate', id: 't1', patch: { ort: 'Bahnhof' } })
  })

  it('freie Plätze bieten nur an, wer den Aufgabenbereich hat', () => {
    const { container, dispatch } = zeige(PlanenScreen, { screen: 'planen', planner: true })
    const wahl = container.querySelector('select.oz-zuteilen') as HTMLSelectElement
    const namen = [...wahl.options].map((o) => o.textContent)
    expect(namen).toEqual([t.zuteilenChip, 'Anna Test', 'Simon Test'])
    fireEvent.change(wahl, { target: { value: ANNA.id } })
    expect(dispatch).toHaveBeenCalledWith({ type: 'ozZuteilen', terminId: 't1', datum: '2026-09-09', pid: ANNA.id })
  })

  it('wer zugeteilt ist und noch nichts weiß, steht bei „Plan senden"', () => {
    const { container } = zeige(PlanenScreen, { screen: 'planen', planner: true, ozEintraege: [eintrag(ANNA.id)] })
    expect(container.textContent).toContain(fill(t.ozSendenOffen, { n: 1 }))
    expect(container.querySelector('.plan-senden-namen')?.textContent).toBe('Anna Test')
  })

  it('ohne Termine nur der Hinweis und der Knopf zum Anlegen', () => {
    const { container } = zeige(PlanenScreen, { screen: 'planen', planner: true, ozTermine: [] })
    expect(container.textContent).toContain(t.ozKeineTermine)
    expect(container.querySelector('.plan-auto')).toBeNull()
  })
})

/*
 * **Ein anderer Wochentag fragt nach, wenn dabei Einträge gehen** (3.10.2026).
 * Die kommenden stünden an einem Tag, an dem der Termin nicht mehr stattfindet;
 * wer zugesagt hatte, bekommt „Zuteilung zurückgezogen", und Zurückstellen holt
 * nichts zurück. Unter Windows genügte dafür eine Pfeiltaste auf dem Feld.
 */
describe('Planen: Wochentag eines Termins ändern', () => {
  const tagFeld = (c: HTMLElement) => c.querySelector(`select[aria-label="${t.a11yWeekday}"]`) as HTMLSelectElement
  const planen = (ozEintraege: OzEintrag[]) => zeige(PlanenScreen, { screen: 'planen', planner: true, ozEintraege })

  it('mit kommenden Einträgen: erst die Rückfrage mit Tag und Zahl, dann „Verlegen"', () => {
    const { container, dispatch } = planen([eintrag(ANNA.id), eintrag(SIMON.id, true, '2026-09-16')])
    fireEvent.change(tagFeld(container), { target: { value: '4' } })
    expect(dispatch).not.toHaveBeenCalled()
    expect(container.querySelector('.oz-rueckfrage')?.textContent).toContain(
      fill(t.ozTagWechselFrage, { tag: wochentagNameAusWd(4, 'de'), n: 2 }),
    )
    // Das Feld zeigt die Wahl schon — gilt aber erst mit dem Knopf.
    expect(tagFeld(container).value).toBe('4')
    fireEvent.click(knopf(container, t.ozTagWechseln)[0]!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'ozTerminUpdate', id: 't1', patch: { wd: 4 } })
    expect(container.querySelector('.oz-rueckfrage')).toBeNull()
  })

  it('„Abbrechen" lässt alles, wie es war', () => {
    const { container, dispatch } = planen([eintrag(ANNA.id)])
    fireEvent.change(tagFeld(container), { target: { value: '4' } })
    fireEvent.click(knopf(container, t.abbrechen)[0]!)
    expect(dispatch).not.toHaveBeenCalled()
    expect(container.querySelector('.oz-rueckfrage')).toBeNull()
    expect(tagFeld(container).value).toBe('3')
  })

  it('zurück auf den alten Tag gewählt: keine Rückfrage, nichts geändert', () => {
    const { container, dispatch } = planen([eintrag(ANNA.id)])
    fireEvent.change(tagFeld(container), { target: { value: '4' } })
    fireEvent.change(tagFeld(container), { target: { value: '3' } })
    expect(container.querySelector('.oz-rueckfrage')).toBeNull()
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('ohne kommende Einträge ändert sich der Tag sofort', () => {
    const { container, dispatch } = planen([])
    fireEvent.change(tagFeld(container), { target: { value: '4' } })
    expect(dispatch).toHaveBeenCalledWith({ type: 'ozTerminUpdate', id: 't1', patch: { wd: 4 } })
    expect(container.querySelector('.oz-rueckfrage')).toBeNull()
  })

  it('ein Eintrag von heute zählt nicht — er bleibt, also fragt nichts', () => {
    vi.setSystemTime(new Date(2026, 8, 9, 7, 0)) // Mittwoch früh, die Schicht ist heute
    const { container, dispatch } = planen([eintrag(ANNA.id)])
    fireEvent.change(tagFeld(container), { target: { value: '4' } })
    expect(dispatch).toHaveBeenCalledWith({ type: 'ozTerminUpdate', id: 't1', patch: { wd: 4 } })
  })
})
