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
import { syncAuxSlots } from '../data/aux-class'
import { emptyQualifications } from '../data/helpers'
import { dict } from '../i18n/ui'
import type { Group, PartItem, Person, Section, Service, Week } from '../data/types'
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
const reiter = (c: HTMLElement) =>
  [...seite(c).querySelectorAll('.plan-tabs .meeting-tab')].map((b) => b.textContent ?? '')

afterEach(cleanup)

describe('Der Kopf', () => {
  it('zählt die offenen Zuteilungen der gewählten Zusammenkunft', () => {
    // 2 Programmplätze + 2 Mikrofone
    const { container } = zeige()
    expect(seite(container).querySelector('.screen-head-note')?.textContent).toBe(
      'Offene Zuteilungen: 4',
    )
  })

  it('eine ausgefallene Zusammenkunft hat nichts offen (T30)', () => {
    const { container } = zeige({ weeks: [woche({ dev: { mid: { cancelled: true } } })] })
    expect(seite(container).querySelector('.screen-head-note')?.textContent).toBe(
      'Offene Zuteilungen: 0',
    )
  })

  it('auf dem Treffpunkt-Reiter steht die Zahl nicht — sie meint die Zusammenkunft', () => {
    const { container } = zeige({ tab: 'fs' })
    expect(seite(container).querySelector('.screen-head-note')).toBeNull()
  })

  it('die Wochennavigation blättert', () => {
    const { container, dispatch } = zeige({ weeks: [woche(), woche()], week: 0 })
    const pfeile = [...seite(container).querySelectorAll('.plan-week-nav .week-arrow')]
    fireEvent.click(pfeile[1]!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'nextWeek' })
  })
})

describe('Die Reiter', () => {
  it('die Zusammenkünfte haben drei: beide Zusammenkünfte und Bearbeiten', () => {
    // Die Treffpunkte waren bis T120 ein vierter Reiter; sie sind jetzt das
    // Thema Predigtdienst und stehen im Menü.
    const { container } = zeige()
    expect(reiter(container)).toEqual(['Dienstag', 'Sonntag', '✎'])
  })

  it('der Predigtdienst hat vier: Treffpunkte der Woche, Gruppenbesuche, öffentliches Zeugnisgeben und Grundplan', () => {
    const { container } = zeige({ tab: 'fs' })
    expect(reiter(container)).toEqual([t.fsTreffpunkteTab, t.fsGruppenbesucheTab, t.privZeugnis, t.fsGrundplan])
  })

  it('ein Reiterwechsel schlägt durch', () => {
    const { container, dispatch } = zeige()
    fireEvent.click([...seite(container).querySelectorAll('.plan-tabs .meeting-tab')][2]!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'setTab', tab: 'edit' })
  })

  it('eine verlegte Zusammenkunft trägt ihren echten Tag im Reiter (T30)', () => {
    const { container } = zeige({ weeks: [woche({ dev: { mid: { wd: 4 } } })] })
    expect(reiter(container)[0]).toBe('Donnerstag')
  })
})

describe('Der Kopf nennt das Thema (T120)', () => {
  const titel = (c: HTMLElement) => seite(c).querySelector('.thema-kopf .screen-title')?.textContent

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

  it('der Schalter führt zum Ansehen desselben Themas', () => {
    const { container, dispatch } = zeige({ tab: 'fs' })
    const ansehen = [...seite(container).querySelectorAll('.modus-knopf')].find((b) => b.textContent === t.ansehen)!
    fireEvent.click(ansehen)
    expect(dispatch).toHaveBeenCalledWith({ type: 'navigate', screen: 'programm', thema: 'predigtdienst' })
  })
})

