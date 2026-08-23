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
import { initialState } from '../app/init'
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
 * - Der **Gruppenaufseher** sieht keine Reiter und keine Zusammenkunft — nur
 *   die Treffpunkte seiner Gruppe. Bekäme er die Reiterleiste, käme er auf
 *   einen Plan, den er nicht ändern darf.
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
const GRUPPEN: Group[] = [{ id: 'g1', name: 'Gruppe 1', ov: 'p-ov', as: null }]
const DIENSTE: Service[] = [{ key: 'mik', name: 'Mikrofone', count: 2, groups: false }]

function abschnitte(): Section[] {
  const schueler: PartItem = {
    num: 4, title: 'Gespräche beginnen', meta: '3 Min.',
    names: [{ name: '', bereichsKey: 'schulung' }],
  }
  return [
    { label: 'SCHÄTZE AUS GOTTES WORT', farbe: 'petrol', items: [{ num: 1, title: 'Schätze', meta: '', names: [{ name: '' }] }] },
    { label: 'UNS IM DIENST VERBESSERN', farbe: 'gold', items: [schueler] },
  ]
}

function woche(over: Partial<Week> = {}): Week {
  return {
    range: '7.–13. September', book: 'JEREMIA 32', start: '2026-09-07', current: false,
    mid: { date: '', end: '20:45', sections: abschnitte(), helpers: { mik: [] } },
    we: { date: '', end: '11:45', sections: [], helpers: { mik: [] } },
    ...over,
  }
}

function zeige(over: Partial<AppState> = {}) {
  const dispatch = vi.fn()
  const state: AppState = {
    ...initialState(),
    screen: 'planen', tab: 'mid', dataStatus: 'ready',
    congregationId: 'c1', userId: 'u1', personId: PLANER.id, planner: true,
    persons: [PLANER, AUFSEHER], groups: GRUPPEN, services: DIENSTE, absences: [],
    weeks: [woche()], fsWeeks: [[]], fsRules: [], week: 0, pendingIds: [],
    fsBase: new Date(2026, 8, 7, 12, 0),
    congregation: { name: 'Nordheim', hall: 'Saal', meetings: 'Di 19:00 · So 10:00' },
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

/** Nur die mittlere (aktuelle) Seite des Streifens — die Nachbarn zeigen dasselbe. */
const seite = (c: HTMLElement): HTMLElement =>
  (c.querySelector('.week-page:not(.week-page--vor):not(.week-page--nach)') as HTMLElement) ?? c
const reiter = (c: HTMLElement) =>
  [...seite(c).querySelectorAll('.plan-tabs .meeting-tab')].map((b) => b.textContent ?? '')

afterEach(cleanup)

describe('Der Kopf', () => {
  it('zählt die offenen Zuteilungen der gewählten Zusammenkunft', () => {
    // 2 Programmplätze + 2 Mikrofone
    const { container } = zeige()
    expect(seite(container).querySelector('.screen-head-note')?.textContent).toBe(
      '4 offene Zuteilungen',
    )
  })

  it('eine ausgefallene Zusammenkunft hat nichts offen (T30)', () => {
    const { container } = zeige({ weeks: [woche({ dev: { mid: { cancelled: true } } })] })
    expect(seite(container).querySelector('.screen-head-note')?.textContent).toBe(
      '0 offene Zuteilungen',
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
  it('der Planer bekommt vier: beide Zusammenkünfte, Treffpunkte, Bearbeiten', () => {
    const { container } = zeige()
    expect(reiter(container)).toEqual(['Dienstag', 'Sonntag', t.tabFs, '✎'])
  })

  it('ein Reiterwechsel schlägt durch', () => {
    const { container, dispatch } = zeige()
    fireEvent.click([...seite(container).querySelectorAll('.plan-tabs .meeting-tab')][3]!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'setTab', tab: 'edit' })
  })

  it('eine verlegte Zusammenkunft trägt ihren echten Tag im Reiter (T30)', () => {
    const { container } = zeige({ weeks: [woche({ dev: { mid: { day: 'Donnerstag' } } })] })
    expect(reiter(container)[0]).toBe('Donnerstag')
  })
})

describe('Der Gruppenaufseher sieht nur seine Treffpunkte', () => {
  const alsAufseher = (over: Partial<AppState> = {}) =>
    zeige({ planner: false, personId: AUFSEHER.id, ...over })

  it('ohne Reiterleiste — er käme sonst auf einen Plan, den er nicht ändern darf', () => {
    const { container } = alsAufseher()
    expect(seite(container).querySelector('.plan-tabs')).toBeNull()
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
    expect(() => zeige({ weeks: [{ ...kanonisch, alt: { en: kurz } }], lang: 'en', congLang: 'Englisch' }))
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
