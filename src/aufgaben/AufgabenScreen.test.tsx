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
import type { MyTask, Person, S89Payload, SubstituteReq, TrolleyTermin } from '../data/types'
import { AufgabenScreen } from './AufgabenScreen'

/**
 * **„Meine Aufgaben" — der Bildschirm, den ein Verkündiger benutzt.**
 *
 * Er trägt zwei Dinge, und beide haben eine Regel, die man nicht sieht:
 *
 * - Die **Aufgaben** (T121): die nächste groß, die übrigen je eine Zeile mit
 *   einem Haken zum Bestätigen — und „Alle bestätigen" für alles Offene.
 * - **Einspringen**: offene Ersatzgesuche. Entscheidend ist, dass „was ich an
 *   dem Tag schon habe" **vor** dem Zusagen dasteht — es stand früher hinterher
 *   im Toast, und das ist die falsche Reihenfolge.
 *
 * Die eigenen Abwesenheiten stehen seit T121 im Profil
 * (`components/abwesenheiten.test.ts`).
 */

const t = dict('de')

const ICH: Person = {
  id: 'p-a', fn: 'Anton', ln: 'Alt', role: 'verkuendiger', female: false,
  tel: '', mail: '', priv: emptyQualifications(),
}

const S89: S89Payload = {
  name: 'Anton Alt', partner: '', date: 'Di, 8. September · 19:00',
  type: 'Bibellesung', point: 'lmd Lektion 1',
}

const task = (over: Partial<MyTask> = {}): MyTask => ({
  id: 'T1', title: 'Bibellesung', rolle: '', date: 'Di, 8. September · ca. 19:35',
  at: null, status: 'offen', s89: null, ...over,
})

const gesuch = (over: Partial<SubstituteReq> = {}): SubstituteReq => ({
  key: '2026-09-07|mid|helper|mik|0', svc: 'mik', title: 'Mikrofone',
  date: 'Di, 8. September · 19:00', declinedBy: 'Bernd Brand', schonHeute: [], ...over,
})

function zeige(over: Partial<AppState> = {}) {
  const dispatch = vi.fn()
  const state: AppState = {
    ...demoZustand(),
    screen: 'aufgaben', dataStatus: 'ready',
    congregationId: 'c1', userId: 'u1', personId: 'p-a', planner: false,
    persons: [ICH], services: [], groups: [], absences: [],
    weeks: [], fsWeeks: [], myTasks: [], substituteReqs: [], notifs: [],
    congregation: { name: 'Nordheim', hall: 'Saal', times: { mid: { wd: 2, time: '19:00' }, we: { wd: 0, time: '10:00' } } },
    ...over,
  }
  function Buehne() {
    const store = useStaticStore(state)
    return (
      <AppDispatchContext.Provider value={dispatch}>
        <AppStoreContext.Provider value={store}>
          <AppStateContext.Provider value={state}>
            <AufgabenScreen />
          </AppStateContext.Provider>
        </AppStoreContext.Provider>
      </AppDispatchContext.Provider>
    )
  }
  return { dispatch, ...render(<Buehne />) }
}

const zeilen = (c: HTMLElement) => [...c.querySelectorAll('.aufgaben-liste .aufgaben-zeile')]
const knopf = (root: Element | null, text: string) =>
  [...(root?.querySelectorAll('button') ?? [])].find((b) => b.textContent === text)

/** Der Kalendertag in `n` Tagen als UTC-Mitternacht — die Form von `MyTask.at`. */
const inTagen = (n: number): number => {
  const h = new Date()
  return Date.UTC(h.getFullYear(), h.getMonth(), h.getDate() + n)
}

afterEach(cleanup)