describe('Der Grundplan im Predigtdienst (T120)', () => {
  it('ein Tipp auf den Reiter wechselt den Bereich', () => {
    const { container, dispatch } = zeige({ tab: 'fs' })
    const grundplan = [...seite(container).querySelectorAll('.plan-tabs .meeting-tab')].find(
      (b) => b.textContent === t.fsGrundplan,
    )!
    fireEvent.click(grundplan)
    expect(dispatch).toHaveBeenCalledWith({ type: 'setFsBereich', bereich: 'grundplan' })
  })

  it('steht ohne Woche da — er gilt für alle Wochen', () => {
    const { container } = zeige({ tab: 'fs', fsBereich: 'grundplan' })
    expect(container.querySelector('.week-strip')).toBeNull()
    expect(container.querySelector('.plan-week-nav')).toBeNull()
    const karten = [...container.querySelectorAll('.panel-label')].map((x) => x.textContent)
    expect(karten).toEqual([`${t.fsShort} · ${t.versammlungCard}`, `${t.fsShort} · Gruppe 1`])
  })

  it('auch, solange noch keine Woche geladen ist — eine neue Versammlung richtet ihn vorher ein', () => {
    const leer = zeige({ tab: 'fs', weeks: [], fsWeeks: [] })
    expect(leer.container.textContent).toContain(t.keineWochenTitel)
    expect(reiter(leer.container)).toEqual([t.fsTreffpunkteTab, t.fsGruppenbesucheTab, t.privZeugnis, t.fsGrundplan])
    cleanup()
    const { container } = zeige({ tab: 'fs', weeks: [], fsWeeks: [], fsBereich: 'grundplan' })
    expect(container.textContent).not.toContain(t.keineWochenTitel)
    expect(container.querySelectorAll('.panel-label').length).toBeGreaterThan(0)
  })

  it('der Gruppenaufseher sieht nur den seiner Gruppe', () => {
    // Bis T120 stand das unter Einstellungen; die Versammlungstreffpunkte
    // gehören nicht zu ihm.
    const { container } = zeige({ planner: false, personId: AUFSEHER.id, tab: 'fs', fsBereich: 'grundplan' })
    const karten = [...container.querySelectorAll('.panel-label')].map((x) => x.textContent)
    expect(karten).toEqual([`${t.fsShort} · Gruppe 1`])
  })

  it('bei den Zusammenkünften gilt der Bereich nicht — ihr Reiter zeigt die Woche', () => {
    const { container } = zeige({ tab: 'mid', fsBereich: 'grundplan' })
    expect(seite(container).querySelector('.plan-item')).toBeTruthy()
  })
})

describe('Die Gruppenbesuche im Predigtdienst (T120, Phase 2)', () => {
  it('stehen ohne Woche da und zeigen ihren Plan', () => {
    const { container } = zeige({ tab: 'fs', fsBereich: 'gruppenbesuche' })
    expect(container.querySelector('.week-strip')).toBeNull()
    expect(container.textContent).toContain(t.gbTitel)
    expect(container.textContent).toContain(t.gbLeer)
  })

  it('auch ohne geladene Woche — Besuche dürfen weiter voraus liegen als jedes Programm', () => {
    const { container } = zeige({ tab: 'fs', fsBereich: 'gruppenbesuche', weeks: [], fsWeeks: [] })
    expect(container.textContent).toContain(t.gbTitel)
  })

  it('der Gruppenaufseher plant sie nicht — bei ihm gilt der Bereich als „Treffpunkte"', () => {
    const { container } = zeige({ planner: false, personId: AUFSEHER.id, tab: 'fs', fsBereich: 'gruppenbesuche' })
    expect(container.textContent).not.toContain(t.gbTitel)
    expect(seite(container).querySelector('.plan-auto')).toBeTruthy() // die der Treffpunkte
  })

  it('„Reihum verteilen" braucht erst einen Besucher', () => {
    // Besuchen darf, wer Treffpunkte leiten darf.
    const besucher = { ...AUFSEHER, priv: { ...emptyQualifications(), treffpunkt: true } }
    const { container, dispatch } = zeige({ tab: 'fs', fsBereich: 'gruppenbesuche', persons: [PLANER, besucher] })
    const knopf = [...container.querySelectorAll<HTMLButtonElement>('.plan-auto-btn--primary')].find(
      (b) => b.textContent === t.gbVerteilen,
    )!
    expect(knopf.disabled).toBe(true)
    fireEvent.change(container.querySelector('.gb-besucher select')!, { target: { value: AUFSEHER.id } })
    expect(knopf.disabled).toBe(false)
    fireEvent.click(knopf)
    // Ohne Besuche das erste Wochenende, und kein Monat ausgelassen.
    expect(dispatch).toHaveBeenCalledWith({ type: 'besucheVerteilen', pid: AUFSEHER.id, wochenende: 1, auslassen: [] })
  })
})

