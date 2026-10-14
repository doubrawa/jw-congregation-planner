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
import { GroupsPanel } from './GroupsPanel'
import { RemindersPanel } from './RemindersPanel'

/**
 * **Predigtdienstgruppen und Erinnerungen** — die beiden Panels, die bis zu
 * ihrem Umbau (T121, Phase 6c) als Unteransicht der Einstellungen stehen. Die
 * Übersicht prüft `EinstellungenScreen.test.tsx`.
 *
 * **Aufseher und Gehilfe** einer Predigtdienstgruppe sind nicht beliebig
 * besetzbar: Aufseher nur Älteste/Dienstamtgehilfen, Gehilfe keine Schwester.
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

function zeige(was: 'groups' | 'reminders', over: Partial<AppState> = {}) {
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
            {was === 'groups' && <GroupsPanel />}
            {was === 'reminders' && <RemindersPanel />}
          </AppStateContext.Provider>
        </AppStoreContext.Provider>
      </AppDispatchContext.Provider>
    )
  }
  return { dispatch, ...render(<Buehne />) }
}

afterEach(cleanup)

describe('Predigtdienstgruppen', () => {
  it('jede Gruppe nennt Namen und Mitgliederzahl', () => {
    const { container } = zeige('groups', {
      persons: [{ ...AELTESTER, grp: 'g1' }, { ...BRUDER, grp: 'g1' }, SCHWESTER],
    })
    expect(container.querySelector('.grp-name')?.textContent).toBe('Gruppe 1')
    expect(container.querySelector('.grp-count')?.textContent).toBe('Mitglieder: 2')
  })

  it('bei genau einem Mitglied kein „1 Mitglieder" — die Form stimmt für jede Zahl', () => {
    // Hier stand ein eigener Schlüssel für die 1. Er half nur dort: Slawische
    // Sprachen haben eine eigene Form für 2–4, Arabisch den Dual.
    const { container } = zeige('groups', { persons: [{ ...AELTESTER, grp: 'g1' }] })
    expect(container.querySelector('.grp-count')?.textContent).toBe('Mitglieder: 1')
  })

  it('als Aufseher stehen nur Älteste und Dienstamtgehilfen zur Wahl', () => {
    const { container } = zeige('groups')
    const ov = container.querySelectorAll<HTMLSelectElement>('.mem-select')[0]!
    const namen = [...ov.querySelectorAll('option')].map((o) => o.textContent)
    expect(namen).toEqual(['—', 'Anton Alt', 'Bernd Brand'])
  })

  it('als Gehilfe jeder Bruder — aber keine Schwester', () => {
    const { container } = zeige('groups')
    const as = container.querySelectorAll<HTMLSelectElement>('.mem-select')[1]!
    const namen = [...as.querySelectorAll('option')].map((o) => o.textContent)
    expect(namen).toEqual(['—', 'Anton Alt', 'Bernd Brand', 'Carlo Cohn'])
    expect(namen).not.toContain('Dora Dietz')
  })

  it('„—" nimmt die Besetzung zurück — als null, nicht als leerer String', () => {
    const { container, dispatch } = zeige('groups')
    fireEvent.change(container.querySelectorAll('.mem-select')[0]!, { target: { value: '' } })
    expect(dispatch).toHaveBeenCalledWith({
      type: 'updateGroup', id: 'g1', patch: { overseerId: null },
    })
  })

  /*
   * **Löschen nur mit Rückfrage** (gemeldet am 13.9.2026). Ein Tipp löschte die
   * Gruppe sofort, und ihre Mitglieder standen still ohne Gruppe da. Jetzt wie
   * beim Löschen einer Person: Der erste Tipp fragt und nennt die Folgen, erst
   * der zweite löscht.
   */
  describe('Gruppe löschen', () => {
    const loeschKnopf = (c: HTMLElement, i = 0) => c.querySelectorAll<HTMLButtonElement>('.grp-remove')[i]!
    const geloescht = (d: ReturnType<typeof vi.fn>) => d.mock.calls.filter((c) => c[0].type === 'removeGroup')

    it('der erste Tipp löscht nicht — er fragt „Wirklich löschen?"', () => {
      const { container, dispatch } = zeige('groups')
      fireEvent.click(loeschKnopf(container))
      expect(geloescht(dispatch)).toEqual([])
      expect(loeschKnopf(container).textContent).toBe(t.loeschenSicher)
    })

    it('erst der zweite Tipp löscht die Gruppe', () => {
      const { container, dispatch } = zeige('groups')
      fireEvent.click(loeschKnopf(container))
      fireEvent.click(loeschKnopf(container))
      expect(dispatch).toHaveBeenCalledWith({ type: 'removeGroup', id: 'g1' })
      expect(geloescht(dispatch)).toHaveLength(1)
    })

    it('die Rückfrage nennt, was verloren geht: die Zuordnung der Mitglieder und die Treffpunkte', () => {
      const { container } = zeige('groups', {
        persons: [{ ...BRUDER, grp: 'g1' }, SCHWESTER],
        fsRules: [{ id: 'r-g1', grp: 'g1', wd: 6, time: '09:30', place: 'Saal', monthly: 0, skipCong: true }],
      })
      fireEvent.click(loeschKnopf(container))
      const warnung = container.querySelector('.grp-del-warn')
      expect(warnung?.textContent).toBe(`${t.gruppeDelMitglieder} ${t.gruppeDelTreffpunkte}`)
      // Der Screenreader hört die Folgen am Knopf selbst, nicht irgendwo daneben.
      expect(loeschKnopf(container).getAttribute('aria-describedby')).toBe(warnung?.id)
    })

    it('auch ein nur für eine Woche angelegter Treffpunkt der Gruppe wird genannt', () => {
      // Kein Grundplan, nur ein einmaliger Treffpunkt — er geht beim Löschen
      // ebenso mit (`fsGruppeEntfernen`), also muss die Rückfrage ihn nennen.
      const einmalig = {
        id: 'x1', ruleId: null, manual: true, grp: 'g1', wd: 5, time: '09:00', place: 'Saal', leader: '',
      }
      const { container } = zeige('groups', { fsWeeks: [[], [einmalig]] })
      fireEvent.click(loeschKnopf(container))
      expect(container.querySelector('.grp-del-warn')?.textContent).toBe(t.gruppeDelTreffpunkte)
    })

    it('eine leere Gruppe ohne Treffpunkte: nur die Frage, keine erfundenen Folgen', () => {
      // Vorgabe: Niemand ist in g1, und es gibt keine Treffpunkte.
      const { container } = zeige('groups')
      fireEvent.click(loeschKnopf(container))
      expect(container.querySelector('.grp-del-warn')).toBeNull()
      expect(loeschKnopf(container).hasAttribute('aria-describedby')).toBe(false)
    })

    it('die Mitglieder einer anderen Gruppe sind keine Folge dieser', () => {
      const { container } = zeige('groups', {
        groups: [...GRUPPEN, { id: 'g2', name: 'Gruppe 2', overseerId: null, assistantId: null }],
        persons: [{ ...BRUDER, grp: 'g2' }],
      })
      fireEvent.click(loeschKnopf(container, 0))
      expect(container.querySelector('.grp-del-warn')).toBeNull()
    })

    it('verlässt der Fokus den Knopf, entschärft er sich wieder', () => {
      const { container, dispatch } = zeige('groups')
      fireEvent.click(loeschKnopf(container))
      fireEvent.blur(loeschKnopf(container))
      expect(loeschKnopf(container).textContent).toBe('✕')
      expect(loeschKnopf(container).getAttribute('aria-label')).toBe(t.a11yRemove)
      // Der nächste Tipp fragt wieder, statt zu löschen.
      fireEvent.click(loeschKnopf(container))
      expect(geloescht(dispatch)).toEqual([])
    })

    it('wer die nächste Gruppe antippt, entschärft die vorige', () => {
      const { container, dispatch } = zeige('groups', {
        groups: [...GRUPPEN, { id: 'g2', name: 'Gruppe 2', overseerId: null, assistantId: null }],
      })
      fireEvent.click(loeschKnopf(container, 0))
      fireEvent.click(loeschKnopf(container, 1))
      expect(geloescht(dispatch)).toEqual([])
      expect(loeschKnopf(container, 0).textContent).toBe('✕')
      expect(loeschKnopf(container, 1).textContent).toBe(t.loeschenSicher)
    })
  })

  /*
   * **Wer keiner Gruppe zugeordnet ist, steht hier.** An dieser Stelle lässt eine
   * gelöschte Gruppe ihre Mitglieder zurück; die Namen stehen in der
   * Personenliste, wo die Gruppe gesetzt wird.
   */
  describe('Hinweis: ohne Predigtdienstgruppe', () => {
    const hinweis = (c: HTMLElement) => c.querySelector<HTMLButtonElement>('.grp-ohne')

    it('nennt, wie viele ohne Gruppe sind, und führt in die Personenliste', () => {
      // Vorgabe: Nur Carlo ist in g1 — die drei anderen sind es nicht.
      const { container, dispatch } = zeige('groups', {
        persons: [AELTESTER, GEHILFE, { ...BRUDER, grp: 'g1' }, SCHWESTER],
      })
      expect(hinweis(container)?.querySelector('.grp-ohne-title')?.textContent).toBe(t.ohneGruppeTitle)
      expect(hinweis(container)?.querySelector('.grp-ohne-count')?.textContent).toBe('3')
      fireEvent.click(hinweis(container)!)
      expect(dispatch).toHaveBeenCalledWith({ type: 'navigate', screen: 'personen' })
    })

    it('die Rolle „Keine" zählt nicht mit — sie braucht keine Gruppe', () => {
      const { container } = zeige('groups', {
        persons: [{ ...BRUDER, grp: 'g1' }, { ...SCHWESTER, role: 'keine' }],
      })
      expect(hinweis(container)).toBeNull()
    })

    it('sind alle zugeordnet, steht er nicht da', () => {
      const { container } = zeige('groups', {
        persons: PERSONEN.map((p) => ({ ...p, grp: 'g1' })),
      })
      expect(hinweis(container)).toBeNull()
    })
  })

  it('eine neue Gruppe zählt weiter — nicht wieder bei 1', () => {
    const { container, dispatch } = zeige('groups', {
      groups: [
        { id: 'g1', name: 'Gruppe 1', overseerId: null, assistantId: null },
        { id: 'g3', name: 'Gruppe 3', overseerId: null, assistantId: null },
      ],
    })
    fireEvent.click(container.querySelector('.grp-add')!)
    expect(dispatch.mock.calls.find((c) => c[0].type === 'addGroup')![0].group.name).toBe('Gruppe 4')
  })

  it('ohne Gruppen fängt sie bei 1 an', () => {
    const { container, dispatch } = zeige('groups', { groups: [] })
    fireEvent.click(container.querySelector('.grp-add')!)
    expect(dispatch.mock.calls.find((c) => c[0].type === 'addGroup')![0].group.name).toBe('Gruppe 1')
  })
})

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
