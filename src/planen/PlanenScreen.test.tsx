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
import { syncAuxSlots } from '../data/aux-class'
import { emptyQualifications, privSetzen } from '../data/helpers'
import { helferKey } from '../data/planning'
import { dict } from '../i18n/ui'
import type { FsInstance, FsRule, Group, PartItem, Person, Section, Service, SlotSelection, Week } from '../data/types'
import { PlanenScreen } from './PlanenScreen'

/**
 * **Der Planen-Screen als Ganzes — was er zusammensetzt und für wen.**
 *
 * Die eingebetteten Bausteine sind einzeln geprüft (`MeetingSection`,
 * `PlanBanners`, `panels`, `wochen-bearbeiten`). Was nur hier steht, ist die
 * Auswahl: welcher Baustein bei welcher Rolle und welchem Reiter überhaupt
 * erscheint. Drei Entscheidungen tragen dabei Fachlogik:
 *
 * - Der **Gruppenaufseher** sieht keine Reiter der Zusammenkünfte und keine
 *   Zusammenkunft — nur die Treffpunkte seiner Gruppe und ihren Grundplan.
 *   Bekäme er die Reiterleiste, käme er auf einen Plan, den er nicht ändern
 *   darf.
 * - Die **Bearbeiten-Ansicht** (T64) gehört dem Planer. Sie stellt Anlass und
 *   Ausfall der ganzen Woche ein.
 * - Der **S-89-Bogen** steht nur unter der Woche — Schulungsaufgaben gibt es
 *   nur dort.
 *
 * Dazu der Fall, für den der Kommentar im Quelltext ausdrücklich vorsorgt: Eine
 * **Sprachvariante mit weniger Abschnitten** darf die Ansicht nicht mitreißen.
 */

const t = dict('de')

const person = (id: string, fn: string, ln: string): Person => ({
  id, fn, ln, role: 'aeltester', female: false, tel: '', mail: '', priv: emptyQualifications(),
})

const PLANER = person('p-planer', 'Paula', 'Planer')
const AUFSEHER = person('p-ov', 'Olaf', 'Overseer')
const GRUPPEN: Group[] = [{ id: 'g1', name: 'Gruppe 1', overseerId: 'p-ov', assistantId: null }]
const DIENSTE: Service[] = [{ key: 'mik', name: 'Mikrofone', count: 2, groups: false }]

function abschnitte(): Section[] {
  const schueler: PartItem = { iid: 'i103',
    num: 4, title: 'Gespräche beginnen', meta: '3 Min.',
    names: [{ name: '', bereichsKey: 'schulung' }],
  }
  return [
    { label: 'SCHÄTZE AUS GOTTES WORT', farbe: 'petrol', items: [{ iid: 'i102', num: 1, title: 'Schätze', meta: '', names: [{ name: '' }] }] },
    { label: 'UNS IM DIENST VERBESSERN', farbe: 'gold', items: [schueler] },
  ]
}

function woche(over: Partial<Week> = {}): Week {
  return {
    range: '7.–13. September', book: 'JEREMIA 32', start: '2026-09-07', 
    mid: { date: '', end: '20:45', sections: abschnitte(), helpers: { mik: [] } },
    we: { date: '', end: '11:45', sections: [], helpers: { mik: [] } },
    ...over,
  }
}

