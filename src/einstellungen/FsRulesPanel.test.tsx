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
import { initialState } from '../app/init'
import { dict } from '../i18n/ui'
import type { FsRule, Group } from '../data/types'
import { FsRulesPanel } from './FsRulesPanel'
import { LanguageSheet } from '../components/LanguageSheet'

/**
 * **Der Grundplan der Treffpunkte und das Sprach-Sheet.**
 *
 * Beide sind Auswahllisten — und bei beiden liegt der Fehler nicht im Auswählen,
 * sondern in dem, was zur Auswahl steht:
 *
 * - Der **Grundplan** ist nach Versammlung und Gruppen gegliedert. Ein
 *   Gruppenaufseher darf nur seinen eigenen Abschnitt sehen; sähe er mehr,
 *   änderte er den Plan einer fremden Gruppe. Der Schalter „außer bei
 *   Versammlungstreffpunkt" gibt es an einer Versammlungsregel nicht — sie
 *   wäre die Ausnahme von sich selbst.
 * - Das **Sprach-Sheet** sucht über **beide** Namen: wer „Hebräisch" tippt,
 *   findet עברית, und umgekehrt. Nach einem Sprachwechsel kennt man oft nur
 *   noch einen der beiden. Gespeichert wird immer der deutsche Name — er ist
 *   der Schlüssel in der Datenbank.
 */

const t = dict('de')

const GRUPPEN: Group[] = [
  { id: 'g1', name: 'Gruppe 1', ov: null, as: null },
  { id: 'g2', name: 'Gruppe 2', ov: null, as: null },
]

const regel = (over: Partial<FsRule> = {}): FsRule =>
  ({ id: 'r1', grp: '', wd: 6, monthly: 0, time: '09:30', place: 'Saal', skipCong: false, ...over }) as FsRule

function zeige(
  was: 'rules' | 'lang',
  over: Partial<AppState> = {},
  onlyGroup: string | null = null,
) {
  const dispatch = vi.fn()
  const state: AppState = {
    ...initialState(),
    screen: 'einstellungen', dataStatus: 'ready',
    congregationId: 'c1', userId: 'u1', planner: true,
    groups: GRUPPEN, persons: [], services: [], weeks: [], fsWeeks: [],
    fsRules: [regel()],
    fsBase: new Date(2026, 8, 7, 12, 0),
    congLang: 'Deutsch', progLangs: [], langSearch: '',
    ...over,
  }
  function Buehne() {
    const store = useStaticStore(state)
    return (
      <AppDispatchContext.Provider value={dispatch}>
        <AppStoreContext.Provider value={store}>
          <AppStateContext.Provider value={state}>
            {was === 'rules' ? <FsRulesPanel onlyGroup={onlyGroup} /> : <LanguageSheet />}
          </AppStateContext.Provider>
        </AppStoreContext.Provider>
      </AppDispatchContext.Provider>
    )
  }
  return { dispatch, ...render(<Buehne />) }
}

const abschnitte = (c: HTMLElement) =>
  [...c.querySelectorAll('.fsr-section-title')].map((x) => x.textContent ?? '')

beforeEach(() => {
  window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia
})
afterEach(cleanup)

describe('Der Grundplan gliedert nach Versammlung und Gruppen', () => {
  it('der Planer sieht alle Abschnitte — die Versammlung zuerst', () => {
    const { container } = zeige('rules')
    expect(abschnitte(container)).toEqual([t.fsVersSection, 'Gruppe 1', 'Gruppe 2'])
  })

  it('der Gruppenaufseher nur seinen eigenen', () => {
    const { container } = zeige('rules', {}, 'g1')
    expect(abschnitte(container)).toEqual(['Gruppe 1'])
  })

  it('jeder Abschnitt bietet an, eine Regel für sich anzulegen', () => {
    const { container, dispatch } = zeige('rules')
    const knoepfe = [...container.querySelectorAll('.fsr-add')]
    expect(knoepfe).toHaveLength(3)
    fireEvent.click(knoepfe[1]!) // Gruppe 1
    expect(dispatch).toHaveBeenCalledWith({ type: 'fsRuleAdd', grp: 'g1' })
  })

  it('die Versammlungsregel wird mit leerem Gruppen-Schlüssel angelegt', () => {
    const { container, dispatch } = zeige('rules')
    fireEvent.click(container.querySelector('.fsr-add')!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'fsRuleAdd', grp: '' })
  })

  it('eine Regel steht nur in ihrem eigenen Abschnitt', () => {
    const { container } = zeige('rules', {
      fsRules: [regel({ id: 'r1', grp: '' }), regel({ id: 'r2', grp: 'g2' })],
    })
    const teile = [...container.querySelectorAll('.fsr-section')]
    expect(teile[0]!.querySelectorAll('.fsr-row')).toHaveLength(1) // Versammlung
    expect(teile[1]!.querySelectorAll('.fsr-row')).toHaveLength(0) // Gruppe 1
    expect(teile[2]!.querySelectorAll('.fsr-row')).toHaveLength(1) // Gruppe 2
  })
})

