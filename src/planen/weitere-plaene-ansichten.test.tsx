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

const person = (id: string, fn: string, grp: string | null, fam: string | null = null): Person => ({
  id,
  fn,
  ln: 'Test',
  role: 'verkuendiger',
  female: false,
  tel: '',
  mail: '',
  priv: emptyQualifications(),
  grp,
  fam,
})
const ANNA = person('p-a', 'Anna', 'g1', 'h1')
const BERT = person('p-b', 'Bert', 'g2', 'h1') // derselbe Haushalt wie Anna
const CARL = person('p-c', 'Carl', 'g2')
const GRUPPEN: Group[] = [
  { id: 'g1', name: 'Gruppe 1', overseerId: null, assistantId: null },
  { id: 'g2', name: 'Gruppe 2', overseerId: null, assistantId: null },
]

const SAAL: WeitererPlan = { id: 'pl-s', vorlage: 'saal', name: 'Winterdienst', von: '2026-09-07', bis: '2026-09-27', entwurf: false }
const FAMILIEN: WeitererPlan = { id: 'pl-f', vorlage: 'familien', name: 'Besuch', von: '2026-09-22', bis: '2026-09-23', entwurf: false }
const ENTWURF: WeitererPlan = { ...SAAL, id: 'pl-e', name: 'Grundreinigung', entwurf: true }
const EINTRAEGE: PlanEintrag[] = [
  { id: 'w1', planId: 'pl-s', datum: '2026-09-07', grp: 'g2', pid: null, mahlzeit: null },
  { id: 'w2', planId: 'pl-s', datum: '2026-09-14', grp: 'g1', pid: null, mahlzeit: null },
  { id: 'w3', planId: 'pl-s', datum: '2026-09-21', grp: 'g2', pid: null, mahlzeit: null },
  { id: 'f1', planId: 'pl-f', datum: '2026-09-22', grp: null, pid: 'p-b', mahlzeit: 'abend' },
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
    persons: [ANNA, BERT, CARL],
    groups: GRUPPEN,
    plaene: [SAAL, FAMILIEN, ENTWURF],
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
  it('Königreichssaal für alle, Familien reihum für Gastgeber und ihren Haushalt — Entwürfe nie', () => {
    const anna = zeige(ProgrammScreen, { screen: 'programm' }).container
    const namen = [...anna.querySelectorAll('.wp-name')].map((n) => n.textContent)
    expect(namen).toEqual(['Winterdienst', 'Besuch'])
    cleanup()
    const carl = zeige(ProgrammScreen, { screen: 'programm', personId: CARL.id }).container
    expect([...carl.querySelectorAll('.wp-name')].map((n) => n.textContent)).toEqual(['Winterdienst'])
  })

  it('„Deine Gruppe ist dran" nennt die Wochen der eigenen Gruppe', () => {
    const { container } = zeige(ProgrammScreen, { screen: 'programm' })
    expect(container.textContent).toContain(t.wpDeineGruppe)
    expect([...container.querySelectorAll('.wp-chip')].map((c) => c.textContent)).toEqual(['14.–20. September'])
  })

  it('der Gastgeber aus dem eigenen Haushalt trägt das DU — und nichts ist zu bestätigen', () => {
    const { container } = zeige(ProgrammScreen, { screen: 'programm' })
    expect(container.querySelector('.wp-liste-zeile.is-eigen .chip-du')).not.toBeNull()
    expect(container.textContent).toContain(t.wpNurInfo)
    expect(knopf(container, t.bestaetigen)).toBeUndefined()
  })

  it('ohne sichtbaren Plan nur der Hinweis', () => {
    const { container } = zeige(ProgrammScreen, { screen: 'programm', plaene: [ENTWURF] })
    expect(container.textContent).toContain(t.wpKeine)
  })
})

describe('Planen', () => {
  const planen = (over: Partial<AppState> = {}) => zeige(PlanenScreen, { screen: 'planen', planner: true, ...over })

  it('die Liste: aktuell und Entwürfe', () => {
    const { container } = planen()
    expect([...container.querySelectorAll('.wp-abschnitt-titel')].map((h) => h.textContent)).toEqual([t.wpAktuell, t.wpEntwuerfe])
    expect(container.querySelector('.wp-karte[data-stand="entwurf"]')?.textContent).toContain('Grundreinigung')
  })

  it('ein neuer Plan: Vorlage wählen, als Entwurf anlegen — und gleich offen', () => {
    const { container, dispatch } = planen()
    fireEvent.click(knopf(container, t.wpNeu)!)
    fireEvent.click(container.querySelector('.wp-vorlage-karte[data-vorlage="familien"]')!)
    expect(dispatch).toHaveBeenCalledWith({
      type: 'wpPlanAnlegen',
      plan: expect.objectContaining({ vorlage: 'familien', von: '2026-09-07', bis: '2026-09-13', entwurf: true }),
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
    expect(dispatch).toHaveBeenCalledWith({
      type: 'wpEintragSetzen',
      planId: 'pl-s',
      datum: '2026-09-14',
      mahlzeit: null,
      grp: null,
      pid: null,
    })
    fireEvent.click(knopf(container, t.wpZurueckziehen)!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'wpPlanAendern', id: 'pl-s', patch: { entwurf: true } })
  })

  it('Familien reihum: je Tag drei Mahlzeiten, je Mahlzeit ein Gastgeber', () => {
    const { container, dispatch } = planen()
    fireEvent.click([...container.querySelectorAll('.wp-karte')].find((k) => k.textContent?.includes('Besuch'))!)
    const plaetze = [...container.querySelectorAll('.panel[data-farbe="gold"] select')] as HTMLSelectElement[]
    expect(plaetze).toHaveLength(6)
    expect(plaetze[2]!.value).toBe('p-b') // Dienstag, Abendessen
    fireEvent.change(plaetze[0]!, { target: { value: 'p-c' } })
    expect(dispatch).toHaveBeenCalledWith({
      type: 'wpEintragSetzen',
      planId: 'pl-f',
      datum: '2026-09-22',
      mahlzeit: 'fruehstueck',
      grp: null,
      pid: 'p-c',
    })
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
