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
import { ProgrammScreen } from '../programm/ProgrammScreen'
import type { Group, Person, PlanEintrag, WeitererPlan } from '../data/types'
import { PlanenScreen } from './PlanenScreen'

/**
 * **Weitere Pläne an der Oberfläche** (T120, Phase 5): was der Planer anlegt
 * und einstellt, und was ein Mitglied davon sieht. Die Regeln dahinter prüfen
 * `data/weitere-plaene.test.ts` und `app/weitere-plaene-reducer.test.ts`.
 */

const t = dict('de')

const person = (id: string, fn: string, grp: string | null): Person => ({
  id,
  fn,
  ln: 'Test',
  role: 'verkuendiger',
  female: false,
  tel: '',
  mail: '',
  priv: emptyQualifications(),
  grp,
  fam: null,
})
const ANNA = person('p-a', 'Anna', 'g1')
const CARL = person('p-c', 'Carl', 'g2')
const GRUPPEN: Group[] = [
  { id: 'g1', name: 'Gruppe 1', overseerId: null, assistantId: null },
  { id: 'g2', name: 'Gruppe 2', overseerId: null, assistantId: null },
]

const SAAL: WeitererPlan = { id: 'pl-s', name: 'Winterdienst', von: '2026-09-07', bis: '2026-09-27', entwurf: false }
const ENTWURF: WeitererPlan = { ...SAAL, id: 'pl-e', name: 'Grundreinigung', entwurf: true }
const EINTRAEGE: PlanEintrag[] = [
  { id: 'w1', planId: 'pl-s', datum: '2026-09-07', grp: 'g2' },
  { id: 'w2', planId: 'pl-s', datum: '2026-09-14', grp: 'g1' },
  { id: 'w3', planId: 'pl-s', datum: '2026-09-21', grp: 'g2' },
]

function zeige(Screen: () => React.JSX.Element, over: Partial<AppState> = {}) {
  const dispatch = vi.fn()
  const state: AppState = {
    ...demoZustand(),
    tab: 'wp',
    dataStatus: 'ready',
    congregationId: 'c1',
    userId: 'u1',
    personId: ANNA.id,
    planner: false,
    persons: [ANNA, CARL],
    groups: GRUPPEN,
    plaene: [SAAL, ENTWURF],
    planEintraege: EINTRAEGE,
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

const knopf = (c: HTMLElement, text: string) => [...c.querySelectorAll('button')].find((b) => b.textContent === text)

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 8, 7, 9, 0)) // Montag, 7. September 2026
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('Ansehen', () => {
  it('Veröffentlichtes sieht jeder, gleich welcher Gruppe — Entwürfe nie', () => {
    const anna = zeige(ProgrammScreen, { screen: 'programm' }).container
    expect([...anna.querySelectorAll('.wp-name')].map((n) => n.textContent)).toEqual(['Winterdienst'])
    cleanup()
    const carl = zeige(ProgrammScreen, { screen: 'programm', personId: CARL.id }).container
    expect([...carl.querySelectorAll('.wp-name')].map((n) => n.textContent)).toEqual(['Winterdienst'])
  })

  it('„Deine Gruppe ist dran" nennt die Wochen der eigenen Gruppe', () => {
    const { container } = zeige(ProgrammScreen, { screen: 'programm' })
    expect(container.textContent).toContain(t.wpDeineGruppe)
    expect([...container.querySelectorAll('.wp-chip')].map((c) => c.textContent)).toEqual(['14.–20. September'])
  })

  it('die Woche der eigenen Gruppe ist hervorgehoben — und nichts ist zu bestätigen', () => {
    const { container } = zeige(ProgrammScreen, { screen: 'programm' })
    expect([...container.querySelectorAll('.wp-liste-zeile.is-eigen')].map((z) => z.textContent)).toEqual([
      '14.–20. SeptemberGruppe 1',
    ])
    expect(container.textContent).toContain(t.wpNurInfo)
    expect(knopf(container, t.bestaetigen)).toBeUndefined()
  })

  it('ohne sichtbaren Plan nur der Hinweis', () => {
    const { container } = zeige(ProgrammScreen, { screen: 'programm', plaene: [ENTWURF] })
    expect(container.textContent).toContain(t.wpKeine)
  })

  it('im Monatstakt stehen Monate da — der laufende zuerst, auch bei „Deine Gruppe ist dran"', () => {
    const monate: WeitererPlan = { ...SAAL, von: '2026-08-01', bis: '2026-10-31', takt: 'monat' }
    const { container } = zeige(ProgrammScreen, {
      screen: 'programm',
      plaene: [monate],
      planEintraege: [
        { id: 'm8', planId: 'pl-s', datum: '2026-08-01', grp: 'g2' }, // vorbei
        { id: 'm9', planId: 'pl-s', datum: '2026-09-01', grp: 'g1' },
        { id: 'm10', planId: 'pl-s', datum: '2026-10-01', grp: 'g2' },
      ],
    })
    expect([...container.querySelectorAll('.wp-liste-zeile')].map((z) => z.textContent)).toEqual([
      'September 2026Gruppe 1',
      'Oktober 2026Gruppe 2',
    ])
    expect([...container.querySelectorAll('.wp-chip')].map((c) => c.textContent)).toEqual(['September 2026'])
  })
})