describe('Eine Regel bearbeiten', () => {
  it('Wochentag, Häufigkeit, Uhrzeit und Ort lassen sich ändern', () => {
    const { container, dispatch } = zeige('rules')
    fireEvent.change(container.querySelector(`[aria-label="${t.a11yWeekday}"]`)!, { target: { value: '1' } })
    expect(dispatch).toHaveBeenCalledWith({ type: 'fsRuleUpdate', id: 'r1', patch: { wd: 1 } })
    fireEvent.change(container.querySelector(`[aria-label="${t.fsFreqW}"]`)!, { target: { value: '2' } })
    expect(dispatch).toHaveBeenCalledWith({ type: 'fsRuleUpdate', id: 'r1', patch: { monthly: 2 } })
    fireEvent.change(container.querySelector(`[aria-label="${t.a11yTime}"]`)!, { target: { value: '10:00' } })
    expect(dispatch).toHaveBeenCalledWith({ type: 'fsRuleUpdate', id: 'r1', patch: { time: '10:00' } })
    fireEvent.change(container.querySelector('.fsr-input')!, { target: { value: 'Marktplatz' } })
    expect(dispatch).toHaveBeenCalledWith({ type: 'fsRuleUpdate', id: 'r1', patch: { place: 'Marktplatz' } })
  })

  it('die Wochentage stehen in der Sprache des Lesers, beginnend am Montag', () => {
    const { container } = zeige('rules')
    const optionen = [...container.querySelector(`[aria-label="${t.a11yWeekday}"]`)!.querySelectorAll('option')]
    expect(optionen).toHaveLength(7)
    expect(optionen[0]?.textContent).toBe('Montag')
    expect(optionen.at(-1)?.textContent).toBe('Sonntag')
  })

  it('die Häufigkeit reicht von „jede Woche" bis zum vierten im Monat', () => {
    const { container } = zeige('rules')
    const optionen = [...container.querySelector(`[aria-label="${t.fsFreqW}"]`)!.querySelectorAll('option')]
    expect(optionen.map((o) => o.textContent)).toEqual([
      t.fsFreqW, t.fsFreqM1, t.fsFreqM2, t.fsFreqM3, t.fsFreqM4,
    ])
  })

  it('eine Regel lässt sich löschen', () => {
    const { container, dispatch } = zeige('rules')
    fireEvent.click(container.querySelector('.fs-remove')!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'fsRuleRemove', id: 'r1' })
  })
})

describe('„Außer bei Versammlungstreffpunkt" gibt es nur bei Gruppen', () => {
  it('an einer Gruppenregel steht der Schalter', () => {
    const { container } = zeige('rules', { fsRules: [regel({ grp: 'g1' })] })
    const schalter = container.querySelector('.fsr-skip [role="switch"]')!
    expect(schalter.getAttribute('aria-label')).toBe(t.fsSkipCong)
    fireEvent.click(schalter)
  })

  it('und schaltet um', () => {
    const { container, dispatch } = zeige('rules', { fsRules: [regel({ grp: 'g1', skipCong: false })] })
    fireEvent.click(container.querySelector('.fsr-skip [role="switch"]')!)
    expect(dispatch).toHaveBeenCalledWith({
      type: 'fsRuleUpdate', id: 'r1', patch: { skipCong: true },
    })
  })

  it('an der Versammlungsregel nicht — sie wäre die Ausnahme von sich selbst', () => {
    const { container } = zeige('rules', { fsRules: [regel({ grp: '' })] })
    expect(container.querySelector('.fsr-skip')).toBeNull()
  })
})