function zeige(over: Partial<AppState> = {}) {
  const dispatch = vi.fn()
  const state: AppState = {
    ...demoZustand(),
    screen: 'planen', tab: 'mid', dataStatus: 'ready',
    congregationId: 'c1', userId: 'u1', personId: PLANER.id, planner: true,
    persons: [PLANER, AUFSEHER], groups: GRUPPEN, services: DIENSTE, absences: [],
    weeks: [woche()], fsWeeks: [[]], fsRules: [], week: 0,
    congregation: { name: 'Nordheim', hall: 'Saal', times: { mid: { wd: 2, time: '19:00' }, we: { wd: 0, time: '10:00' } } },
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

/**
 * Nur die mittlere (aktuelle) Seite des Streifens — die Nachbarn zeigen dasselbe.
 *
 * Hier stand bis T120 `.week-page:not(.week-page--vor):not(.week-page--nach)`:
 * Die mittlere Woche trägt `week-page` gar nicht (nur die Nachbarn, siehe
 * `WeekStrip`), der Selektor traf nie und fiel still auf den ganzen Streifen
 * zurück — derselbe Fehler, den `ProgrammScreen.test.tsx` am 21.9.2026 behob.
 */
const seite = (c: HTMLElement): HTMLElement => (c.querySelector('.week-strip > .screen') as HTMLElement) ?? c
/**
 * Die Beschriftung eines Reiters: auf der Karte eines Tages ihr Name (T121:
 * darunter stehen Datum und Uhrzeit), sonst der Text — beim Zeichen das
 * Vorgelesene.
 */
const beschriftung = (b: Element): string =>
  (b.querySelector('.meeting-tab-name') ?? b).textContent || (b.getAttribute('aria-label') ?? '')
const reiter = (c: HTMLElement) =>
  [...seite(c).querySelectorAll('.meeting-tabs .meeting-tab, .bereich-tab')].map(beschriftung)
/** Ein Treffpunkt am Samstag, dessen Leiter noch fehlt. */
const offenerTreffpunkt = (grp: string | null): FsInstance =>
  ({ id: `f-${grp ?? 'v'}`, ruleId: null, grp, wd: 6, time: '09:30', place: 'Saal', leader: '' })
/** Die Karte eines Abschnitts, an ihrem Namen gefunden. */
const abschnitt = (c: HTMLElement, name: string): HTMLElement | undefined =>
  [...seite(c).querySelectorAll<HTMLElement>('.prog-abschnitt')].find(
    (a) => a.querySelector('.prog-abschnitt-name')?.textContent === name,
  )

afterEach(cleanup)

describe('Der Stand der Woche (T121)', () => {
  /** Der Wert unter einem Schritt der Spur, am Namen des Schritts gefunden. */
  const spurWert = (c: HTMLElement, name: string) =>
    [...seite(c).querySelectorAll('.spur-schritt')]
      .find((s) => s.querySelector('.spur-name')?.textContent === name)
      ?.querySelector('.spur-wert')?.textContent

  it('zählt die offenen Zuteilungen der gewählten Zusammenkunft', () => {
    // 2 Programmplätze + 2 Mikrofone
    const { container } = zeige()
    expect(spurWert(container, t.spurZuteilen)).toBe('0/4')
    const offen = seite(container).querySelector('.klaeren-zeile[data-art="offen"]')!
    expect(offen.textContent).toContain('Offene Zuteilungen: 4')
  })

  it('eine ausgefallene Zusammenkunft hat nichts zu besetzen (T30)', () => {
    // Eine Zahl führte den Planer an einen Plan, den es nicht gibt.
    const { container } = zeige({ weeks: [woche({ dev: { mid: { cancelled: true } } })] })
    expect(seite(container).querySelector('.spur')).toBeNull()
    expect(seite(container).querySelector('.besetzung')).toBeNull()
  })

  it('auf dem Treffpunkt-Reiter steht er nicht — er meint die Zusammenkunft', () => {
    const { container } = zeige({ tab: 'fs' })
    expect(seite(container).querySelector('.spur')).toBeNull()
    expect(seite(container).querySelector('.besetzung')).toBeNull()
  })

  it('die Wochennavigation blättert', () => {
    const { container, dispatch } = zeige({ weeks: [woche(), woche()], week: 0 })
    const pfeile = [...seite(container).querySelectorAll('.wochenwahl .week-arrow')]
    fireEvent.click(pfeile[1]!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'nextWeek' })
  })
})

describe('Die Aktionsleiste (T121, Phase 5c)', () => {
  /** Paula steht am ersten Punkt — gesendet ist noch nichts. */
  const mitZuteilung = (): Week => {
    const w = woche()
    const punkt = w.mid.sections[0]?.items[0]
    if (!punkt || 'song' in punkt) throw new Error('Testaufbau: Punkt fehlt')
    punkt.names = [{ name: 'Paula Planer', pid: PLANER.id }]
    return w
  }
  const breit = (an: boolean) => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: an }) as unknown as typeof window.matchMedia
  }

  beforeEach(() => {
    // Die Uhr vor der Woche: Was vorbei ist, geht nicht mehr hinaus (T77).
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 8, 7, 9))
    breit(false)
  })
  afterEach(() => {
    vi.useRealTimers()
    delete (window as { matchMedia?: unknown }).matchMedia
  })

  it('am Handy unten, außerhalb des Wochenstreifens — mit der Zahl dessen, was noch hinaus muss', () => {
    const { container } = zeige({ weeks: [mitZuteilung()] })
    const leiste = container.querySelector('.planen-leiste')!
    // Im Streifen klebte sie an der Woche, die beim Wischen wandert.
    expect(leiste.closest('.week-strip')).toBeNull()
    expect(leiste.querySelector('.aktion-neben')?.textContent).toBe(t.autoKnopf)
    expect(leiste.querySelector('.aktion-haupt .zahl-marke')?.textContent).toBe('1')
  })

  it('ab dem Tablet rechts neben der Woche, und unten keine Leiste', () => {
    breit(true)
    const { container } = zeige({ weeks: [mitZuteilung()] })
    expect(seite(container).querySelector('.wochenwahl .planen-aktionen .aktion-haupt')).not.toBeNull()
    expect(container.querySelector('.planen-leiste')).toBeNull()
  })

  it('nicht in „Woche einrichten" und nicht bei den Bereichen ohne Woche', () => {
    expect(zeige({ tab: 'edit' }).container.querySelector('.planen-aktionen')).toBeNull()
    cleanup()
    expect(zeige({ tab: 'fs', fsBereich: 'grundplan' }).container.querySelector('.planen-aktionen')).toBeNull()
  })

  it('bei den Treffpunkten der Woche öffnet „Automatisch" ihr eigenes Blatt (Phase 5e)', () => {
    const { container } = zeige({ tab: 'fs' })
    fireEvent.click(container.querySelector('.planen-leiste .aktion-neben')!)
    expect(document.querySelector('[role="dialog"] .auto-bereich-name')?.textContent).toBe(t.fsLeiterLbl)
  })

  it('auf altem Stand kein „Plan senden" — er ginge an der Momentaufnahme vorbei hinaus', () => {
    const { container } = zeige({ weeks: [mitZuteilung()], staleAt: 1 })
    expect(container.querySelector('.aktion-neben')).not.toBeNull()
    expect(container.querySelector('.aktion-haupt')).toBeNull()
  })

  it('„Automatisch" und „Plan senden" öffnen ihr Blatt', () => {
    const { container } = zeige({ weeks: [mitZuteilung()] })
    fireEvent.click(container.querySelector('.aktion-neben')!)
    expect(document.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe(t.autoTitel)
    fireEvent.keyDown(window, { key: 'Escape' })
    fireEvent.click(container.querySelector('.aktion-haupt')!)
    expect(document.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe(t.planSenden)
  })
})

