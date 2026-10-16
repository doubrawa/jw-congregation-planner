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
 * - Der **Grundplan** (T121, Entwurf `GGrundplan`) steht je Wochentag, jede
 *   Regel mit ihrem Titel. Ein Gruppenaufseher sieht nur die Regeln seiner
 *   Gruppe und legt in ihr an; sähe er mehr, änderte er den Plan einer fremden
 *   Gruppe. „Außer bei Versammlungstreffpunkt" gibt es an einer
 *   Versammlungsregel nicht — sie wäre die Ausnahme von sich selbst.
 * - Das **Sprach-Sheet** sucht über **beide** Namen: wer „Hebräisch" tippt,
 *   findet עברית, und umgekehrt. Nach einem Sprachwechsel kennt man oft nur
 *   noch einen der beiden. Gespeichert wird immer der deutsche Name — er ist
 *   der Schlüssel in der Datenbank.
 */

const t = dict('de')

const GRUPPEN: Group[] = [
  { id: 'g1', name: 'Gruppe 1', overseerId: null, assistantId: null },
  { id: 'g2', name: 'Gruppe 2', overseerId: null, assistantId: null },
]
const SAAL = 'Saal Nord'

const regel = (over: Partial<FsRule> = {}): FsRule =>
  ({ id: 'r1', grp: null, wd: 6, monthly: 0, time: '09:30', place: 'Am Markt', skipCong: false, ...over }) as FsRule

