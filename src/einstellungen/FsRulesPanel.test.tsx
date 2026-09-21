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
  { id: 'g1', name: 'Gruppe 1', overseerId: null, assistantId: null },
  { id: 'g2', name: 'Gruppe 2', overseerId: null, assistantId: null },
]

const regel = (over: Partial<FsRule> = {}): FsRule =>
  ({ id: 'r1', grp: null, wd: 6, monthly: 0, time: '09:30', place: 'Saal', skipCong: false, ...over }) as FsRule

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
    congLang: 'de', progLangs: [], langSearch: '',
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

/** Die Karten des Grundplans — das Panel rendert nichts anderes. */
const karten = (c: HTMLElement) => [...c.querySelectorAll<HTMLElement>('.panel')]
const ueberschriften = (c: HTMLElement) => karten(c).map((k) => k.querySelector('.panel-label')?.textContent ?? '')

beforeEach(() => {
  window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia
})
afterEach(cleanup)

describe('Der Grundplan gliedert nach Versammlung und Gruppen', () => {
  it('der Planer sieht alle Abschnitte — die Versammlung zuerst', () => {
    const { container } = zeige('rules')
    expect(ueberschriften(container)).toEqual([
      `${t.fsShort} · ${t.versammlungCard}`,
      `${t.fsShort} · Gruppe 1`,
      `${t.fsShort} · Gruppe 2`,
    ])
  })

  it('der Gruppenaufseher nur seinen eigenen', () => {
    const { container } = zeige('rules', {}, 'g1')
    expect(ueberschriften(container)).toEqual([`${t.fsShort} · Gruppe 1`])
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
    expect(dispatch).toHaveBeenCalledWith({ type: 'fsRuleAdd', grp: null })
  })

  it('eine Regel steht nur in ihrem eigenen Abschnitt', () => {
    const { container } = zeige('rules', {
      fsRules: [regel({ id: 'r1', grp: null }), regel({ id: 'r2', grp: 'g2' })],
    })
    const [versammlung, gruppe1, gruppe2] = karten(container)
    expect(versammlung!.querySelectorAll('.fsr-row')).toHaveLength(1)
    expect(gruppe1!.querySelectorAll('.fsr-row')).toHaveLength(0)
    expect(gruppe2!.querySelectorAll('.fsr-row')).toHaveLength(1)
  })

  it('ohne Predigtdienstgruppen bleibt die Karte der Versammlung allein', () => {
    const { container } = zeige('rules', { groups: [] })
    expect(ueberschriften(container)).toEqual([`${t.fsShort} · ${t.versammlungCard}`])
  })
})

/**
 * **Man sieht, für welche Gruppe man gerade einstellt** (T108). Bis zum
 * 21.9.2026 stand alles in einer Karte, getrennt nur von einer kleinen grauen
 * Zeile; der „+"-Knopf eines Abschnitts stand direkt über der Überschrift des
 * nächsten, und man tippte leicht in die falsche Gruppe. Vorschlag des
 * Betreibers: eigene Bereiche, alle mit derselben Hintergrundfarbe.
 */
describe('Jeder Abschnitt ist eine eigene Karte', () => {
  it('eine Karte je Abschnitt, jede mit eigener Überschrift', () => {
    const { container } = zeige('rules')
    expect(karten(container)).toHaveLength(3)
    for (const karte of karten(container)) {
      expect(karte.querySelectorAll('h2.panel-label')).toHaveLength(1)
    }
  })

  it('alle Karten tragen dieselbe Farbe — sie gehören zusammen', () => {
    const { container } = zeige('rules')
    expect(karten(container).map((k) => k.dataset.farbe)).toEqual(['neutral', 'neutral', 'neutral'])
  })

  it('der Knopf einer Karte legt die Regel für genau diese Karte an', () => {
    // Die alte Falle: Der Knopf stand am Ende eines Abschnitts und damit direkt
    // über dem nächsten. Jetzt gehört er in seine Karte — und legt für sie an.
    const { container, dispatch } = zeige('rules')
    const erwartet = [null, 'g1', 'g2']
    karten(container).forEach((karte, i) => {
      const knoepfe = karte.querySelectorAll('.fsr-add')
      expect(knoepfe).toHaveLength(1)
      fireEvent.click(knoepfe[0]!)
      expect(dispatch).toHaveBeenLastCalledWith({ type: 'fsRuleAdd', grp: erwartet[i] })
    })
  })

  it('der Erklärtext steht einmal, in der ersten Karte', () => {
    const { container } = zeige('rules')
    const hinweise = [...container.querySelectorAll('.panel-hint')]
    expect(hinweise).toHaveLength(1)
    expect(hinweise[0]!.textContent).toBe(t.fsGrundDesc)
    expect(karten(container)[0]!.contains(hinweise[0]!)).toBe(true)
  })

  it('der Gruppenaufseher bekommt genau eine Karte — samt Erklärtext, ohne leeren Rahmen', () => {
    const { container } = zeige('rules', {}, 'g2')
    expect(karten(container)).toHaveLength(1)
    expect(container.querySelectorAll('h2')).toHaveLength(1)
    expect(karten(container)[0]!.querySelector('.panel-hint')?.textContent).toBe(t.fsGrundDesc)
  })

  it('eine Gruppe, die es nicht mehr gibt, ergibt keine leere Karte', () => {
    // Der Aufseher einer gerade gelöschten Gruppe — bis der Zustand nachzieht,
    // steht hier lieber nichts als ein Rahmen ohne Inhalt.
    const { container } = zeige('rules', {}, 'g-weg')
    expect(karten(container)).toHaveLength(0)
    expect(container.textContent).toBe('')
  })

  it('die Überschrift folgt der Sprache des Lesers', () => {
    const en = dict('en')
    const { container } = zeige('rules', { lang: 'en' })
    expect(ueberschriften(container)[0]).toBe(`${en.fsShort} · ${en.versammlungCard}`)
    expect(ueberschriften(container)[0]).not.toContain(t.fsShort)
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
    const { container } = zeige('rules', { fsRules: [regel({ grp: null })] })
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