describe('Zuteilen am Desktop: die Spalte neben dem Plan (T121, Phase 5d-2)', () => {
  /** Der Schülerteil der Woche — der zweite Abschnitt, sein erster Platz. */
  const schueler = (wi = 0): SlotSelection => ({
    kind: 'part', wi, tab: 'mid', si: 1, ii: 0, ni: 0, label: 'Gespräche beginnen', priv: 'schulung', groups: false,
  })
  const spalte = (c: HTMLElement) => c.querySelector('.zuteilen-spalte')

  beforeEach(() => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia
  })
  afterEach(() => {
    delete (window as { matchMedia?: unknown }).matchMedia
  })

  it('ohne gewählten Platz sagt sie, was zu tun ist — außerhalb des Wochenstreifens', () => {
    const { container } = zeige()
    expect(spalte(container)?.closest('.week-strip')).toBeNull()
    expect(spalte(container)?.getAttribute('aria-label')).toBe(t.spurZuteilen)
    expect(spalte(container)?.textContent).toBe(t.zuteilenLeer)
  })

  it('der gewählte Platz steht darin — und ist im Plan hervorgehoben', () => {
    const { container } = zeige({ slotSel: schueler() })
    expect(spalte(container)?.querySelector('.sheet-title')?.textContent).toBe('4 Gespräche beginnen')
    expect(spalte(container)?.querySelector('.zuteilen-liste')).not.toBeNull()
    const gewaehlt = [...seite(container).querySelectorAll('.platz.is-gewaehlt')]
    expect(gewaehlt).toHaveLength(1)
    expect(gewaehlt[0]?.getAttribute('aria-current')).toBe('true')
    // Der Schülerteil, nicht der Punkt darüber.
    expect(gewaehlt[0]?.closest('.prog-abschnitt')?.textContent).toContain('UNS IM DIENST VERBESSERN')
  })

  it('der Fokus geht gleich in die Suche — tippen statt durch das Programm tabben', () => {
    const priv = emptyQualifications()
    privSetzen(priv, 'schulung', true)
    const SCHUELERIN: Person = { ...person('p-s', 'Sina', 'Schulz'), role: 'verkuendiger', female: true, priv }
    const { container } = zeige({ slotSel: schueler(), persons: [PLANER, AUFSEHER, SCHUELERIN] })
    const suche = spalte(container)?.querySelector('.zuteilen-suche input')
    expect(suche).not.toBeNull()
    expect(document.activeElement).toBe(suche)
  })

  it('ein Platz einer anderen Woche bleibt draußen — die Spalte zeigt nur, was der Plan zeigt', () => {
    const { container } = zeige({ slotSel: schueler(1), weeks: [woche(), woche({ start: '2026-09-14' })] })
    expect(spalte(container)?.textContent).toBe(t.zuteilenLeer)
    expect(seite(container).querySelector('.platz.is-gewaehlt')).toBeNull()
  })

  it('unter 1180 px keine Spalte — dort teilt das Blatt zu', () => {
    window.matchMedia = vi.fn((q: string) => ({ matches: !q.includes('1180') })) as unknown as typeof window.matchMedia
    expect(spalte(zeige().container)).toBeNull()
  })

  it('nicht in „Woche einrichten" und nicht bei den Gruppenbesuchen', () => {
    expect(spalte(zeige({ tab: 'edit' }).container)).toBeNull()
    cleanup()
    expect(spalte(zeige({ tab: 'fs', fsBereich: 'gruppenbesuche' }).container)).toBeNull()
  })

  it('bei den Treffpunkten der Woche steht sie — ihr Leiter wird darin zugeteilt (Phase 5e)', () => {
    const { container } = zeige({
      tab: 'fs',
      fsWeeks: [[{ id: 'f1', ruleId: null, grp: null, wd: 6, time: '09:30', place: 'Saal', leader: '' }]],
      slotSel: { kind: 'fs', wi: 0, instId: 'f1', label: t.fsVers, priv: 'treffpunkt', groups: false },
    })
    expect(spalte(container)?.querySelector('.sheet-title')?.textContent).toContain(t.fsVers)
    expect(seite(container).querySelector('.treff-leiter-zeile .platz.is-gewaehlt')).not.toBeNull()
  })
})