function zeige(
  was: 'rules' | 'lang',
  over: Partial<AppState> = {},
  onlyGroup: string | null = null,
) {
  const dispatch = vi.fn()
  const state: AppState = {
    ...demoZustand(),
    screen: 'einstellungen', dataStatus: 'ready',
    congregationId: 'c1', userId: 'u1', planner: true,
    groups: GRUPPEN, persons: [], services: [], weeks: [], fsWeeks: [],
    fsRules: [regel()],
    congLang: 'de', progLangs: [], langSearch: '',
    congregation: { name: 'Test', hall: SAAL, times: { mid: { wd: 2, time: '19:00' }, we: { wd: 0, time: '10:00' } } },
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

const tage = (c: HTMLElement) => [...c.querySelectorAll('.treff-tag-name')].map((h) => h.textContent)
const zeilen = (c: HTMLElement) => [...c.querySelectorAll<HTMLButtonElement>('.regel-zeile')]
const titel = (c: HTMLElement) => zeilen(c).map((z) => z.querySelector('.treff-titel')?.textContent)
const blatt = () => document.querySelector<HTMLElement>('[role="dialog"]')
/** Das Feld eines Blatts, an seiner Marke gefunden. */
const feld = <T extends Element = HTMLSelectElement>(marke: string): T | null =>
  ([...(blatt()?.querySelectorAll('.blatt-feld') ?? [])]
    .find((f) => f.querySelector('.feld-marke')?.textContent === marke)
    ?.querySelector('select, input') as T | null | undefined) ?? null
const schalter = () => blatt()?.querySelector<HTMLButtonElement>('[role="switch"]') ?? null
const neu = (c: HTMLElement) => fireEvent.click(c.querySelector('.knopf-neu')!)
const hinzufuegen = () => fireEvent.click(blatt()!.querySelector('.sheet-fuss .knopf-haupt')!)
const angelegt = (dispatch: ReturnType<typeof vi.fn>) =>
  dispatch.mock.calls.filter((c) => c[0].type === 'fsRuleAdd').map((c) => c[0].rule as Omit<FsRule, 'id'>)

beforeEach(() => {
  window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia
})
afterEach(cleanup)

describe('Der Grundplan: je Wochentag eine Karte (T121, `GGrundplan`)', () => {
  it('sagt vorweg, was er ist', () => {
    const { container } = zeige('rules')
    expect(container.querySelector('.klein-text')?.textContent).toBe(t.fsGrundDesc)
  })

  it('je Wochentag eine Karte, ab Montag', () => {
    const { container } = zeige('rules', {
      fsRules: [regel({ id: 'r1', wd: 6 }), regel({ id: 'r2', wd: 1 }), regel({ id: 'r3', wd: 3 })],
    })
    expect(tage(container)).toEqual(['Montag', 'Mittwoch', 'Samstag'])
  })

  it('je Regel eine Zeile mit Zeit, Titel und Ort — nach Uhrzeit, die Versammlung vor der Gruppe', () => {
    const { container } = zeige('rules', {
      fsRules: [
        regel({ id: 'r1', grp: 'g1' }),
        regel({ id: 'r2', grp: null }),
        regel({ id: 'r3', grp: 'g2', time: '09:15', place: 'Nebenraum' }),
      ],
    })
    expect(titel(container)).toEqual(['Gruppe 2', t.fsVers, 'Gruppe 1'])
    const erste = zeilen(container)[0]!
    expect(erste.querySelector('.treff-zeit-pille')?.textContent).toBe('09:15')
    expect(erste.querySelector('.treff-ort')?.textContent).toBe('Nebenraum')
  })

  it('wie oft, steht nur da, wo es nicht jede Woche ist', () => {
    const { container } = zeige('rules', {
      fsRules: [regel({ id: 'r1', monthly: 1 }), regel({ id: 'r2', wd: 1 })],
    })
    const [montag, samstag] = zeilen(container)
    expect(samstag!.textContent).toContain(t.fsFreqM1)
    expect(montag!.textContent).not.toContain(t.fsFreqW)
  })

  it('der Gruppenaufseher sieht nur die Regeln seiner Gruppe', () => {
    const { container } = zeige(
      'rules',
      { fsRules: [regel({ id: 'r1', grp: null }), regel({ id: 'r2', grp: 'g1' }), regel({ id: 'r3', grp: 'g2' })] },
      'g1',
    )
    expect(titel(container)).toEqual(['Gruppe 1'])
  })
})

describe('Eine Regel ändern — es gilt gleich', () => {
  const oeffne = (c: HTMLElement) => fireEvent.click(zeilen(c)[0]!)

  it('ein Tipp öffnet sie in einem Blatt, überschrieben mit ihrem Titel', () => {
    const { container } = zeige('rules', { fsRules: [regel({ grp: 'g2' })] })
    oeffne(container)
    expect(blatt()?.getAttribute('aria-label')).toBe('Gruppe 2')
  })

  it('Wochentag, Häufigkeit, Uhrzeit und Ort gelten sofort', () => {
    const { container, dispatch } = zeige('rules')
    oeffne(container)
    fireEvent.change(feld(t.a11yWeekday)!, { target: { value: '1' } })
    expect(dispatch).toHaveBeenCalledWith({ type: 'fsRuleUpdate', id: 'r1', patch: { wd: 1 } })
    fireEvent.change(feld(t.haeufigkeitLbl)!, { target: { value: '2' } })
    expect(dispatch).toHaveBeenCalledWith({ type: 'fsRuleUpdate', id: 'r1', patch: { monthly: 2 } })
    fireEvent.change(feld(t.a11yTime)!, { target: { value: '10:00' } })
    expect(dispatch).toHaveBeenCalledWith({ type: 'fsRuleUpdate', id: 'r1', patch: { time: '10:00' } })
    fireEvent.change(feld<HTMLInputElement>(t.ortLbl)!, { target: { value: 'Marktplatz' } })
    expect(dispatch).toHaveBeenCalledWith({ type: 'fsRuleUpdate', id: 'r1', patch: { place: 'Marktplatz' } })
  })

  it('die Wochentage stehen in der Sprache des Lesers, beginnend am Montag', () => {
    const { container } = zeige('rules')
    oeffne(container)
    const optionen = [...feld(t.a11yWeekday)!.querySelectorAll('option')]
    expect(optionen).toHaveLength(7)
    expect(optionen[0]?.textContent).toBe('Montag')
    expect(optionen.at(-1)?.textContent).toBe('Sonntag')
  })

  it('die Häufigkeit reicht von „jede Woche" bis zum vierten im Monat', () => {
    const { container } = zeige('rules')
    oeffne(container)
    expect([...feld(t.haeufigkeitLbl)!.querySelectorAll('option')].map((o) => o.textContent)).toEqual([
      t.fsFreqW, t.fsFreqM1, t.fsFreqM2, t.fsFreqM3, t.fsFreqM4,
    ])
  })

  it('die Gruppe ändert man nicht — wer eine andere will, legt neu an', () => {
    const { container } = zeige('rules')
    oeffne(container)
    expect(feld(t.gbGruppe)).toBeNull()
  })

  it('„Außer bei Versammlungstreffpunkt" steht an einer Gruppenregel — und schaltet um', () => {
    const { container, dispatch } = zeige('rules', { fsRules: [regel({ grp: 'g1', skipCong: false })] })
    oeffne(container)
    expect(schalter()?.getAttribute('aria-label')).toBe(t.fsSkipCong)
    fireEvent.click(schalter()!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'fsRuleUpdate', id: 'r1', patch: { skipCong: true } })
  })

  it('an der Versammlungsregel nicht — sie wäre die Ausnahme von sich selbst', () => {
    const { container } = zeige('rules', { fsRules: [regel({ grp: null })] })
    oeffne(container)
    expect(schalter()).toBeNull()
  })

  it('Entfernen fragt erst nach — dann geht die Regel und mit ihr das Blatt', () => {
    const { container, dispatch } = zeige('rules')
    oeffne(container)
    const knopf = blatt()!.querySelector<HTMLButtonElement>('.knopf-entfernen')!
    fireEvent.click(knopf)
    expect(dispatch).not.toHaveBeenCalledWith({ type: 'fsRuleRemove', id: 'r1' })
    expect(knopf.textContent).toBe(t.loeschenSicher)
    fireEvent.click(knopf)
    expect(dispatch).toHaveBeenCalledWith({ type: 'fsRuleRemove', id: 'r1' })
    expect(blatt()).toBeNull()
  })
})

describe('„Treffpunkt für jede Woche" — erst „Hinzufügen" legt an', () => {
  it('mit den Vorgaben: samstags, halb zehn, jede Woche, für die Versammlung, im Saal', () => {
    const { container, dispatch } = zeige('rules', { fsRules: [] })
    neu(container)
    expect(blatt()?.getAttribute('aria-label')).toBe(t.fsFuerJedeWoche)
    expect(angelegt(dispatch)).toEqual([])
    hinzufuegen()
    expect(angelegt(dispatch)).toEqual([{ grp: null, wd: 6, time: '09:30', monthly: 0, place: SAAL, skipCong: false }])
    expect(blatt()).toBeNull()
  })

  it('was man einstellt, kommt an', () => {
    const { container, dispatch } = zeige('rules', { fsRules: [] })
    neu(container)
    fireEvent.change(feld(t.gbGruppe)!, { target: { value: 'g2' } })
    fireEvent.change(feld(t.a11yWeekday)!, { target: { value: '3' } })
    fireEvent.change(feld(t.haeufigkeitLbl)!, { target: { value: '2' } })
    fireEvent.change(feld(t.a11yTime)!, { target: { value: '10:00' } })
    fireEvent.change(feld<HTMLInputElement>(t.ortLbl)!, { target: { value: '  Park  ' } })
    hinzufuegen()
    expect(angelegt(dispatch)).toEqual([{ grp: 'g2', wd: 3, time: '10:00', monthly: 2, place: 'Park', skipCong: true }])
  })

  it('mit einer Gruppe erscheint „Außer bei Versammlungstreffpunkt" — an, wie bei jeder Gruppenregel', () => {
    const { container } = zeige('rules', { fsRules: [] })
    neu(container)
    expect(schalter()).toBeNull()
    fireEvent.change(feld(t.gbGruppe)!, { target: { value: 'g1' } })
    expect(schalter()?.getAttribute('aria-checked')).toBe('true')
    fireEvent.change(feld(t.gbGruppe)!, { target: { value: '' } })
    expect(schalter()).toBeNull()
  })

  it('der Gruppenaufseher legt in seiner Gruppe an — ohne Wahl', () => {
    const { container, dispatch } = zeige('rules', { fsRules: [] }, 'g1')
    neu(container)
    expect(feld(t.gbGruppe)).toBeNull()
    hinzufuegen()
    expect(angelegt(dispatch)[0]).toMatchObject({ grp: 'g1', skipCong: true })
  })

  it('„Abbrechen" legt nichts an', () => {
    const { container, dispatch } = zeige('rules')
    neu(container)
    fireEvent.click(blatt()!.querySelector('.sheet-fuss .knopf-leise')!)
    expect(angelegt(dispatch)).toEqual([])
    expect(blatt()).toBeNull()
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
    const { container } = zeige('lang', { langSheetOpen: true, congLang: 'de' })
    const aktiv = zeilen(container).filter((r) => r.className.includes('is-active'))
    expect(aktiv).toHaveLength(1)
    expect(aktiv[0]!.querySelector('.lang-check')?.textContent).toBe('✓')
  })

  it('im Zusatz-Modus sind ALLE gewählten markiert — es sind mehrere möglich', () => {
    const { container } = zeige('lang', {
      langSheetOpen: true, langSheetFor: 'alt', progLangs: ['en', 'es'],
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

  it('eine Auswahl setzt die Versammlungssprache — als jw.org-Code', () => {
    const { container, dispatch } = zeige('lang', { langSheetOpen: true, langSheetFor: 'cong' })
    const deutsch = zeilen(container).find((r) => r.textContent?.startsWith('Deutsch'))!
    fireEvent.click(deutsch)
    expect(dispatch).toHaveBeenCalledWith({ type: 'setCongLang', code: 'de' })
  })

  it('im Zusatz-Modus wird sie stattdessen hinzugefügt', () => {
    const { container, dispatch } = zeige('lang', { langSheetOpen: true, langSheetFor: 'alt' })
    const deutsch = zeilen(container).find((r) => r.textContent?.startsWith('Deutsch'))!
    fireEvent.click(deutsch)
    expect(dispatch).toHaveBeenCalledWith({ type: 'addProgLang', code: 'de' })
  })

  it('✕, Hintergrund und Escape schließen', () => {
    const { container, dispatch } = zeige('lang', { langSheetOpen: true })
    fireEvent.click(container.querySelector(`[aria-label="${t.a11yClose}"]`)!)
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