describe('Kopf', () => {
  it('nennt den Bildschirm und wie viel noch auf Zusage wartet', () => {
    const { container } = zeige({ myTasks: [task(), task({ id: 'T2' }), task({ id: 'T3', status: 'bestätigt' })] })
    expect(container.querySelector('h1')?.textContent).toBe(t.navAufgabenLong)
    expect(container.querySelector('.aufgaben-zusage')?.textContent).toContain(`${t.dashZuBest}: 2`)
  })

  it('„Alle bestätigen" sagt alles Offene auf einmal zu', () => {
    const { container, dispatch } = zeige({ myTasks: [task(), task({ id: 'T2' })] })
    fireEvent.click(knopf(container.querySelector('.aufgaben-zusage'), t.alleBestaetigen)!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'confirmAll' })
  })

  it('bei nur einer offenen Aufgabe kein „Alle" — und ohne offene nichts davon', () => {
    expect(knopf(zeige({ myTasks: [task()] }).container, t.alleBestaetigen)).toBeUndefined()
    cleanup()
    expect(zeige({ myTasks: [task({ status: 'bestätigt' })] }).container.querySelector('.aufgaben-zusage')).toBeNull()
  })
})

describe('Die Aufgaben: die nächste groß, die übrigen je eine Zeile', () => {
  it('ohne Aufgaben steht der ruhige Satz', () => {
    const { container } = zeige()
    expect(container.querySelector('.aufgaben-leer')?.textContent).toBe(t.dashKeineAufgabe)
    expect(zeilen(container)).toHaveLength(0)
  })

  it('die erste steht in der großen Karte, die übrigen darunter — mit Bezeichnung und Termin', () => {
    const { container } = zeige({ myTasks: [task(), task({ id: 'T2', title: 'Vorsitz', at: inTagen(1) })] })
    expect(container.querySelector('.aufgabe-karte .aufgabe-titel')?.textContent).toBe('Bibellesung')
    expect(zeilen(container)).toHaveLength(1)
    expect(zeilen(container)[0]!.querySelector('.aufgaben-zeile-titel')?.textContent).toBe('Vorsitz')
    // Der Abstand in Worten vorn, dann der Termin — aus dem echten Kalendertag.
    expect(zeilen(container)[0]!.querySelector('.klein-text')?.textContent).toMatch(/^Morgen · .*8\. September/)
  })

  it('ein Tipp auf die Zeile öffnet das Blatt zu genau dieser Aufgabe', () => {
    const { container, dispatch } = zeige({ myTasks: [task({ id: 'T1' }), task({ id: 'T2' })] })
    fireEvent.click(zeilen(container)[0]!.querySelector('.aufgaben-zeile-text')!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'openMyTask', id: 'T2' })
  })

  it('offen: der Haken bestätigt — und sagt dem Vorleseprogramm, welche Aufgabe', () => {
    const { container, dispatch } = zeige({ myTasks: [task({ id: 'T1' }), task({ id: 'T2', title: 'Vorsitz' })] })
    const haken = zeilen(container)[0]!.querySelector('.knopf-haken')!
    expect(haken.getAttribute('aria-label')).toBe(`Vorsitz: ${t.bestaetigen}`)
    fireEvent.click(haken)
    expect(dispatch).toHaveBeenCalledWith({ type: 'confirmTask', id: 'T2' })
  })

  it('bestätigt und verhindert: kein Haken, der Punkt sagt den Stand', () => {
    const { container } = zeige({
      myTasks: [task(), task({ id: 'T2', status: 'bestätigt' }), task({ id: 'T3', status: 'verhindert' })],
    })
    const [best, verh] = zeilen(container)
    expect(best!.querySelector('.knopf-haken')).toBeNull()
    expect(best!.querySelector('.punkt.is-voll')).not.toBeNull()
    expect(verh!.querySelector('.knopf-haken')).toBeNull()
    expect(verh!.querySelector('.punkt.is-problem')).not.toBeNull()
  })

  it('das S-89 steht an der großen Karte, wo es eines gibt', () => {
    const { container, dispatch } = zeige({ myTasks: [task({ id: 'T1', s89: S89 })] })
    fireEvent.click(knopf(container.querySelector('.aufgabe-karte'), 'S-89')!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'openS89', payload: S89 })
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
    expect(zeile.querySelector('.klein-text')?.textContent).toContain('8. September')
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
    expect(k.querySelector('h2')?.textContent).toBe(t.freiePlaetzeTitle)
    expect(k.querySelector('.aufgaben-angebote > .klein-text')?.textContent).toBe(t.freiePlaetzeHint)
    const titel = [...k.querySelectorAll('.angebot-titel')].map((e) => e.textContent)
    expect(titel).toEqual(['Gebet', 'Platzhalter-Thema'])
    expect(k.querySelector('.angebot-text .klein-text')?.textContent).toContain('8. September')
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
 * **Trolley** (T121, Phase 7, Entwurf `GAufgaben`): die eigenen Trolley-Termine
 * für sich — wer sich eingetragen hat, hat sich verabredet; einen Haken zum
 * Bestätigen gibt es nicht. Ein Tipp führt zu den Trolleys.
 */
describe('Trolley', () => {
  const tag = (n: number) => new Date(inTagen(n)).toISOString().slice(0, 10)
  const JONAS: Person = { ...ICH, id: 'p-j', fn: 'Jonas', ln: 'Berger' }
  const termin = (over: Partial<TrolleyTermin> = {}): TrolleyTermin => ({
    id: 'r1', trolleyId: 'tr3', datum: tag(5), von: '09:00', bis: '11:00', pid: 'p-j', partner: 'p-a', gemeinsam: true, ...over,
  })
  const mit = (termine: TrolleyTermin[]) =>
    zeige({ persons: [ICH, JONAS], trolleys: [{ id: 'tr3', name: 'Trolley 3', ort: '', hinweis: '' }], trolleyTermine: termine })
  const bereich = (c: HTMLElement) => c.querySelector('[data-bereich="trolley"]')

  it('ohne eigene kommende Termine steht der Bereich nicht da — fremde und vergangene zählen nicht', () => {
    const { container } = mit([termin({ partner: null }), termin({ id: 'alt', datum: tag(-2), pid: 'p-a', partner: null })])
    expect(bereich(container)).toBeNull()
  })

  it('je Termin: Trolley und mit wem, darunter Tag und Zeit — verabredet, ohne Zusage, ohne Haken', () => {
    const { container } = mit([termin(), termin({ id: 'r2', datum: tag(7), pid: 'p-a', partner: null, gemeinsam: false })])
    const b = bereich(container)!
    expect(b.querySelector('h2')?.textContent).toBe(t.privZeugnis)
    expect([...b.querySelectorAll('.aufgaben-zeile-titel')].map((e) => e.textContent)).toEqual([
      'Trolley 3 · mit Jonas Berger',
      `Trolley 3 · ${t.trolleyPartnerGesucht}`,
    ])
    expect(b.querySelector('.aufgaben-zeile .klein-text')?.textContent).toMatch(/ · 09:00–11:00 · verabredet, ohne Zusage$/)
    expect(b.querySelector('.knopf-haken')).toBeNull()
  })

  it('ein Tipp führt zu den Trolleys', () => {
    const { container, dispatch } = mit([termin()])
    fireEvent.click(bereich(container)!.querySelector('.aufgaben-zeile-text')!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'setFsBereich', bereich: 'trolleys' })
    expect(dispatch).toHaveBeenCalledWith({ type: 'navigate', screen: 'programm', thema: 'predigtdienst' })
  })
})

/**
 * **Ein Klick auf „Ersatz gesucht" landet beim Einspringen, nicht oben** (T109).
 *
 * Eine eigene Seite dafür hat der Betreiber verworfen — sie wäre fast immer
 * leer. Stattdessen springt „Meine Aufgaben" zum Bereich, wenn die Navigation
 * ihn vorgemerkt hat (`sprungZiel`). Der Haken: Beim Push-Klick kommen die Daten
 * still hinterher, das Gesuch steht also womöglich erst nach dem Nachladen da.
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
              <AufgabenScreen />
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
    screen: 'aufgaben', dataStatus: 'ready',
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
    // Wer „Meine Aufgaben" selbst öffnet, liest von oben. Ein Gesuch, das beim
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
