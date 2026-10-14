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
import type { Group, Person } from '../data/types'
import { dict } from '../i18n/ui'
import { GruppenInhalt } from './GruppenInhalt'

/**
 * **Gruppen** (T121, Phase 6c-3, Entwürfe `GGruppenStandorte`, `GGruppe`,
 * `GDesktopEinstellungen`): wer ohne Gruppe ist, die Predigtdienstgruppen mit
 * Aufseher, Gehilfe und Zahl, und je Gruppe ein Blatt — Name, Besetzung,
 * Treffpunkte, was beim Entfernen mitgeht.
 *
 * **Aufseher und Gehilfe** sind nicht beliebig besetzbar: Aufseher nur Älteste
 * und Dienstamtgehilfen, Gehilfe jeder Bruder. **Entfernen nur mit Rückfrage**
 * (gemeldet am 13.9.2026): Ein Tipp löschte die Gruppe sofort, und ihre
 * Mitglieder standen still ohne Gruppe da.
 */

vi.mock('../lib/supabase', () => ({ supabase: null, isSupabaseConfigured: false, performLogout: vi.fn() }))

const t = dict('de')

const person = (id: string, fn: string, ln: string, over: Partial<Person> = {}): Person => ({
  id, fn, ln, role: 'verkuendiger', female: false, tel: '', mail: '', priv: emptyQualifications(), grp: null, ...over,
})

const AELTESTER = person('p-ae', 'Anton', 'Alt', { role: 'aeltester' })
const GEHILFE = person('p-dg', 'Bernd', 'Brand', { role: 'dienstamtgehilfe' })
const BRUDER = person('p-v', 'Carlo', 'Cohn')
const SCHWESTER = person('p-s', 'Dora', 'Dietz', { female: true })
const PERSONEN = [AELTESTER, GEHILFE, BRUDER, SCHWESTER]

const GRUPPE_1: Group = { id: 'g1', name: 'Gruppe 1', overseerId: 'p-ae', assistantId: 'p-v' }

function zeige(over: Partial<AppState> = {}, tabelle = false) {
  const dispatch = vi.fn()
  const state: AppState = {
    ...demoZustand(),
    dataStatus: 'ready', congregationId: 'c1', userId: 'u1', planner: true,
    persons: PERSONEN, groups: [GRUPPE_1], fsRules: [], fsWeeks: [], gruppenbesuche: [], planEintraege: [],
    ...over,
  }
  function Buehne() {
    const store = useStaticStore(state)
    return (
      <AppDispatchContext.Provider value={dispatch}>
        <AppStoreContext.Provider value={store}>
          <AppStateContext.Provider value={state}>
            <GruppenInhalt tabelle={tabelle} />
          </AppStateContext.Provider>
        </AppStoreContext.Provider>
      </AppDispatchContext.Provider>
    )
  }
  return { dispatch, ...render(<Buehne />) }
}

beforeEach(() => {
  // Das Blatt lässt sich nach unten wegwischen; die Geste fragt, ob wir am
  // Schreibtisch sitzen. jsdom kennt matchMedia nicht — hier: kein Schreibtisch.
  window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia
})
afterEach(cleanup)

const zeilen = (c: HTMLElement) => [...c.querySelectorAll<HTMLElement>('.einst-zeile')]
const knopf = (wo: ParentNode, text: string) =>
  [...wo.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === text)!
/** Das Blatt der Gruppe — es liegt am Dokument, nicht in der Ansicht. */
const blatt = () => document.querySelector<HTMLElement>(`[role="dialog"][aria-label="${t.gruppeLbl}"]`)!
const feld = (marke: string) =>
  [...blatt().querySelectorAll<HTMLSelectElement | HTMLInputElement>('select, input')].find(
    (f) => f.previousElementSibling?.textContent === marke,
  )!
const oeffne = (over: Partial<AppState> = {}) => {
  const z = zeige(over)
  fireEvent.click(zeilen(z.container)[0]!)
  return z
}
const updates = (d: ReturnType<typeof vi.fn>) => d.mock.calls.filter((c) => c[0].type === 'updateGroup').map((c) => c[0])

