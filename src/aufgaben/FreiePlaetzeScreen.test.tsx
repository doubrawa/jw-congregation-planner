/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import {
  AppDispatchContext,
  AppStateContext,
  AppStoreContext,
  type AppAction,
  type AppState,
  useStaticStore,
} from '../app/context'
import { demoZustand } from '../../tests/testdaten/demo-start'
import { emptyQualifications } from '../data/helpers'
import { bibelbuecherLaden, makeTr } from '../i18n/translate'
import { dict } from '../i18n/ui'
import { zahlBinden } from '../i18n/zahl-binden'
import type { Person, SubstituteReq } from '../data/types'
import { FreiePlaetzeScreen } from './FreiePlaetzeScreen'

/**
 * **„Freie Plätze" — was man übernehmen kann** (T134, Betreiber 24.10.2026):
 * ein eigener Menüpunkt unter „Meine Aufgaben". Getauscht wird oft, bisher über
 * eine WhatsApp-Gruppe — in der App soll man schneller sehen, was gesucht wird.
 *
 * - **Einspringen**: offene Ersatzgesuche. Entscheidend ist, dass „was ich an
 *   dem Tag schon habe" **vor** dem Zusagen dasteht — es stand früher hinterher
 *   im Toast, und das ist die falsche Reihenfolge.
 * - **Noch niemand eingeteilt**: freie Plätze gesendeter Wochen.
 *
 * Bis zum 24.10.2026 standen beide unten auf „Meine Aufgaben"
 * (`AufgabenScreen.test.tsx` prüft, dass sie dort fort sind).
 */

const t = dict('de')

const ICH: Person = {
  id: 'p-a', fn: 'Anton', ln: 'Alt', role: 'verkuendiger', female: false,
  tel: '', mail: '', priv: emptyQualifications(),
}

const gesuch = (over: Partial<SubstituteReq> = {}): SubstituteReq => ({
  key: '2026-09-07|mid|helper|mik|0', svc: 'mik', title: 'Mikrofone',
  date: 'Di, 8. September · 19:00', declinedBy: 'Bernd Brand', schonHeute: [], ...over,
})

function zeige(over: Partial<AppState> = {}) {
  const dispatch = vi.fn()
  const state: AppState = {
    ...demoZustand(),
    screen: 'freie', dataStatus: 'ready',
    congregationId: 'c1', userId: 'u1', personId: 'p-a', planner: false,
    persons: [ICH], services: [], groups: [], absences: [],
    weeks: [], fsWeeks: [], myTasks: [], substituteReqs: [], offenePlaetze: [], notifs: [],
    congregation: { name: 'Nordheim', hall: 'Saal', times: { mid: { wd: 2, time: '19:00' }, we: { wd: 0, time: '10:00' } } },
    ...over,
  }
  function Buehne() {
    const store = useStaticStore(state)
    return (
      <AppDispatchContext.Provider value={dispatch}>
        <AppStoreContext.Provider value={store}>
          <AppStateContext.Provider value={state}>
            <FreiePlaetzeScreen />
          </AppStateContext.Provider>
        </AppStoreContext.Provider>
      </AppDispatchContext.Provider>
    )
  }
  return { dispatch, ...render(<Buehne />) }
}

const knopf = (root: Element | null, text: string) =>
  [...(root?.querySelectorAll('button') ?? [])].find((b) => b.textContent === text)

afterEach(cleanup)

describe('Die Seite', () => {
  it('heißt „Freie Plätze"', () => {
    expect(zeige().container.querySelector('h1')?.textContent).toBe(t.freiePlaetzeTitle)
  })

  it('ohne Gesuch und ohne freien Platz sagt sie das — statt leer dazustehen', () => {
    const { container } = zeige()
    expect(container.querySelector('.aufgaben-leer')?.textContent).toBe(t.freiePlaetzeLeer)
    expect(container.querySelector('.aufgaben-abschnitt')).toBeNull()
  })

  it('mit einem Gesuch steht der Satz nicht da', () => {
    expect(zeige({ substituteReqs: [gesuch()] }).container.querySelector('.aufgaben-leer')).toBeNull()
  })
})