describe('Planen', () => {
  const planen = (over: Partial<AppState> = {}) => zeige(PlanenScreen, { screen: 'planen', planner: true, ...over })

  it('die Liste: aktuell und Entwürfe', () => {
    const { container } = planen()
    expect([...container.querySelectorAll('.wp-abschnitt-titel')].map((h) => h.textContent)).toEqual([t.wpAktuell, t.wpEntwuerfe])
    expect(container.querySelector('.wp-karte[data-stand="entwurf"]')?.textContent).toContain('Grundreinigung')
  })

  it('ein neuer Plan: ohne Wahl als Entwurf angelegt, ab dieser Woche ein Vierteljahr', () => {
    // Dass er danach gleich offen dasteht, prüft `zurueck-am-handy.test.tsx`
    // mit dem echten Speicher; hier nimmt die Attrappe die Aktion nur entgegen.
    const { container, dispatch } = planen()
    fireEvent.click(knopf(container, t.wpNeu)!)
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch).toHaveBeenCalledWith({
      type: 'wpPlanAnlegen',
      plan: { id: expect.stringMatching(/^p.{8,}/), name: '', von: '2026-09-07', bis: '2026-12-06', entwurf: true },
    })
  })

  it('ein offener Plan: Name, verteilen, eine Woche umsetzen, zurück zum Entwurf', () => {
    const { container, dispatch } = planen()
    fireEvent.click([...container.querySelectorAll('.wp-karte')].find((k) => k.textContent?.includes('Winterdienst'))!)
    fireEvent.change(container.querySelector('input[type="text"]')!, { target: { value: 'Winterdienst 2026' } })
    expect(dispatch).toHaveBeenCalledWith({ type: 'wpPlanAendern', id: 'pl-s', patch: { name: 'Winterdienst 2026' } })
    fireEvent.click(knopf(container, t.gbVerteilen)!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'wpGruppenVerteilen', planId: 'pl-s', abGruppe: 'g1' })
    const wochen = [...container.querySelectorAll(`.wp-zeile select[aria-label="${t.gbGruppe}"]`)] as HTMLSelectElement[]
    expect(wochen.map((w) => w.value)).toEqual(['g2', 'g1', 'g2'])
    fireEvent.change(wochen[1]!, { target: { value: '' } })
    expect(dispatch).toHaveBeenCalledWith({ type: 'wpEintragSetzen', planId: 'pl-s', datum: '2026-09-14', grp: null })
    fireEvent.click(knopf(container, t.wpZurueckziehen)!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'wpPlanAendern', id: 'pl-s', patch: { entwurf: true } })
  })

  it('der Takt ist wählbar — wöchentlich ist vorgegeben', () => {
    const { container, dispatch } = planen()
    fireEvent.click([...container.querySelectorAll('.wp-karte')].find((k) => k.textContent?.includes('Winterdienst'))!)
    const takt = [...container.querySelectorAll('select')].find((s) => s.querySelector('option[value="monat"]')) as HTMLSelectElement
    expect(takt.value).toBe('woche')
    expect([...takt.options].map((o) => o.textContent)).toEqual([t.fsFreqW, t.wpJedenMonat])
    fireEvent.change(takt, { target: { value: 'monat' } })
    expect(dispatch).toHaveBeenCalledWith({ type: 'wpPlanAendern', id: 'pl-s', patch: { takt: 'monat' } })
  })

  it('im Monatstakt: Monate als Zeilen, die Hinweise sprechen von Monaten', () => {
    const monate: WeitererPlan = { ...SAAL, von: '2026-09-07', bis: '2026-11-30', takt: 'monat' }
    const { container, dispatch } = planen({
      plaene: [monate],
      planEintraege: [{ id: 'm10', planId: 'pl-s', datum: '2026-10-01', grp: 'g2' }],
    })
    fireEvent.click(container.querySelector('.wp-karte')!)
    expect([...container.querySelectorAll('.wp-zeile-wann')].map((z) => z.textContent)).toEqual([
      'September 2026',
      'Oktober 2026',
      'November 2026',
    ])
    expect(container.textContent).toContain(t.wpSaalTextMonat)
    expect(container.textContent).toContain(t.wpVerteilenHintMonat)
    expect(container.textContent).not.toContain(t.wpSaalText)
    const zeilen = [...container.querySelectorAll(`.wp-zeile select[aria-label="${t.gbGruppe}"]`)] as HTMLSelectElement[]
    expect(zeilen.map((z) => z.value)).toEqual(['', 'g2', ''])
    // Eine Zeile meint ihren Monat: gesetzt wird der Monatserste.
    fireEvent.change(zeilen[2]!, { target: { value: 'g1' } })
    expect(dispatch).toHaveBeenCalledWith({ type: 'wpEintragSetzen', planId: 'pl-s', datum: '2026-11-01', grp: 'g1' })
  })

  it('löschen braucht zwei Tipps', () => {
    const { container, dispatch } = planen()
    fireEvent.click([...container.querySelectorAll('.wp-karte')].find((k) => k.textContent?.includes('Grundreinigung'))!)
    fireEvent.click(knopf(container, t.wpLoeschen)!)
    expect(dispatch).not.toHaveBeenCalledWith({ type: 'wpPlanLoeschen', id: 'pl-e' })
    fireEvent.click(knopf(container, t.loeschenSicher)!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'wpPlanLoeschen', id: 'pl-e' })
  })
})