describe('Das Sprach-Sheet', () => {
  const zeilen = (c: HTMLElement) => [...c.querySelectorAll('.lang-row')]

  it('ist ein modaler Dialog und nennt, worum es geht', () => {
    const { container } = zeige('lang', { langSheetOpen: true, langSheetFor: 'cong' })
    expect(container.querySelector('.sheet--lang')?.getAttribute('role')).toBe('dialog')
    expect(container.querySelector('.sheet-title')?.textContent).toBe(t.versSprache)
  })

  it('im Zusatz-Modus heißt es anders — sonst überschriebe man die Hauptsprache', () => {
    const { container } = zeige('lang', { langSheetOpen: true, langSheetFor: 'alt' })
    expect(container.querySelector('.sheet-title')?.textContent).toBe(t.progLangsLbl)
  })

  it('führt die volle jw.org-Liste und zählt sie im Kopf', () => {
    const { container } = zeige('lang', { langSheetOpen: true })
    expect(zeilen(container).length).toBeGreaterThan(100)
    expect(container.querySelector('.sheet-sub')?.textContent).toContain(String(zeilen(container).length))
  })

  it('die eingestellte Sprache ist mit einem Haken markiert', () => {
    const { container } = zeige('lang', { langSheetOpen: true, congLang: 'Deutsch' })
    const aktiv = zeilen(container).filter((r) => r.className.includes('is-active'))
    expect(aktiv).toHaveLength(1)
    expect(aktiv[0]!.querySelector('.lang-check')?.textContent).toBe('✓')
  })

  it('im Zusatz-Modus sind ALLE gewählten markiert — es sind mehrere möglich', () => {
    const { container } = zeige('lang', {
      langSheetOpen: true, langSheetFor: 'alt', progLangs: ['Englisch', 'Spanisch'],
    })
    expect(zeilen(container).filter((r) => r.className.includes('is-active'))).toHaveLength(2)
  })

  it('die Suche grenzt ein — und zählt im Kopf mit', () => {
    const { container } = zeige('lang', { langSheetOpen: true, langSearch: 'Deutsch' })
    const treffer = zeilen(container)
    expect(treffer.length).toBeGreaterThan(0)
    expect(treffer.length).toBeLessThan(20)
    expect(container.querySelector('.sheet-sub')?.textContent).toContain(String(treffer.length))
  })

  it('gesucht wird über den deutschen Schlüssel UND den angezeigten Namen', () => {
    // Nach einem Sprachwechsel kennt man oft nur noch einen von beiden.
    const { container } = zeige('lang', { langSheetOpen: true, langSearch: 'hebräisch' })
    expect(zeilen(container).length).toBeGreaterThan(0)
  })

  it('ein Tippen ins Suchfeld schreibt in den Zustand — die Liste ist nicht lokal', () => {
    const { container, dispatch } = zeige('lang', { langSheetOpen: true })
    fireEvent.change(container.querySelector('.lang-search')!, { target: { value: 'span' } })
    expect(dispatch).toHaveBeenCalledWith({ type: 'setLangSearch', text: 'span' })
  })

  it('eine Auswahl setzt die Versammlungssprache — als deutscher Schlüssel', () => {
    const { container, dispatch } = zeige('lang', { langSheetOpen: true, langSheetFor: 'cong' })
    const deutsch = zeilen(container).find((r) => r.textContent?.startsWith('Deutsch'))!
    fireEvent.click(deutsch)
    expect(dispatch).toHaveBeenCalledWith({ type: 'setCongLang', name: 'Deutsch' })
  })

  it('im Zusatz-Modus wird sie stattdessen hinzugefügt', () => {
    const { container, dispatch } = zeige('lang', { langSheetOpen: true, langSheetFor: 'alt' })
    const deutsch = zeilen(container).find((r) => r.textContent?.startsWith('Deutsch'))!
    fireEvent.click(deutsch)
    expect(dispatch).toHaveBeenCalledWith({ type: 'addProgLang', name: 'Deutsch' })
  })

  it('✕, Hintergrund und Escape schließen', () => {
    const { container, dispatch } = zeige('lang', { langSheetOpen: true })
    fireEvent.click(container.querySelector('.sheet-close')!)
    fireEvent.click(container.querySelector('.sheet-backdrop')!)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(dispatch.mock.calls.filter((c) => c[0].type === 'closeLangSheet')).toHaveLength(3)
  })

  it('eine Suche ohne Treffer liefert eine leere Liste, keinen Absturz', () => {
    const { container } = zeige('lang', { langSheetOpen: true, langSearch: 'zzzzzz' })
    expect(zeilen(container)).toHaveLength(0)
    expect(container.querySelector('.sheet-sub')?.textContent).toContain('0')
  })
})