describe('Die Reiter', () => {
  it('die Zusammenkünfte haben drei: beide Zusammenkünfte und „Woche einrichten"', () => {
    // Die Treffpunkte waren bis T120 ein vierter Reiter; sie sind jetzt das
    // Thema Predigtdienst und stehen im Menü.
    const { container } = zeige()
    expect(reiter(container)).toEqual(['Dienstag', 'Sonntag', t.wocheEinrichten])
  })

  it('der Predigtdienst hat vier: Treffpunkte der Woche, Gruppenbesuche, öffentliches Zeugnisgeben und Grundplan', () => {
    const { container } = zeige({ tab: 'fs' })
    expect(reiter(container)).toEqual([t.fsTreffpunkteTab, t.fsGruppenbesucheTab, t.privZeugnis, t.fsGrundplan])
  })

  it('ein Reiterwechsel schlägt durch', () => {
    const { container, dispatch } = zeige()
    fireEvent.click([...seite(container).querySelectorAll('.meeting-tabs .meeting-tab')][2]!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'setTab', tab: 'edit' })
  })

  it('eine verlegte Zusammenkunft trägt ihren echten Tag im Reiter (T30)', () => {
    const { container } = zeige({ weeks: [woche({ dev: { mid: { wd: 4 } } })] })
    expect(reiter(container)[0]).toBe('Donnerstag')
  })

  it('eine ausgefallene steht im Reiter durchgestrichen da — schon bevor man ihn wählt (T30)', () => {
    // Bis T121 sagte das ein Chip unter der Wochen-Navigation.
    const { container } = zeige({ weeks: [woche({ dev: { we: { cancelled: true } } })] })
    const tage = [...seite(container).querySelectorAll('.meeting-tabs .meeting-tab-name')]
    expect(tage.map((n) => n.querySelector('s') !== null)).toEqual([false, true])
  })
})

describe('Der Kopf nennt das Thema (T120)', () => {
  const titel = (c: HTMLElement) => seite(c).querySelector('.bereichstitel .seitentitel')?.textContent

  it('Zusammenkünfte oder Predigtdienst — je nach Reiter', () => {
    expect(titel(zeige().container)).toBe(t.navZusammenkuenfte)
    cleanup()
    expect(titel(zeige({ tab: 'fs' }).container)).toBe(t.tabFs)
  })

  it('beim Gruppenaufseher immer den Predigtdienst — auch mit einem Reiter von früher', () => {
    // Darunter stehen seine Treffpunkte; der Kopf nennt, was darunter steht.
    for (const tab of ['mid', 'edit'] as const) {
      const { container } = zeige({ planner: false, personId: AUFSEHER.id, tab })
      expect(titel(container), tab).toBe(t.tabFs)
      cleanup()
    }
  })

  it('„Fertig" führt zum Ansehen desselben Bereichs', () => {
    const { container, dispatch } = zeige({ tab: 'fs' })
    const fertig = seite(container).querySelector<HTMLButtonElement>('.bereichstitel .planen-knopf')!
    expect(fertig.textContent).toBe(t.fertig)
    fireEvent.click(fertig)
    expect(dispatch).toHaveBeenCalledWith({ type: 'navigate', screen: 'programm', thema: 'predigtdienst' })
  })
})