describe('Die Liste', () => {
  it('jede Gruppe nennt Namen, Aufseher und Gehilfen und wie viele zu ihr gehören', () => {
    const { container } = zeige({ persons: [{ ...AELTESTER, grp: 'g1' }, { ...BRUDER, grp: 'g1' }, SCHWESTER] })
    const zeile = zeilen(container)[0]!
    expect(zeile.querySelector('.einst-zeile-name')?.textContent).toBe('Gruppe 1')
    expect(zeile.querySelector('.klein-text')?.textContent).toBe('Anton Alt · Carlo Cohn')
    expect(zeile.querySelector('.einst-zeile-wert')?.textContent).toBe('Personen: 2')
  })

  it('der Name steht in seiner eigenen Schreibrichtung — er ist frei', () => {
    const { container } = zeige()
    expect(zeilen(container)[0]!.querySelector('.einst-zeile-name')?.getAttribute('dir')).toBe('auto')
  })

  it('am Desktop als Tabelle: Gruppe, Aufseher, Gehilfe, Personen', () => {
    const { container } = zeige({ persons: [{ ...AELTESTER, grp: 'g1' }, BRUDER] }, true)
    expect([...container.querySelectorAll('.gruppen-tabelle .einst-tabelle-kopf span')].map((s) => s.textContent)).toEqual([
      t.gbGruppe, t.aufseherLbl, t.gehilfeLbl, t.navPersonen,
    ])
    const zeile = container.querySelector('.gruppen-tabelle .einst-tabelle-zeile')!
    expect([...zeile.querySelectorAll(':scope > span')].map((s) => s.textContent)).toEqual([
      'Gruppe 1', 'Anton Alt', 'Carlo Cohn', '1',
    ])
  })
})

describe('Hinweis: ohne Predigtdienstgruppe', () => {
  const hinweis = (c: HTMLElement) => c.querySelector<HTMLButtonElement>('.gruppen-ohne')

  it('nennt, wie viele ohne Gruppe sind, und führt zu den Personen', () => {
    // Vorgabe: Nur Carlo ist in g1 — die drei anderen sind es nicht.
    const { container, dispatch } = zeige({ persons: [AELTESTER, GEHILFE, { ...BRUDER, grp: 'g1' }, SCHWESTER] })
    expect(hinweis(container)?.querySelector('.einst-zeile-name')?.textContent).toBe('Ohne Gruppe: 3')
    fireEvent.click(hinweis(container)!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'navigate', screen: 'personen' })
  })

  it('die Rolle „Keine" zählt nicht mit — sie braucht keine Gruppe', () => {
    const { container } = zeige({ persons: [{ ...BRUDER, grp: 'g1' }, { ...SCHWESTER, role: 'keine' }] })
    expect(hinweis(container)).toBeNull()
  })

  it('sind alle zugeordnet, steht er nicht da', () => {
    const { container } = zeige({ persons: PERSONEN.map((p) => ({ ...p, grp: 'g1' })) })
    expect(hinweis(container)).toBeNull()
  })
})

describe('Gruppe hinzufügen', () => {
  const neue = (d: ReturnType<typeof vi.fn>) => d.mock.calls.find((c) => c[0].type === 'addGroup')![0].group

  it('eine neue Gruppe zählt weiter — nicht wieder bei 1', () => {
    const { container, dispatch } = zeige({
      groups: [GRUPPE_1, { id: 'g3', name: 'Gruppe 3', overseerId: null, assistantId: null }],
    })
    fireEvent.click(knopf(container, t.gruppeHinzu))
    expect(neue(dispatch)).toMatchObject({ name: 'Gruppe 4', overseerId: null, assistantId: null })
  })

  it('ohne Gruppen fängt sie bei 1 an', () => {
    const { container, dispatch } = zeige({ groups: [] })
    fireEvent.click(knopf(container, t.gruppeHinzu))
    expect(neue(dispatch).name).toBe('Gruppe 1')
  })
})

describe('Das Blatt der Gruppe', () => {
  it('als Aufseher stehen nur Älteste und Dienstamtgehilfen zur Wahl', () => {
    oeffne()
    expect([...feld(t.aufseherLbl).querySelectorAll('option')].map((o) => o.textContent)).toEqual([
      '—', 'Anton Alt', 'Bernd Brand',
    ])
  })

  it('als Gehilfe jeder Bruder — aber keine Schwester', () => {
    oeffne()
    const namen = [...feld(t.gehilfeLbl).querySelectorAll('option')].map((o) => o.textContent)
    expect(namen).toEqual(['—', 'Anton Alt', 'Bernd Brand', 'Carlo Cohn'])
  })

  it('„—" nimmt die Besetzung zurück — als null, nicht als leerer String', () => {
    const { dispatch } = oeffne()
    fireEvent.change(feld(t.aufseherLbl), { target: { value: '' } })
    expect(updates(dispatch)).toEqual([{ type: 'updateGroup', id: 'g1', patch: { overseerId: null } }])
  })

  it('nennt die Treffpunkte der Gruppe und wie viele zu ihr gehören', () => {
    oeffne({
      persons: [{ ...BRUDER, grp: 'g1' }],
      fsRules: [{ id: 'r1', grp: 'g1', wd: 6, time: '09:30', place: 'Am Markt', monthly: 0, skipCong: true }],
    })
    expect(blatt().textContent).toContain('Am Markt, Samstag 09:30')
    expect(blatt().textContent).toContain('Mitglieder: 1')
  })
})