/**
 * **Der Planer verteilt die Gruppen, den Plan pflegt der Admin** (Rechte-Stufe
 * „Planer", 4.10.2026 — einer der vier Grenzfälle des Betreibers). Name,
 * Zeitraum, Takt, Veröffentlichen und Löschen ändern den Plan; die Einträge
 * darin sind die Zuteilung.
 */
describe('Der Planer in den Weiteren Plänen (4.10.2026)', () => {
  const alsPlaner = () => zeige(PlanenScreen, { screen: 'planen', planner: false, zuteiler: true })
  const oeffnen = (c: HTMLElement, name: string) =>
    fireEvent.click([...c.querySelectorAll('.wp-karte')].find((k) => k.textContent?.includes(name))!)

  it('legt keinen Plan an — sieht aber auch die Entwürfe, um darin zu verteilen', () => {
    const { container } = alsPlaner()
    expect(container.querySelector('.wp-neu')).toBeNull()
    expect(container.textContent).toContain('Grundreinigung')
  })

  it('verteilt und setzt einzelne Wochen — ohne Name, Zeitraum, Takt, Veröffentlichen und Löschen', () => {
    const { container, dispatch } = alsPlaner()
    oeffnen(container, 'Winterdienst')
    expect(container.querySelector('input[type="text"]')).toBeNull()
    expect(container.querySelector('.wp-veroeffentlichen')).toBeNull()
    expect(knopf(container, t.wpLoeschen)).toBeUndefined()
    expect(container.textContent).toContain('Winterdienst')
    fireEvent.click(knopf(container, t.gbVerteilen)!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'wpGruppenVerteilen', planId: 'pl-s', abGruppe: 'g1' })
    const wochen = [...container.querySelectorAll(`.wp-zeile select[aria-label="${t.gbGruppe}"]`)] as HTMLSelectElement[]
    fireEvent.change(wochen[0]!, { target: { value: 'g1' } })
    expect(dispatch).toHaveBeenCalledWith({ type: 'wpEintragSetzen', planId: 'pl-s', datum: '2026-09-07', grp: 'g1' })
  })
})