describe('Der Grundplan im Predigtdienst (T120)', () => {
  it('ein Tipp auf den Reiter wechselt den Bereich', () => {
    const { container, dispatch } = zeige({ tab: 'fs' })
    const grundplan = [...seite(container).querySelectorAll('.bereich-tab')].find(
      (b) => b.textContent === t.fsGrundplan,
    )!
    fireEvent.click(grundplan)
    expect(dispatch).toHaveBeenCalledWith({ type: 'setFsBereich', bereich: 'grundplan' })
  })

  /** Eine Regel je Abschnitt: die Versammlung montags, Gruppe 1 samstags. */
  const REGELN: FsRule[] = [
    { id: 'r-v', grp: null, wd: 1, time: '14:00', place: 'Saal', monthly: 0, skipCong: false },
    { id: 'r-g1', grp: 'g1', wd: 6, time: '09:30', place: 'Park', monthly: 0, skipCong: true },
  ]
  const titelDerRegeln = (c: HTMLElement) => [...c.querySelectorAll('.regel-zeile .treff-titel')].map((x) => x.textContent)

  it('steht ohne Woche da — er gilt für alle Wochen', () => {
    const { container } = zeige({ tab: 'fs', fsBereich: 'grundplan', fsRules: REGELN })
    expect(container.querySelector('.week-strip')).toBeNull()
    expect(container.querySelector('.wochenwahl')).toBeNull()
    expect(titelDerRegeln(container)).toEqual([t.fsVers, 'Gruppe 1'])
  })

  it('auch, solange noch keine Woche geladen ist — eine neue Versammlung richtet ihn vorher ein', () => {
    const leer = zeige({ tab: 'fs', weeks: [], fsWeeks: [] })
    expect(leer.container.textContent).toContain(t.keineWochenTitel)
    expect(reiter(leer.container)).toEqual([t.fsTreffpunkteTab, t.fsGruppenbesucheTab, t.privZeugnis, t.fsGrundplan])
    cleanup()
    const { container } = zeige({ tab: 'fs', weeks: [], fsWeeks: [], fsBereich: 'grundplan' })
    expect(container.textContent).not.toContain(t.keineWochenTitel)
    expect(container.querySelector('.knopf-neu')?.textContent).toBe(t.fsFuerJedeWoche)
  })

  it('der Gruppenaufseher sieht nur den seiner Gruppe', () => {
    // Bis T120 stand das unter Einstellungen; die Versammlungstreffpunkte
    // gehören nicht zu ihm.
    const { container } = zeige({
      planner: false, personId: AUFSEHER.id, tab: 'fs', fsBereich: 'grundplan', fsRules: REGELN,
    })
    expect(titelDerRegeln(container)).toEqual(['Gruppe 1'])
  })

  it('bei den Zusammenkünften gilt der Bereich nicht — ihr Reiter zeigt die Woche', () => {
    const { container } = zeige({ tab: 'mid', fsBereich: 'grundplan' })
    expect(seite(container).querySelector('.prog-row')).toBeTruthy()
  })
})

describe('Die Gruppenbesuche im Predigtdienst (T120, Phase 2)', () => {
  it('stehen ohne Woche da und zeigen ihren Plan', () => {
    const { container } = zeige({ tab: 'fs', fsBereich: 'gruppenbesuche' })
    expect(container.querySelector('.week-strip')).toBeNull()
    expect(container.querySelector('.gb-karte-titel')?.textContent).toBe(t.gbAlle)
    expect(container.textContent).toContain(t.gbLeer)
  })

  it('auch ohne geladene Woche — Besuche dürfen weiter voraus liegen als jedes Programm', () => {
    const { container } = zeige({ tab: 'fs', fsBereich: 'gruppenbesuche', weeks: [], fsWeeks: [] })
    expect(container.querySelector('.gb-karte-titel')?.textContent).toBe(t.gbAlle)
  })

  it('der Gruppenaufseher plant sie nicht — bei ihm gilt der Bereich als „Treffpunkte"', () => {
    const { container } = zeige({ planner: false, personId: AUFSEHER.id, tab: 'fs', fsBereich: 'gruppenbesuche' })
    expect(container.querySelector('.gb-karte')).toBeNull()
    expect(seite(container).querySelector('.treff-leer')).toBeTruthy() // der Plan der Treffpunkte
  })

  it('angelegt wird von Hand — „Besuch hinzufügen" (13.10.2026)', () => {
    // „Reihum verteilen" gibt es nicht mehr, auch nicht als Wort (`gbVerteilen`
    // ging mit Phase 5f): Die Weiteren Pläne verteilen mit „Beginnen mit".
    const { container } = zeige({ tab: 'fs', fsBereich: 'gruppenbesuche' })
    expect(container.querySelector('.gb-neu')?.textContent).toBe(t.gbHinzufuegen)
  })
})

describe('Der Gruppenaufseher sieht nur seine Treffpunkte', () => {
  amHandy()
  const alsAufseher = (over: Partial<AppState> = {}) =>
    zeige({ planner: false, personId: AUFSEHER.id, ...over })

  it('ohne die Reiter der Zusammenkünfte — er käme sonst auf einen Plan, den er nicht ändern darf', () => {
    const { container } = alsAufseher()
    expect(reiter(container)).toEqual([t.fsTreffpunkteTab, t.fsGrundplan])
  })

  it('und ohne die Zusammenkunft selbst', () => {
    const { container } = alsAufseher()
    expect(seite(container).querySelector('.treff-leer')).toBeTruthy() // der Plan der Treffpunkte
    expect(seite(container).querySelector('.prog-row')).toBeNull() // keine Programmpunkte
    expect(seite(container).querySelector('.besetzung')).toBeNull()
  })

  it('„Automatisch" bekommt seine Gruppe mit', () => {
    const { container, dispatch } = alsAufseher({ fsWeeks: [[offenerTreffpunkt('g1')]] })
    fireEvent.click(container.querySelector('.planen-leiste .aktion-neben')!)
    fireEvent.click(document.querySelector('[role="dialog"] .auto-fuss .knopf-haupt')!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'fsAutoAssign', onlyGroup: 'g1' })
  })

  it('auch ein stehengebliebener „edit"-Reiter führt ihn nicht in die Bearbeitung', () => {
    // Er kann ihn nicht wählen — aber der Zustand könnte von vorher stammen.
    const { container } = alsAufseher({ tab: 'edit' })
    expect(seite(container).querySelector('.anlass-liste')).toBeNull()
  })
})