describe('Einspringen', () => {
  const bereich = (c: HTMLElement) => c.querySelector('[data-bereich="einspringen"]')

  it('ohne Gesuch steht der Bereich gar nicht da', () => {
    expect(bereich(zeige().container)).toBeNull()
  })

  it('ein Gesuch nennt Dienst, Termin und wer abgesagt hat', () => {
    const { container } = zeige({ substituteReqs: [gesuch()] })
    const zeile = bereich(container)!.querySelector('.aufgaben-angebot')!
    expect(zeile.querySelector('.angebot-titel')?.textContent).toBe('Mikrofone')
    expect(zeile.querySelector('.klein-text')?.textContent).toContain(zahlBinden('8. September'))
    expect(zeile.querySelector('.klein-text')?.textContent).toContain('Bernd Brand')
  })

  it('wer abgesagt hat, steht in fremder Oberfläche da, wie er heißt — kein Bibelbuch', async () => {
    // Bis zum 15.10.2026 lief der Name durch den Übersetzer: Aus dem Zusatz
    // gegen Namensgleichheit wurde auf Englisch „Mark 2 Weber". Die
    // Buchtabellen kommen nachgeladen — ohne sie prüfte der Test nichts.
    await bibelbuecherLaden()
    expect(makeTr('en')('Markus 2 Weber')).toBe('Mark 2 Weber')
    const { container } = zeige({ lang: 'en', substituteReqs: [gesuch({ declinedBy: 'Markus 2 Weber' })] })
    expect(bereich(container)!.querySelector('.aufgaben-angebot .klein-text')?.textContent).toContain('Markus 2 Weber')
  })

  it('was ich an dem Tag schon habe, steht VOR dem Zusagen da', () => {
    // Früher kam der Hinweis hinterher im Toast — wer es vorher weiß, entscheidet anders.
    const { container } = zeige({
      substituteReqs: [gesuch({ schonHeute: [{ text: 'Vorsitz', lang: 'u' }] })],
    })
    const warnung = bereich(container)!.querySelector('.hinweis-schon')!
    expect(warnung.textContent).toContain(t.sheetSchonHeute)
    expect(warnung.textContent).toContain('Vorsitz')
  })

  it('habe ich an dem Tag nichts, steht auch kein Hinweis da', () => {
    const { container } = zeige({ substituteReqs: [gesuch({ schonHeute: [] })] })
    expect(container.querySelector('.hinweis-schon')).toBeNull()
  })

  it('„Übernehmen" sagt für genau diesen Platz zu', () => {
    const { container, dispatch } = zeige({ substituteReqs: [gesuch()] })
    fireEvent.click(knopf(bereich(container), t.uebernehmen)!)
    expect(dispatch).toHaveBeenCalledWith({
      type: 'takeSubstitute', key: '2026-09-07|mid|helper|mik|0',
    })
  })

  it('der Bereich erklärt, worum es geht — er erscheint unangekündigt', () => {
    const { container } = zeige({ substituteReqs: [gesuch()] })
    expect(bereich(container)!.querySelector('h2')?.textContent).toBe(t.einspringenTitle)
    expect(bereich(container)!.querySelector('.aufgaben-angebote > .klein-text')?.textContent).toBe(t.einspringenHint)
  })
})

/**
 * **Freie Plätze** (4.10.2026): unbesetzte Plätze gesendeter Wochen, für die
 * ich den Aufgabenbereich habe — gebaut wie das Einspringen, ein Tipp trägt
 * direkt ein. Welche Plätze es sind, entscheidet `offenePlaetze`
 * (`offene-plaetze.test.ts`); hier geht es um den Bereich.
 */
describe('Freie Plätze', () => {
  const frei = (over: Partial<AppState['offenePlaetze'][number]> = {}): AppState['offenePlaetze'][number] => ({
    key: '2026-09-07|mid|part|k1|0', title: '', rolle: 'Gebet',
    date: 'Dienstag, 8. September · 19:00', at: null, schonHeute: [], ...over,
  })
  const karte = (c: HTMLElement) => c.querySelector('[data-bereich="freie-plaetze"]')

  it('ohne freie Plätze steht der Bereich gar nicht da', () => {
    expect(karte(zeige().container)).toBeNull()
  })

  it('ein Platz nennt Aufgabe und Termin, der Bereich erklärt die Regel', () => {
    const { container } = zeige({ offenePlaetze: [frei(), frei({ key: 'k2', title: 'Platzhalter-Thema', rolle: undefined })] })
    const k = karte(container)!
    expect(k.querySelector('h2')?.textContent).toBe(t.freiePlaetzeNochFrei)
    expect(k.querySelector('.aufgaben-angebote > .klein-text')?.textContent).toBe(t.freiePlaetzeHint)
    const titel = [...k.querySelectorAll('.angebot-titel')].map((e) => e.textContent)
    expect(titel).toEqual(['Gebet', 'Platzhalter-Thema'])
    expect(k.querySelector('.angebot-text .klein-text')?.textContent).toContain(zahlBinden('8. September'))
  })

  it('was ich an dem Tag schon habe, steht vor dem Übernehmen da', () => {
    const { container } = zeige({ offenePlaetze: [frei({ schonHeute: [{ text: 'Leiter', lang: 'u' }] })] })
    expect(karte(container)!.querySelector('.hinweis-schon')?.textContent).toContain('Leiter')
  })

  it('„Übernehmen" trägt mich in genau diesen Platz ein', () => {
    const { container, dispatch } = zeige({ offenePlaetze: [frei()] })
    fireEvent.click(knopf(karte(container), t.uebernehmen)!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'platzUebernehmen', key: '2026-09-07|mid|part|k1|0' })
  })

  it('steht unter dem Einspringen — ein Gesuch drängt mehr als ein freier Platz', () => {
    const { container } = zeige({ substituteReqs: [gesuch()], offenePlaetze: [frei()] })
    const bereiche = [...container.querySelectorAll('.aufgaben-abschnitt')]
    expect(bereiche).toHaveLength(2)
    expect(bereiche[1]).toBe(karte(container))
  })
})