describe('Der Name gilt beim Schließen', () => {
  const name = () => blatt().querySelector<HTMLInputElement>('input')!

  it('Tippen schreibt nichts — „Fertig" übernimmt ihn', () => {
    const { dispatch } = oeffne()
    fireEvent.change(name(), { target: { value: '  Nord  ' } })
    expect(updates(dispatch)).toEqual([])
    fireEvent.click(knopf(blatt(), t.fertig))
    expect(updates(dispatch)).toEqual([{ type: 'updateGroup', id: 'g1', patch: { name: 'Nord' } }])
  })

  it('wer ihn nicht anfasst, lässt den gespeicherten stehen — er bleibt übersetzbar', () => {
    const { dispatch } = oeffne()
    fireEvent.click(knopf(blatt(), t.fertig))
    expect(updates(dispatch)).toEqual([])
  })

  it('leer bleibt der alte — und ein Hinweis sagt warum', () => {
    const { dispatch } = oeffne()
    fireEvent.change(name(), { target: { value: '   ' } })
    expect(blatt().querySelector('[role="alert"]')?.textContent).toBe(t.toastNameLeer)
    fireEvent.click(knopf(blatt(), t.fertig))
    expect(updates(dispatch)).toEqual([])
    expect(dispatch).toHaveBeenCalledWith({ type: 'showToast', text: t.toastNameLeer })
  })

  it('doppelt bleibt der alte — die geplante Reinigung kennt die Gruppe nur beim Namen', () => {
    // Auch anders geschrieben ist es derselbe Name.
    const { dispatch } = oeffne({
      groups: [GRUPPE_1, { id: 'g2', name: 'Gruppe 2', overseerId: null, assistantId: null }],
    })
    fireEvent.change(name(), { target: { value: '  gruppe   2 ' } })
    const hinweis = 'Name nicht geändert: Gruppe 2 gibt es schon'
    expect(blatt().querySelector('[role="alert"]')?.textContent).toBe(hinweis)
    expect(name().getAttribute('aria-invalid')).toBe('true')
    fireEvent.click(knopf(blatt(), t.fertig))
    expect(updates(dispatch)).toEqual([])
    expect(dispatch).toHaveBeenCalledWith({ type: 'showToast', text: hinweis })
  })
})

describe('Gruppe entfernen', () => {
  const folgen = () => [...blatt().querySelectorAll('.blatt-folgen p')].map((p) => p.textContent)

  it('der erste Tipp entfernt nicht — er fragt; erst der zweite entfernt', () => {
    const { dispatch } = oeffne()
    fireEvent.click(knopf(blatt(), t.gruppeEntfernen))
    expect(dispatch).not.toHaveBeenCalledWith({ type: 'removeGroup', id: 'g1' })
    fireEvent.click(knopf(blatt(), t.loeschenSicher))
    expect(dispatch).toHaveBeenCalledWith({ type: 'removeGroup', id: 'g1' })
  })

  it('vorher steht da, was verloren geht: Zuordnung, Treffpunkte, Gruppenbesuche, weitere Pläne', () => {
    oeffne({
      persons: [{ ...BRUDER, grp: 'g1' }, SCHWESTER],
      fsRules: [{ id: 'r1', grp: 'g1', wd: 6, time: '09:30', place: 'Saal', monthly: 0, skipCong: true }],
      gruppenbesuche: [{ id: 'b1', woche: '2026-11-09', grp: 'g1', pid: 'p-ae' }],
      planEintraege: [{ id: 'e1', planId: 'p1', datum: '2026-11-02', grp: 'g1' }],
    })
    expect(folgen()).toEqual([t.gruppeDelMitglieder, t.gruppeDelTreffpunkte, t.gruppeDelBesuche, t.gruppeDelPlaene])
  })

  it('auch ein nur für eine Woche angelegter Treffpunkt der Gruppe wird genannt', () => {
    // Kein Grundplan, nur ein einmaliger Treffpunkt — er geht beim Entfernen
    // ebenso mit (`fsGruppeEntfernen`), also muss das Blatt ihn nennen.
    const einmalig = { id: 'x1', ruleId: null, manual: true, grp: 'g1', wd: 5, time: '09:00', place: 'Saal', leader: '' }
    oeffne({ fsWeeks: [[], [einmalig]] })
    expect(folgen()).toEqual([t.gruppeDelTreffpunkte])
  })

  it('eine leere Gruppe ohne Treffpunkte: keine erfundenen Folgen', () => {
    oeffne()
    expect(blatt().querySelector('.blatt-folgen')).toBeNull()
  })

  it('die Mitglieder einer anderen Gruppe sind keine Folge dieser', () => {
    oeffne({
      groups: [GRUPPE_1, { id: 'g2', name: 'Gruppe 2', overseerId: null, assistantId: null }],
      persons: [{ ...BRUDER, grp: 'g2' }],
    })
    expect(blatt().querySelector('.blatt-folgen')).toBeNull()
  })
})