describe('Woche einrichten (T64, T121 `GWochePlanen`)', () => {
  it('zeigt Anlass, beide Zusammenkünfte, Termine und Programm statt des Plans', () => {
    const { container } = zeige({ tab: 'edit' })
    expect(seite(container).querySelector('.anlass-liste')).toBeTruthy()
    expect(seite(container).querySelectorAll('.einrichten-zusammenkunft')).toHaveLength(2)
    expect(seite(container).textContent).toContain(t.programmpunkteBearbeiten)
    expect(seite(container).querySelector('.prog-row')).toBeNull()
    expect(seite(container).querySelector('.besetzung')).toBeNull()
  })

  it('ist eine Ebene unter dem Plan: Titel und Zurück statt der Karten der Tage', () => {
    const { container, dispatch } = zeige({ tab: 'edit' })
    expect(seite(container).querySelector('.unteransicht-kopf .seitentitel')?.textContent).toBe(t.wocheEinrichten)
    expect(seite(container).querySelector('.meeting-tabs')).toBeNull()
    fireEvent.click(seite(container).querySelector<HTMLButtonElement>(`.unteransicht-kopf [aria-label="${t.a11yZurueck}"]`)!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'setTab', tab: 'mid' })
  })

  it('der Admin kommt über das Zeichen neben den Tagen hin', () => {
    const { container, dispatch } = zeige()
    const zeichen = [...seite(container).querySelectorAll('.meeting-tabs .meeting-tab')].find(
      (b) => b.getAttribute('aria-label') === t.wocheEinrichten,
    )!
    fireEvent.click(zeichen)
    expect(dispatch).toHaveBeenCalledWith({ type: 'setTab', tab: 'edit' })
  })
})

describe('Der Treffpunkt-Reiter', () => {
  amHandy()
  it('zeigt den Treffpunkt-Plan ohne Gruppen-Einschränkung', () => {
    const { container, dispatch } = zeige({ tab: 'fs', fsWeeks: [[offenerTreffpunkt('g1')]] })
    expect(seite(container).querySelector('.knopf-neu')).toBeTruthy()
    fireEvent.click(container.querySelector('.planen-leiste .aktion-neben')!)
    fireEvent.click(document.querySelector('[role="dialog"] .auto-fuss .knopf-haupt')!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'fsAutoAssign', onlyGroup: null })
  })

  it('und keine Programmabschnitte', () => {
    const { container } = zeige({ tab: 'fs' })
    expect(seite(container).querySelector('.prog-abschnitt')).toBeNull()
    expect(seite(container).querySelector('.platz')).toBeNull()
  })
})

describe('Das Programm der Zusammenkunft', () => {
  it('jeder Abschnitt wird zu einer Karte — wie beim Ansehen', () => {
    const { container } = zeige()
    const namen = [...seite(container).querySelectorAll('.prog-abschnitt-name')].map((x) => x.textContent)
    expect(namen).toEqual(['SCHÄTZE AUS GOTTES WORT', 'UNS IM DIENST VERBESSERN', t.hilfsdienste])
  })

  it('eine Sprachvariante mit weniger Abschnitten reißt die Ansicht nicht mit', () => {
    // Der Fall, für den der Quelltext ausdrücklich vorsorgt: `localizedWeek`
    // prüft die Strukturgleichheit, aber der Screen verlässt sich nicht darauf.
    const kanonisch = woche()
    const kurz: Week = {
      ...kanonisch,
      mid: { ...kanonisch.mid, sections: [...abschnitte(), { label: 'ZUVIEL', farbe: 'wein', items: [] }] },
    }
    expect(() => zeige({ weeks: [{ ...kanonisch, alt: { en: kurz } }], lang: 'en', congLang: 'en' }))
      .not.toThrow()
  })

  it('sagt jemand einen Hilfsdienst ab, steht dort „Ersatz gesucht" — die App sucht selbst', () => {
    // Beim Programmpunkt steht die Absage (MeetingSection.test.tsx); beim
    // Hilfsdienst, was nach ihr geschieht (`declineTask`).
    const w = woche()
    w.mid.helpers = { mik: [{ name: 'Olaf Overseer', pid: AUFSEHER.id }] }
    const { container } = zeige({ weeks: [w], confirmations: { [helferKey(w.start, 'mid', 'mik', 0)]: 'verhindert' } })
    const platz = abschnitt(container, t.hilfsdienste)!.querySelector('.platz')!
    expect(platz.className).toContain('is-problem')
    expect(platz.querySelector('.platz-hinweis')?.textContent).toBe(t.spurErsatzGesucht)
  })

  it('der Hilfsdienst-Block steht darunter und öffnet seinen Platz', () => {
    const { container, dispatch } = zeige()
    const plaetze = [...abschnitt(container, t.hilfsdienste)!.querySelectorAll('.platz')]
    expect(plaetze).toHaveLength(2) // zwei Mikrofon-Plätze
    fireEvent.click(plaetze[1]!)
    expect(dispatch).toHaveBeenCalledWith({
      type: 'openSlot',
      sel: expect.objectContaining({ kind: 'helper', svc: 'mik', pos: 1, wi: 0, tab: 'mid' }),
    })
  })

  it('der S-89-Bogen steht nur unter der Woche — Schulungsaufgaben gibt es nur dort', () => {
    const mitSchueler = woche()
    ;(mitSchueler.mid.sections[1]!.items[0] as PartItem).names[0]!.name = 'Paula Planer'
    expect(zeige({ weeks: [mitSchueler] }).container.querySelector('.s89-bogen')).toBeTruthy()
    cleanup()
    expect(zeige({ weeks: [mitSchueler], tab: 'we' }).container.querySelector('.s89-bogen')).toBeNull()
  })

  it('die Ratgeber-Karte nur mit eingerichteter Klasse', () => {
    expect(zeige().container.textContent).not.toContain(t.auxRatgeberHint)
    cleanup()
    const mitKlasse = syncAuxSlots([woche()], true)
    expect(zeige({ weeks: mitKlasse, auxClass: true }).container.textContent).toContain(
      t.auxRatgeberHint,
    )
  })
})