/**
 * **Ein Klick auf „Ersatz gesucht" landet beim Einspringen, nicht oben** (T109).
 *
 * Seit T134 auf „Freie Plätze" (vorher unten auf „Meine Aufgaben"): Die Seite
 * springt zum Bereich, wenn die Navigation ihn vorgemerkt hat (`sprungZiel`).
 * Der Haken: Beim Push-Klick kommen die Daten still hinterher, das Gesuch steht
 * also womöglich erst nach dem Nachladen da.
 */
describe('Der Sprung aus „Ersatz gesucht"', () => {
  let gescrollt: Element[] = []
  const vorher = Element.prototype.scrollIntoView
  beforeEach(() => {
    gescrollt = []
    // jsdom rechnet kein Layout und kennt scrollIntoView nicht.
    Element.prototype.scrollIntoView = function (this: Element) {
      gescrollt.push(this)
    }
  })
  afterEach(() => {
    Element.prototype.scrollIntoView = vorher
  })

  /** Bühne, die einen neuen Zustand annimmt — wie nach dem stillen Nachladen. */
  function buehne(state: AppState, dispatch: (action: AppAction) => void) {
    function Buehne({ s }: { s: AppState }) {
      const store = useStaticStore(s)
      return (
        <AppDispatchContext.Provider value={dispatch}>
          <AppStoreContext.Provider value={store}>
            <AppStateContext.Provider value={s}>
              <FreiePlaetzeScreen />
            </AppStateContext.Provider>
          </AppStoreContext.Provider>
        </AppDispatchContext.Provider>
      )
    }
    const r = render(<Buehne s={state} />)
    return { ...r, neu: (s: AppState) => r.rerender(<Buehne s={s} />) }
  }

  const basis = (over: Partial<AppState>): AppState => ({
    ...demoZustand(),
    screen: 'freie', dataStatus: 'ready',
    congregationId: 'c1', userId: 'u1', personId: 'p-a', planner: false,
    persons: [ICH], services: [], groups: [], absences: [],
    weeks: [], fsWeeks: [], myTasks: [], substituteReqs: [], notifs: [],
    ...over,
  })
  const BEREICH = '[data-bereich="einspringen"]'

  it('steht das Gesuch schon da, springt die Seite hin und meldet sich zurück', () => {
    const dispatch = vi.fn()
    const { container } = buehne(basis({ sprungZiel: 'einspringen', substituteReqs: [gesuch()] }), dispatch)
    expect(gescrollt).toEqual([container.querySelector(BEREICH)])
    expect(dispatch).toHaveBeenCalledWith({ type: 'sprungZielErreicht' })
  })

  it('die Überschrift bekommt den Fokus — ein Screenreader liest dort weiter, nicht oben', () => {
    const { container } = buehne(basis({ sprungZiel: 'einspringen', substituteReqs: [gesuch()] }), vi.fn())
    const ueberschrift = container.querySelector<HTMLElement>(`${BEREICH} h2`)!
    expect(document.activeElement).toBe(ueberschrift)
    // Fokussierbar für den Sprung, aber nicht in der Tab-Reihenfolge.
    expect(ueberschrift.tabIndex).toBe(-1)
  })

  it('kommt das Gesuch erst mit dem Nachladen, wird gesprungen, sobald es steht', () => {
    const dispatch = vi.fn()
    const { container, neu } = buehne(basis({ sprungZiel: 'einspringen', substituteReqs: [] }), dispatch)
    // Noch nichts da: nicht springen, das Ziel aber auch nicht aufgeben.
    expect(gescrollt).toEqual([])
    expect(dispatch).not.toHaveBeenCalledWith({ type: 'sprungZielErreicht' })

    neu(basis({ sprungZiel: 'einspringen', substituteReqs: [gesuch()] }))
    expect(gescrollt).toEqual([container.querySelector(BEREICH)])
    expect(dispatch).toHaveBeenCalledWith({ type: 'sprungZielErreicht' })
  })

  it('ohne vorgemerkten Sprung verschiebt ein Gesuch die Seite nicht', () => {
    // Wer „Freie Plätze" selbst öffnet, liest von oben. Ein Gesuch, das beim
    // Nachladen hinzukommt, darf ihm die Seite nicht unter den Augen wegziehen.
    const dispatch = vi.fn()
    const { neu } = buehne(basis({ sprungZiel: null, substituteReqs: [] }), dispatch)
    neu(basis({ sprungZiel: null, substituteReqs: [gesuch()] }))
    expect(gescrollt).toEqual([])
    expect(document.activeElement).toBe(document.body)
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('nach dem Sprung wird nicht noch einmal gesprungen', () => {
    const dispatch = vi.fn()
    const { neu } = buehne(basis({ sprungZiel: 'einspringen', substituteReqs: [gesuch()] }), dispatch)
    // Der Reducer hat das Ziel abgeräumt; ein zweites Gesuch kommt hinzu.
    neu(basis({ sprungZiel: null, substituteReqs: [gesuch(), gesuch({ key: '2026-09-07|we|helper|mik|0' })] }))
    expect(gescrollt).toHaveLength(1)
  })
})
