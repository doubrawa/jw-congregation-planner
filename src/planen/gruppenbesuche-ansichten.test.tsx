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
import { fsSetLeader, genFsWeek } from '../data/fs'
import { tagNach } from '../data/meeting-dates'
import { dict } from '../i18n/ui'
import { fill } from '../i18n/useT'
import type { FsInstance, Gruppenbesuch } from '../data/types'
import { PlanenScreen } from './PlanenScreen'

/**
 * **Gruppenbesuche beim Planen — bedient, nicht nur angezeigt** (T120, Phase 2).
 *
 * `PlanenScreen.test.tsx` prüft, dass der Plan dasteht und „Reihum verteilen"
 * einen Besucher braucht. Alles andere — Besuch hinzufügen, entfernen, einen
 * anderen Besucher einsetzen, übernehmen, und welcher Satz bei welchem Stand
 * erscheint — lief bis zum 3.10.2026 in keinem Test. Die Regeln dahinter prüfen
 * `data/gruppenbesuche.test.ts` und `app/gruppenbesuche-reducer.test.ts`; hier
 * geht es darum, dass die Knöpfe sie auslösen und die Sätze stimmen.
 */

const t = dict('de')
const demo = demoZustand()
const KENN = demo.weeks.map((w) => w.start)
/** Woche 1 der Testdaten und eine Gruppe, die sich dort trifft. */
const W1 = KENN[1]!
const GRP = demo.fsWeeks[1]!.find((i) => i.grp)!.grp!
const MANFRED = demo.persons.find((p) => p.id === 'p1')! // darf Treffpunkte leiten
const THOMAS = demo.persons.find((p) => p.id === 'p2')!

/** Die Treffpunkte der Gruppe in Woche 1 mit diesem Leiter (leer: ohne). */
function leiterInW1(name: string, pid?: string): FsInstance[][] {
  let fsWeeks = demo.fsWeeks
  for (const inst of demo.fsWeeks[1]!.filter((i) => i.grp === GRP)) fsWeeks = fsSetLeader(fsWeeks, 1, inst.id, name, pid)
  return fsWeeks
}

const besuch = (woche: string, pid: string | null = MANFRED.id, id = `b-${woche}`): Gruppenbesuch => ({ id, woche, grp: GRP, pid })

function zeige(over: Partial<AppState> = {}) {
  const dispatch = vi.fn()
  const state: AppState = {
    ...demo,
    screen: 'planen',
    tab: 'fs',
    fsBereich: 'gruppenbesuche',
    planner: true,
    dataStatus: 'ready',
    congregationId: 'c1',
    userId: 'u1',
    absences: [],
    confirmations: {},
    gruppenbesuche: [],
    ...over,
  }
  function Buehne() {
    const store = useStaticStore(state)
    return (
      <AppDispatchContext.Provider value={dispatch}>
        <AppStoreContext.Provider value={store}>
          <AppStateContext.Provider value={state}>
            <PlanenScreen />
          </AppStateContext.Provider>
        </AppStoreContext.Provider>
      </AppDispatchContext.Provider>
    )
  }
  return { dispatch, ...render(<Buehne />) }
}

const knopf = (c: Element, text: string) => [...c.querySelectorAll('button')].find((b) => b.textContent === text)
const zeile = (c: Element) => c.querySelector('.gb-zeile')!
const probleme = (c: Element) => [...zeile(c).querySelectorAll('.gb-problem')].map((p) => p.textContent)

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 8, 7, 9, 0)) // Montag, 7. September 2026
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('Besuch hinzufügen', () => {
  it('Woche und Gruppe wählen — ohne Besucher gesperrt, mit ihm geht der Besuch hinaus', () => {
    const { container, dispatch } = zeige()
    const hinzu = knopf(container.querySelector('.fs-add')!, t.hinzufuegen)!
    expect(hinzu.disabled).toBe(true)

    fireEvent.change(container.querySelector(`select[aria-label="${t.gbWoche}"]`)!, { target: { value: W1 } })
    fireEvent.change(container.querySelector(`select[aria-label="${t.gbGruppe}"]`)!, { target: { value: GRP } })
    fireEvent.change(container.querySelector('.gb-besucher select')!, { target: { value: MANFRED.id } })
    expect(hinzu.disabled).toBe(false)
    fireEvent.click(hinzu)
    expect(dispatch).toHaveBeenCalledWith({ type: 'besuchHinzufuegen', woche: W1, grp: GRP, pid: MANFRED.id })
  })

  it('der Besucher des jüngsten Besuchs steht schon da — der Knopf ist gleich frei', () => {
    const { container } = zeige({ gruppenbesuche: [besuch(W1)], fsWeeks: leiterInW1('Manfred Albrecht', MANFRED.id) })
    expect((container.querySelector('.gb-besucher select') as HTMLSelectElement).value).toBe(MANFRED.id)
    expect(knopf(container.querySelector('.fs-add')!, t.hinzufuegen)!.disabled).toBe(false)
  })
})