describe('Ohne geladene Woche', () => {
  it('steht der Hinweis auf den Import — auch hier', () => {
    const { container } = zeige({ weeks: [] })
    expect(container.textContent).toContain(t.keineWochenTitel)
  })
})

describe('Der Besucher bleibt sichtbar (T120)', () => {
  // Mit fester Uhr und einem Besuch einen Monat voraus: Hier stand das Jahr
  // 2099, und die Wochenwahl des Besuchs zählte jede Woche bis dorthin auf —
  // gut 3800 Einträge, eine Sekunde je Lauf und unter Last über der Frist.
  amMontagDerTestwoche()
  amHandy()
  /** Das Besucher-Feld im offenen Blatt. */
  const besucherFeld = () =>
    [...document.querySelectorAll('[role="dialog"] .blatt-feld')]
      .find((f) => f.querySelector('.feld-marke')?.textContent === t.gbBesucher)!
      .querySelector('select')!

  it('auch wenn er inzwischen keine Treffpunkte mehr leiten darf', () => {
    // Ohne ihn in der Auswahl zeigte das Feld „Besucher wählen" — als gäbe es keinen.
    const { container } = zeige({
      tab: 'fs',
      fsBereich: 'gruppenbesuche',
      gruppenbesuche: [{ id: 'b1', woche: '2026-10-05', grp: 'g1', pid: AUFSEHER.id }],
    })
    fireEvent.click(container.querySelector('.gb-zeile')!)
    expect(besucherFeld().value).toBe(AUFSEHER.id)
  })

  it('als Vorschlag für einen neuen Besuch gilt er dagegen nicht', () => {
    const { container } = zeige({
      tab: 'fs',
      fsBereich: 'gruppenbesuche',
      gruppenbesuche: [{ id: 'b1', woche: '2026-10-05', grp: 'g1', pid: AUFSEHER.id }],
    })
    fireEvent.click(container.querySelector('.gb-neu')!)
    expect(besucherFeld().value).toBe('')
  })
})

/**
 * **Der Planer teilt zu, ändert den Plan aber nicht** (Rechte-Stufe „Planer",
 * 4.10.2026). Was den Plan selbst ändert, steht bei ihm nicht da: der
 * Bearbeiten-Reiter, eigene Punkte, Reihenfolge und Minuten, der Grundplan.
 * Was zum Zuteilen gehört, schon — auch die vier Grenzfälle, die der Betreiber
 * ihm zugesprochen hat. Die Grenze zieht der Server (`zuteilen`); stünde hier
 * ein Knopf, den er nicht drücken darf, lüde die App beim Drücken bloß nach.
 */
/** Montag der Testwoche: Was gesendet werden kann, liegt noch vor einem. */
function amMontagDerTestwoche() {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 8, 7, 9, 0))
  })
  afterEach(() => vi.useRealTimers())
}

/**
 * Am Handy, für Tests, die ein Blatt öffnen: Es fragt beim Wischen, ob wir am
 * Schreibtisch sitzen — und jsdom kennt matchMedia nicht.
 */
function amHandy() {
  beforeEach(() => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia
  })
  afterEach(() => {
    delete (window as { matchMedia?: unknown }).matchMedia
  })
}