describe('Der Gruppenaufseher sieht nur seine Treffpunkte', () => {
  const alsAufseher = (over: Partial<AppState> = {}) =>
    zeige({ planner: false, personId: AUFSEHER.id, ...over })

  it('ohne die Reiter der Zusammenkünfte — er käme sonst auf einen Plan, den er nicht ändern darf', () => {
    const { container } = alsAufseher()
    expect(reiter(container)).toEqual([t.fsTreffpunkteTab, t.fsGrundplan])
  })

  it('und ohne die Zusammenkunft selbst', () => {
    const { container } = alsAufseher()
    expect(seite(container).querySelector('.plan-auto')).toBeTruthy() // die der Treffpunkte
    expect(seite(container).querySelector('.plan-item')).toBeNull() // keine Programmplätze
  })

  it('der Treffpunkt-Plan bekommt seine Gruppe mit', () => {
    const { container, dispatch } = alsAufseher()
    fireEvent.click(seite(container).querySelector('.plan-auto-btn--primary')!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'fsAutoAssign', onlyGroup: 'g1' })
  })

  it('auch ein stehengebliebener „edit"-Reiter führt ihn nicht in die Bearbeitung', () => {
    // Er kann ihn nicht wählen — aber der Zustand könnte von vorher stammen.
    const { container } = alsAufseher({ tab: 'edit' })
    expect(seite(container).querySelector('.woche-anlass')).toBeNull()
  })
})

describe('Die Bearbeiten-Ansicht (T64)', () => {
  it('zeigt Anlass und beide Zusammenkünfte statt des Programms', () => {
    const { container } = zeige({ tab: 'edit' })
    expect(seite(container).querySelector('.woche-anlass')).toBeTruthy()
    expect(seite(container).querySelectorAll('.sonder')).toHaveLength(2)
    expect(seite(container).querySelector('.plan-item')).toBeNull()
  })

  it('der Planer kommt über den Reiter hin', () => {
    const { container, dispatch } = zeige()
    const stift = [...seite(container).querySelectorAll('.plan-tabs .meeting-tab')].find(
      (b) => b.textContent === '✎',
    )!
    fireEvent.click(stift)
    expect(dispatch).toHaveBeenCalledWith({ type: 'setTab', tab: 'edit' })
  })
})

describe('Der Treffpunkt-Reiter', () => {
  it('zeigt den Treffpunkt-Plan ohne Gruppen-Einschränkung', () => {
    const { container, dispatch } = zeige({ tab: 'fs' })
    expect(seite(container).querySelector('.fs-add')).toBeTruthy()
    fireEvent.click(seite(container).querySelector('.plan-auto-btn--primary')!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'fsAutoAssign', onlyGroup: null })
  })

  it('und keine Programmabschnitte', () => {
    const { container } = zeige({ tab: 'fs' })
    expect(seite(container).querySelector('.plan-slots')).toBeNull()
  })
})

describe('Das Programm der Zusammenkunft', () => {
  it('jeder Abschnitt wird zu einem Panel', () => {
    const { container } = zeige()
    const labels = [...seite(container).querySelectorAll('.panel-label')].map((x) => x.textContent)
    expect(labels).toContain('SCHÄTZE AUS GOTTES WORT')
    expect(labels).toContain('UNS IM DIENST VERBESSERN')
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

  it('der Hilfsdienst-Block steht darunter und öffnet seinen Platz', () => {
    const { container, dispatch } = zeige()
    const chips = [...seite(container).querySelectorAll('.plan-helper-row .slot-chip')]
    expect(chips).toHaveLength(2) // zwei Mikrofon-Plätze
    fireEvent.click(chips[1]!)
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
  it('auch wenn er inzwischen keine Treffpunkte mehr leiten darf', () => {
    // Ohne ihn in der Auswahl zeigte das Feld „Besucher wählen" — als gäbe es keinen.
    const { container } = zeige({
      tab: 'fs',
      fsBereich: 'gruppenbesuche',
      gruppenbesuche: [{ id: 'b1', woche: '2099-01-05', grp: 'g1', pid: AUFSEHER.id }],
    })
    const feld = container.querySelector<HTMLSelectElement>('.gb-besucher-zeile select')!
    expect(feld.value).toBe(AUFSEHER.id)
    // Als Vorgabe für neue Besuche gilt er dagegen nicht.
    expect(container.querySelector<HTMLSelectElement>('.gb-besucher select')!.value).toBe('')
  })
})