describe('Ein Besuch in der Liste', () => {
  it('lässt sich entfernen — erst nach der Rückfrage (4.10.2026)', () => {
    const b = besuch(W1)
    const { container, dispatch } = zeige({ gruppenbesuche: [b], fsWeeks: leiterInW1('Manfred Albrecht', MANFRED.id) })
    fireEvent.click(zeile(container).querySelector(`button[aria-label="${t.a11yRemove}"]`)!)
    expect(dispatch).not.toHaveBeenCalledWith({ type: 'besuchEntfernen', id: b.id })
    const geschaerft = zeile(container).querySelector('.fs-remove.is-armed')
    expect(geschaerft?.textContent).toBe(t.loeschenSicher)
    // Ein Tipp daneben bricht ab …
    fireEvent.blur(geschaerft!)
    expect(zeile(container).querySelector('.fs-remove.is-armed')).toBeNull()
    // … und erst der zweite Tipp hintereinander entfernt.
    fireEvent.click(zeile(container).querySelector(`button[aria-label="${t.a11yRemove}"]`)!)
    fireEvent.click(zeile(container).querySelector('.fs-remove.is-armed')!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'besuchEntfernen', id: b.id })
  })

  it('ein anderer Besucher — „Besucher wählen" allein ändert nichts', () => {
    const b = besuch(W1)
    const { container, dispatch } = zeige({ gruppenbesuche: [b], fsWeeks: leiterInW1('Manfred Albrecht', MANFRED.id) })
    const wahl = zeile(container).querySelector(`select[aria-label="${t.gbBesucher}"]`)!
    fireEvent.change(wahl, { target: { value: THOMAS.id } })
    expect(dispatch).toHaveBeenCalledWith({ type: 'besuchBesucher', id: b.id, pid: THOMAS.id })
    dispatch.mockClear()
    fireEvent.change(wahl, { target: { value: '' } })
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('eingetragen: kein Problem, kein Knopf zum Übernehmen', () => {
    const { container } = zeige({ gruppenbesuche: [besuch(W1)], fsWeeks: leiterInW1('Manfred Albrecht', MANFRED.id) })
    expect(probleme(container)).toEqual([])
    expect(knopf(zeile(container), t.gbUebernehmen)).toBeUndefined()
    expect(knopf(zeile(container), t.gbEintragen)).toBeUndefined()
    expect(container.querySelector('.plan-conflicts')).toBeNull()
  })

  it('vorbei: kein Entfernen, kein Wechsel — nur die Marke', () => {
    const vorbei = besuch('2026-08-24')
    const { container } = zeige({ gruppenbesuche: [vorbei] })
    expect(zeile(container).querySelector(`button[aria-label="${t.a11yRemove}"]`)).toBeNull()
    expect(zeile(container).querySelector('select')).toBeNull()
    expect(zeile(container).textContent).toContain(t.gbVorbei)
  })
})

describe('Was an einem Besuch nicht aufgeht — an der Zeile und im Banner', () => {
  it('ein anderer Leiter: der Satz nennt ihn, „Übernehmen" trägt den Besucher ein', () => {
    const b = besuch(W1)
    const { container, dispatch } = zeige({ gruppenbesuche: [b], fsWeeks: leiterInW1('Thomas Lindner', THOMAS.id) })
    const satz = fill(t.gbAndererLeiter, { name: 'Thomas Lindner' })
    expect(probleme(container)).toEqual([satz])
    expect(container.querySelector('.plan-conflicts')?.textContent).toContain(satz)
    fireEvent.click(knopf(zeile(container), t.gbUebernehmen)!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'besuchUebernehmen', id: b.id })
  })

  it('ein Treffpunkt ohne Leiter: „Eintragen" holt den Besucher dorthin', () => {
    const b = besuch(W1)
    const { container, dispatch } = zeige({ gruppenbesuche: [b], fsWeeks: leiterInW1('') })
    expect(probleme(container)).toEqual([t.gbOffen])
    fireEvent.click(knopf(zeile(container), t.gbEintragen)!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'besuchUebernehmen', id: b.id })
  })

  it('der Besucher ist in der Woche abwesend', () => {
    const urlaub = { id: 'a1', personId: MANFRED.id, userId: null, from: W1, to: tagNach(W1, 6), reason: '' }
    const { container } = zeige({
      gruppenbesuche: [besuch(W1)],
      fsWeeks: leiterInW1('Manfred Albrecht', MANFRED.id),
      absences: [urlaub],
    })
    expect(probleme(container)).toEqual([fill(t.toastAbsentP, { name: 'Manfred Albrecht' })])
  })

  it('die Gruppe trifft sich in dieser Woche nicht (am ersten Samstag der Versammlungstreffpunkt)', () => {
    const ohne = KENN.find((_w, wi) => wi > 0 && !demo.fsWeeks[wi]!.some((i) => i.grp === GRP))!
    expect(ohne).toBeDefined()
    const { container } = zeige({ gruppenbesuche: [besuch(ohne)] })
    expect(probleme(container)).toEqual([t.gbKeinTreffpunkt])
    expect(knopf(zeile(container), t.gbUebernehmen)).toBeUndefined()
  })

  it('vorgemerkt: Woche noch nicht geladen — Marke und Hinweis, kein Problem', () => {
    // Die erste Woche nach den geladenen, in der sich die Gruppe laut Grundplan trifft.
    const spaeter = Array.from({ length: 8 }, (_unused, i) => tagNach(KENN.at(-1)!, 7 * (i + 1))).find((w) =>
      genFsWeek(w, demo.fsRules).some((inst) => inst.grp === GRP),
    )!
    const { container } = zeige({ gruppenbesuche: [besuch(spaeter)] })
    expect(zeile(container).textContent).toContain(t.gbVorgemerkt)
    expect(zeile(container).textContent).toContain(t.gbVorgemerktHint)
    expect(probleme(container)).toEqual([])
  })

  it('ohne Besucher (Person gelöscht): „Besucher wählen" steht als Problem da', () => {
    const { container } = zeige({ gruppenbesuche: [besuch(W1, null)], fsWeeks: leiterInW1('') })
    expect(probleme(container)).toContain(t.gbBesucherWaehlen)
    // Ohne Besucher gibt es nichts einzutragen.
    expect(knopf(zeile(container), t.gbEintragen)).toBeUndefined()
  })
})