describe('Der Planer teilt zu, ändert den Plan aber nicht (4.10.2026)', () => {
  amMontagDerTestwoche()
  const ALS_PLANER: Partial<AppState> = { planner: false, zuteiler: true }
  const lac: Section = {
    label: 'UNSER LEBEN ALS CHRIST', kind: 'lac', farbe: 'wein',
    items: [{ iid: 'l1', title: 'Örtliche Bedürfnisse', meta: '15 Min.', mins: 15, names: [{ name: 'Olaf Overseer', pid: 'p-ov', bereichsKey: 'besprechung' }] }],
  }
  const vortrag: Section = {
    label: 'ÖFFENTLICHER VORTRAG', kind: 'vortrag', farbe: 'petrol',
    items: [{ iid: 'v1', title: 'Ein Thema', names: [{ name: '', rolle: 'Gastredner', bereichsKey: 'vortrag' }] }],
  }
  const mitLac = (): Week => {
    const w = woche()
    w.mid.sections.push(lac)
    w.we.sections.push(vortrag)
    return w
  }

  it('die Zusammenkünfte ohne den Bearbeiten-Reiter', () => {
    const { container } = zeige({ ...ALS_PLANER })
    expect(reiter(container)).toEqual(['Dienstag', 'Sonntag'])
  })

  it('ein stehengebliebener „edit"-Reiter führt ihn nicht in die Bearbeitung', () => {
    // Gegenprobe: beim Admin steht dort der Anlass der Woche.
    expect(seite(zeige({ tab: 'edit' }).container).querySelector('.anlass-liste')).not.toBeNull()
    cleanup()
    const { container } = zeige({ ...ALS_PLANER, tab: 'edit' })
    expect(seite(container).querySelector('.anlass-liste')).toBeNull()
    expect(seite(container).querySelector('.meeting-tabs')).not.toBeNull()
  })

  it('den Ablauf ändert er nicht — die Steuerung dafür steht nur unter „Woche einrichten" (T121)', () => {
    // Eigene Punkte, Reihenfolge und Minuten gehören dem Admin; seit Phase 5b
    // stehen sie in dessen „Woche einrichten", nicht mehr im Plan.
    const planer = zeige({ ...ALS_PLANER, weeks: [mitLac()] })
    const s = seite(planer.container)
    expect(s.querySelector('.plus-minus')).toBeNull()
    expect(s.textContent).not.toContain(t.programmpunkteBearbeiten)
    // Den Platz darin teilt er aber zu.
    expect(s.textContent).toContain('Olaf Overseer')
  })

  it('der Partner am Schülerteil und das Vortragsthema gehören zum Zuteilen (Grenzfälle)', () => {
    const { container } = zeige({ ...ALS_PLANER, weeks: [mitLac()] })
    expect(seite(container).querySelector('.partner-toggle')).not.toBeNull()
    cleanup()
    const am = zeige({ ...ALS_PLANER, weeks: [mitLac()], tab: 'we' })
    expect(seite(am.container).querySelector('.talk-title-input')).not.toBeNull()
  })

  it('„Plan senden" steht auch bei ihm — in der Aktionsleiste (T121)', () => {
    const { container } = zeige({ ...ALS_PLANER, weeks: [mitLac()] })
    expect(container.querySelector('.planen-leiste .aktion-haupt')?.textContent).toContain(t.planSenden)
  })

  it('im Predigtdienst kein Grundplan — es gibt dort nichts zuzuteilen', () => {
    const { container } = zeige({ ...ALS_PLANER, tab: 'fs' })
    expect(reiter(container)).toEqual([t.fsTreffpunkteTab, t.fsGruppenbesucheTab, t.privZeugnis])
  })

  it('ist er zugleich Gruppenaufseher, pflegt er den Grundplan seiner Gruppe', () => {
    const { container } = zeige({ ...ALS_PLANER, personId: AUFSEHER.id, tab: 'fs' })
    expect(reiter(container)).toEqual([t.fsTreffpunkteTab, t.fsGruppenbesucheTab, t.privZeugnis, t.fsGrundplan])
  })
})

describe('Der Gruppenaufseher sendet die Treffpunkte seiner Gruppe (4.10.2026)', () => {
  amMontagDerTestwoche()
  amHandy()
  it('über die Leiste wie der Planer — aber nur, was seine Gruppe betrifft (T121, Phase 5e)', () => {
    const { container } = zeige({
      planner: false,
      personId: AUFSEHER.id,
      tab: 'fs',
      weeks: [woche()],
      fsWeeks: [[
        { id: 'f1', ruleId: 'r1', grp: 'g1', wd: 6, time: '09:30', place: 'Saal', leader: 'Paula Planer', lpid: PLANER.id },
        { id: 'f2', ruleId: 'r2', grp: 'g2', wd: 6, time: '10:00', place: 'Park', leader: 'Olaf Overseer', lpid: AUFSEHER.id },
      ]],
    })
    const knopf = container.querySelector('.planen-leiste .aktion-haupt')!
    expect(knopf.querySelector('.zahl-marke')?.textContent).toBe('1')
    fireEvent.click(knopf)
    const blatt = document.querySelector('[role="dialog"]')!
    expect(blatt.textContent).toContain(t.fsSendenOffen.replace('{n}', '1'))
    expect(blatt.textContent).toContain('Paula Planer')
    expect(blatt.textContent).not.toContain('Olaf Overseer')
  })
})
