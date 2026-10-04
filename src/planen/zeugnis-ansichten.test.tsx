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
import { ozKurzTag } from '../components/zeugnis-anzeige'
import { emptyQualifications } from '../data/helpers'
import { dict } from '../i18n/ui'
import { fill } from '../i18n/useT'
import { ProgrammScreen } from '../programm/ProgrammScreen'
import type { OzEintrag, OzTermin, Person } from '../data/types'
import { PlanenScreen } from './PlanenScreen'
import { wochentagNameAusWd } from './wochentage'

/**
 * **Öffentliches Zeugnisgeben an der Oberfläche** (T120, Phase 3): wer den
 * Reiter sieht, was der Planer einstellt und was ein Verkündiger tun kann.
 * Die Regeln dahinter prüfen `data/zeugnis.test.ts` und
 * `app/zeugnis-reducer.test.ts`; hier geht es darum, dass die Knöpfe sie
 * auslösen und nur dort stehen, wo sie gelten.
 */

const t = dict('de')

const person = (id: string, fn: string, zeugnis: boolean): Person => ({
  id,
  fn,
  ln: 'Test',
  role: 'verkuendiger',
  female: false,
  tel: '',
  mail: '',
  priv: { ...emptyQualifications(), zeugnis },
})
const SIMON = person('p-s', 'Simon', true)
const ANNA = person('p-a', 'Anna', true)
const OTTO = person('p-o', 'Otto', false)

const MITTWOCH: OzTermin = { id: 't1', wd: 3, von: '10:00', bis: '12:00', ort: 'Marktplatz', plaetze: 2 }
const eintrag = (pid: string, selbst = false, datum = '2026-09-09'): OzEintrag => ({
  id: `e-${pid}-${datum}`,
  terminId: 't1',
  datum,
  pid,
  selbst,
})

function zeige(Screen: () => React.JSX.Element, over: Partial<AppState> = {}) {
  const dispatch = vi.fn()
  const state: AppState = {
    ...demoZustand(),
    tab: 'fs',
    fsBereich: 'zeugnis',
    dataStatus: 'ready',
    congregationId: 'c1',
    userId: 'u1',
    personId: SIMON.id,
    planner: false,
    persons: [SIMON, ANNA, OTTO],
    absences: [],
    ozTermine: [MITTWOCH],
    ozEintraege: [],
    confirmations: {},
    sentLog: {},
    ...over,
  }
  function Buehne() {
    const store = useStaticStore(state)
    return (
      <AppDispatchContext.Provider value={dispatch}>
        <AppStoreContext.Provider value={store}>
          <AppStateContext.Provider value={state}>
            <Screen />
          </AppStateContext.Provider>
        </AppStoreContext.Provider>
      </AppDispatchContext.Provider>
    )
  }
  return { dispatch, ...render(<Buehne />) }
}

const knopf = (c: HTMLElement, text: string) =>
  [...c.querySelectorAll('button')].filter((b) => b.textContent === text)

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 8, 7, 9, 0))
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('Wer den Reiter sieht', () => {
  const reiter = (c: HTMLElement) => [...c.querySelectorAll('.plan-tabs .meeting-tab')].map((b) => b.textContent)

  it('beim Ansehen jeder, sobald es Termine gibt — ohne Termine fehlt er', () => {
    expect(reiter(zeige(ProgrammScreen, { screen: 'programm' }).container)).toContain(t.privZeugnis)
    cleanup()
    expect(reiter(zeige(ProgrammScreen, { screen: 'programm', ozTermine: [] }).container)).not.toContain(t.privZeugnis)
  })

  it('beim Planen nur der Planer', () => {
    expect(reiter(zeige(PlanenScreen, { screen: 'planen', planner: true }).container)).toContain(t.privZeugnis)
  })
})

describe('Ansehen: selbst eintragen, bestätigen, absagen', () => {
  it('wer den Aufgabenbereich hat, trägt sich mit einem Tipp ein', () => {
    const { container, dispatch } = zeige(ProgrammScreen, { screen: 'programm' })
    expect(container.textContent).toContain(t.ozAnsichtHint)
    const eintragen = knopf(container, t.ozEintragen)
    // Vier Wochen stehen offen da, je eine Schicht am Mittwoch.
    expect(eintragen).toHaveLength(4)
    fireEvent.click(eintragen[0]!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'ozEintragen', terminId: 't1', datum: '2026-09-09' })
  })

  it('ohne den Aufgabenbereich gibt es keinen Knopf, nur den Hinweis', () => {
    const { container } = zeige(ProgrammScreen, { screen: 'programm', personId: OTTO.id })
    expect(container.textContent).toContain(t.ozNichtFreigegeben)
    expect(knopf(container, t.ozEintragen)).toEqual([])
  })

  it('wer eingetragen ist, sieht sich, hat zugesagt — und kann absagen', () => {
    const e = eintrag(SIMON.id, true)
    const { container, dispatch } = zeige(ProgrammScreen, { screen: 'programm', ozEintraege: [e] })
    expect(container.textContent).toContain(t.ozDuEingetragen)
    expect(knopf(container, t.bestaetigen)).toEqual([])
    fireEvent.click(knopf(container, t.ozAbsagen)[0]!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'declineTask', id: `oz|2026-09-07|${e.id}` })
  })

  it('wer zugeteilt wurde, bestätigt hier wie unter „Meine Aufgaben"', () => {
    const e = eintrag(SIMON.id)
    const { container, dispatch } = zeige(ProgrammScreen, { screen: 'programm', ozEintraege: [e] })
    fireEvent.click(knopf(container, t.bestaetigen)[0]!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'confirmTask', id: `oz|2026-09-07|${e.id}` })
  })

  it('eine volle Schicht bietet nichts mehr an', () => {
    const { container } = zeige(ProgrammScreen, {
      screen: 'programm',
      ozEintraege: [eintrag(ANNA.id, true), eintrag(OTTO.id)],
      ozTermine: [{ ...MITTWOCH }],
    })
    // Die erste Woche ist voll, die drei folgenden nicht.
    expect(knopf(container, t.ozEintragen)).toHaveLength(3)
  })
})

describe('Planen: Termine, Zuteilen, Senden', () => {
  it('ein Termin lässt sich anlegen und ändern', () => {
    const { container, dispatch } = zeige(PlanenScreen, { screen: 'planen', planner: true })
    fireEvent.click(knopf(container, t.ozTerminAdd)[0]!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'ozTerminAdd' })
    const ort = container.querySelector(`input[aria-label="${t.fsOrtPh}"]`) as HTMLInputElement
    fireEvent.change(ort, { target: { value: 'Bahnhof' } })
    expect(dispatch).toHaveBeenCalledWith({ type: 'ozTerminUpdate', id: 't1', patch: { ort: 'Bahnhof' } })
  })

  it('freie Plätze bieten nur an, wer den Aufgabenbereich hat', () => {
    const { container, dispatch } = zeige(PlanenScreen, { screen: 'planen', planner: true })
    const wahl = container.querySelector('select.oz-zuteilen') as HTMLSelectElement
    const namen = [...wahl.options].map((o) => o.textContent)
    expect(namen).toEqual([t.zuteilenChip, 'Anna Test', 'Simon Test'])
    fireEvent.change(wahl, { target: { value: ANNA.id } })
    expect(dispatch).toHaveBeenCalledWith({ type: 'ozZuteilen', terminId: 't1', datum: '2026-09-09', pid: ANNA.id })
  })

  it('wer zugeteilt ist und noch nichts weiß, steht bei „Plan senden"', () => {
    const { container } = zeige(PlanenScreen, { screen: 'planen', planner: true, ozEintraege: [eintrag(ANNA.id)] })
    expect(container.textContent).toContain(fill(t.ozSendenOffen, { n: 1 }))
    expect(container.querySelector('.plan-senden-namen')?.textContent).toBe('Anna Test')
  })

  it('ohne Termine nur der Hinweis und der Knopf zum Anlegen', () => {
    const { container } = zeige(PlanenScreen, { screen: 'planen', planner: true, ozTermine: [] })
    expect(container.textContent).toContain(t.ozKeineTermine)
    expect(container.querySelector('.plan-auto')).toBeNull()
  })
})

/*
 * **Ein anderer Wochentag fragt nach, wenn dabei Einträge gehen** (3.10.2026).
 * Die kommenden stünden an einem Tag, an dem der Termin nicht mehr stattfindet;
 * wer zugesagt hatte, bekommt „Zuteilung zurückgezogen", und Zurückstellen holt
 * nichts zurück. Unter Windows genügte dafür eine Pfeiltaste auf dem Feld.
 */
describe('Planen: Wochentag eines Termins ändern', () => {
  const tagFeld = (c: HTMLElement) => c.querySelector(`select[aria-label="${t.a11yWeekday}"]`) as HTMLSelectElement
  const planen = (ozEintraege: OzEintrag[]) => zeige(PlanenScreen, { screen: 'planen', planner: true, ozEintraege })

  it('mit kommenden Einträgen: erst die Rückfrage mit Tag und Zahl, dann „Verlegen"', () => {
    const { container, dispatch } = planen([eintrag(ANNA.id), eintrag(SIMON.id, true, '2026-09-16')])
    fireEvent.change(tagFeld(container), { target: { value: '4' } })
    expect(dispatch).not.toHaveBeenCalled()
    expect(container.querySelector('.oz-rueckfrage')?.textContent).toContain(
      fill(t.ozTagWechselFrage, { tag: wochentagNameAusWd(4, 'de'), n: 2 }),
    )
    // Das Feld zeigt die Wahl schon — gilt aber erst mit dem Knopf.
    expect(tagFeld(container).value).toBe('4')
    fireEvent.click(knopf(container, t.ozTagWechseln)[0]!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'ozTerminUpdate', id: 't1', patch: { wd: 4 } })
    expect(container.querySelector('.oz-rueckfrage')).toBeNull()
  })

  it('„Abbrechen" lässt alles, wie es war', () => {
    const { container, dispatch } = planen([eintrag(ANNA.id)])
    fireEvent.change(tagFeld(container), { target: { value: '4' } })
    fireEvent.click(knopf(container, t.abbrechen)[0]!)
    expect(dispatch).not.toHaveBeenCalled()
    expect(container.querySelector('.oz-rueckfrage')).toBeNull()
    expect(tagFeld(container).value).toBe('3')
  })

  it('zurück auf den alten Tag gewählt: keine Rückfrage, nichts geändert', () => {
    const { container, dispatch } = planen([eintrag(ANNA.id)])
    fireEvent.change(tagFeld(container), { target: { value: '4' } })
    fireEvent.change(tagFeld(container), { target: { value: '3' } })
    expect(container.querySelector('.oz-rueckfrage')).toBeNull()
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('ohne kommende Einträge ändert sich der Tag sofort', () => {
    const { container, dispatch } = planen([])
    fireEvent.change(tagFeld(container), { target: { value: '4' } })
    expect(dispatch).toHaveBeenCalledWith({ type: 'ozTerminUpdate', id: 't1', patch: { wd: 4 } })
    expect(container.querySelector('.oz-rueckfrage')).toBeNull()
  })

  it('ein Eintrag von heute zählt nicht — er bleibt, also fragt nichts', () => {
    vi.setSystemTime(new Date(2026, 8, 9, 7, 0)) // Mittwoch früh, die Schicht ist heute
    const { container, dispatch } = planen([eintrag(ANNA.id)])
    fireEvent.change(tagFeld(container), { target: { value: '4' } })
    expect(dispatch).toHaveBeenCalledWith({ type: 'ozTerminUpdate', id: 't1', patch: { wd: 4 } })
  })
})

/*
 * **Die übrige Bedienung beim Planen** (3.10.2026): automatisch besetzen und
 * leeren, weitere Wochen, Plätze und Zeiten, einen Termin streichen, einen
 * Eintrag austragen — und was bei Vergangenem und Abwesenden dasteht. Bis
 * hierher lief davon nichts in einem Test.
 */
describe('Planen: die übrige Bedienung', () => {
  const planen = (over: Partial<AppState> = {}) => zeige(PlanenScreen, { screen: 'planen', planner: true, ...over })
  const schichten = (c: HTMLElement) => [...c.querySelectorAll<HTMLElement>('.oz-schicht')]
  const wahlIn = (schicht: HTMLElement) =>
    [...(schicht.querySelector<HTMLSelectElement>('select.oz-zuteilen')?.options ?? [])].map((o) => o.textContent).slice(1)

  it('„Automatisch" besetzt — „Leeren" erst beim zweiten Tipp', () => {
    const { container, dispatch } = planen()
    fireEvent.click(knopf(container, t.autoZuteilen)[0]!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'ozAutoAssign' })
    dispatch.mockClear()
    fireEvent.click(knopf(container, t.leeren)[0]!)
    expect(dispatch).not.toHaveBeenCalled()
    fireEvent.click(knopf(container, t.leerenSicher)[0]!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'ozLeeren' })
  })

  it('zuerst vier Wochen — „Weitere Wochen" zeigt das Vierteljahr, die freien Plätze zählen mit', () => {
    const { container } = planen()
    expect(schichten(container)).toHaveLength(4)
    expect(container.querySelectorAll('.plan-open-row')).toHaveLength(4)
    fireEvent.click(knopf(container, t.ozMehrWochen)[0]!)
    expect(schichten(container)).toHaveLength(13)
    expect(container.querySelectorAll('.plan-open-row')).toHaveLength(13)
    expect(knopf(container, t.ozMehrWochen)).toEqual([])
  })

  it('Plätze und Zeiten eines Termins', () => {
    const { container, dispatch } = planen()
    fireEvent.change(container.querySelector(`select[aria-label="${fill(t.ozPlaetze, { n: 2 })}"]`)!, { target: { value: '3' } })
    expect(dispatch).toHaveBeenCalledWith({ type: 'ozTerminUpdate', id: 't1', patch: { plaetze: 3 } })
    fireEvent.change(container.querySelector(`select[aria-label="${t.von}"]`)!, { target: { value: '14:00' } })
    expect(dispatch).toHaveBeenCalledWith({ type: 'ozTerminUpdate', id: 't1', patch: { von: '14:00' } })
    fireEvent.change(container.querySelector(`select[aria-label="${t.bis}"]`)!, { target: { value: '16:00' } })
    expect(dispatch).toHaveBeenCalledWith({ type: 'ozTerminUpdate', id: 't1', patch: { bis: '16:00' } })
  })

  it('ein Termin lässt sich löschen — erst nach der Rückfrage, denn mit ihm gehen alle Einträge', () => {
    const { container, dispatch } = planen()
    fireEvent.click(container.querySelector('.fsr-row .fs-remove')!)
    expect(dispatch).not.toHaveBeenCalledWith({ type: 'ozTerminRemove', id: 't1' })
    expect(container.querySelector('.fsr-row .fs-remove')?.textContent).toBe(t.loeschenSicher)
    fireEvent.click(container.querySelector('.fsr-row .fs-remove')!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'ozTerminRemove', id: 't1' })
  })

  it('ein Eintrag lässt sich austragen — erst nach der Rückfrage', () => {
    const e = eintrag(ANNA.id)
    const { container, dispatch } = planen({ ozEintraege: [e] })
    fireEvent.click(container.querySelector('.oz-person .oz-raus')!)
    expect(dispatch).not.toHaveBeenCalledWith({ type: 'ozAustragen', id: e.id })
    expect(container.querySelector('.oz-person .oz-raus')?.textContent).toBe(t.entfernenSicher)
    fireEvent.click(container.querySelector('.oz-person .oz-raus')!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'ozAustragen', id: e.id })
  })

  it('eine vergangene Schicht: kein Austragen, kein freier Platz — die nächste geht weiter', () => {
    vi.setSystemTime(new Date(2026, 8, 10, 9, 0)) // Donnerstag: der Mittwoch dieser Woche ist um
    const { container } = planen({ ozEintraege: [eintrag(ANNA.id)] })
    const [vorbei, naechste] = schichten(container)
    expect(vorbei!.classList.contains('is-vorbei')).toBe(true)
    expect(vorbei!.querySelector('.oz-person')?.textContent).toContain('Anna Test')
    expect(vorbei!.querySelector('.oz-raus')).toBeNull()
    expect(vorbei!.querySelector('select.oz-zuteilen')).toBeNull()
    expect(naechste!.classList.contains('is-vorbei')).toBe(false)
    expect(naechste!.querySelectorAll('select.oz-zuteilen')).toHaveLength(2)
  })

  it('wer an dem Tag abwesend ist: im Konflikt-Banner und mit dem Punkt am Namen', () => {
    const urlaub = { id: 'a1', personId: ANNA.id, userId: null, from: '2026-09-09', to: '2026-09-09', reason: '' }
    const { container } = planen({ ozEintraege: [eintrag(ANNA.id)], absences: [urlaub] })
    expect(container.querySelector('.plan-conflicts .plan-conflict-text')?.textContent).toBe(
      [ozKurzTag('2026-09-09', 'de'), 'Marktplatz', fill(t.ozAbwesend, { name: 'Anna Test' })].join(' · '),
    )
    expect(schichten(container)[0]!.querySelector('.oz-person .slot-konflikt-dot')).not.toBeNull()
  })

  it('zur Wahl steht nicht, wer schon in der Schicht steht oder an dem Tag abwesend ist', () => {
    const urlaub = { id: 'a1', personId: ANNA.id, userId: null, from: '2026-09-16', to: '2026-09-16', reason: '' }
    const { container } = planen({ ozEintraege: [eintrag(SIMON.id)], absences: [urlaub] })
    const [mittwoch9, mittwoch16, mittwoch23] = schichten(container)
    expect(wahlIn(mittwoch9!)).toEqual(['Anna Test']) // Simon steht schon drin
    expect(wahlIn(mittwoch16!)).toEqual(['Simon Test']) // Anna ist abwesend
    expect(wahlIn(mittwoch23!)).toEqual(['Anna Test', 'Simon Test'])
  })
})

/**
 * **Eine Schicht streichen** (4.10.2026): „Es kann ja sein, dass mal eine
 * Woche nichts stattfindet." Das ✕ fragt nach; die gestrichene Schicht bleibt
 * mit „Fällt aus" stehen — beim Planen mit „Wiederherstellen", beim Ansehen
 * ohne alles, damit niemand eine fehlende Woche für ein Versehen hält.
 */
describe('Eine Schicht streichen', () => {
  const planen = (over: Partial<AppState> = {}) => zeige(PlanenScreen, { screen: 'planen', planner: true, ...over })
  const schichten = (c: HTMLElement) => [...c.querySelectorAll<HTMLElement>('.oz-schicht')]
  const GESTRICHEN: OzTermin = { ...MITTWOCH, aus: ['2026-09-09'] }

  it('das ✕ fragt erst nach — ein Tipp daneben bricht ab, erst der zweite streicht', () => {
    const { container, dispatch } = planen()
    const x = () => schichten(container)[0]!.querySelector<HTMLButtonElement>('.oz-streichen')!
    expect(x().getAttribute('aria-label')).toBe(t.a11yRemove)
    fireEvent.click(x())
    expect(dispatch).not.toHaveBeenCalled()
    expect(x().textContent).toBe(t.loeschenSicher)
    fireEvent.blur(x())
    expect(x().textContent).toBe('✕')
    fireEvent.click(x())
    fireEvent.click(x())
    expect(dispatch).toHaveBeenCalledWith({ type: 'ozSchichtAus', terminId: 't1', datum: '2026-09-09', aus: true })
  })

  it('gestrichen: „Fällt aus" statt der Plätze, nicht im Banner — „Wiederherstellen" holt sie zurück', () => {
    const { container, dispatch } = planen({ ozTermine: [GESTRICHEN], ozEintraege: [eintrag(ANNA.id, false, '2026-09-09')] })
    const [aus, naechste] = schichten(container)
    expect(aus!.classList.contains('is-gestrichen')).toBe(true)
    expect(aus!.textContent).toContain(t.ozFaelltAus)
    // Ein übrig gebliebener Eintrag zeigt sich nicht — die Datenbank räumt ihn ab.
    expect(aus!.querySelector('.oz-person')).toBeNull()
    expect(aus!.querySelector('select.oz-zuteilen')).toBeNull()
    expect(aus!.querySelector('.oz-streichen')).toBeNull()
    // Freie Plätze nennt das Banner nur für die drei übrigen Wochen.
    expect(container.querySelectorAll('.plan-open-row')).toHaveLength(3)
    fireEvent.click(knopf(aus!, t.wiederherstellen)[0]!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'ozSchichtAus', terminId: 't1', datum: '2026-09-09', aus: false })
    expect(naechste!.querySelector('.oz-streichen')).not.toBeNull()
  })

  it('Vergangenes lässt sich weder streichen noch zurückholen', () => {
    vi.setSystemTime(new Date(2026, 8, 10, 9, 0)) // Donnerstag: der Mittwoch dieser Woche ist um
    const offen = planen()
    const [vorbei, naechste] = schichten(offen.container)
    expect(vorbei!.querySelector('.oz-streichen')).toBeNull()
    expect(naechste!.querySelector('.oz-streichen')).not.toBeNull()
    cleanup()
    const aus = schichten(planen({ ozTermine: [GESTRICHEN] }).container)[0]!
    expect(aus.textContent).toContain(t.ozFaelltAus)
    expect(knopf(aus, t.wiederherstellen)).toEqual([])
  })

  it('beim Ansehen steht „Fällt aus" — ohne Eintragen und ohne freie Plätze', () => {
    const { container } = zeige(ProgrammScreen, { screen: 'programm', ozTermine: [GESTRICHEN] })
    const [aus] = [...container.querySelectorAll<HTMLElement>('.oz-schicht')]
    expect(aus!.textContent).toContain(t.ozFaelltAus)
    expect(knopf(aus!, t.ozEintragen)).toEqual([])
    expect(aus!.querySelector('.oz-frei')).toBeNull()
    expect(knopf(aus!, t.wiederherstellen)).toEqual([])
    // Die übrigen drei Wochen bieten ihren Platz an.
    expect(knopf(container, t.ozEintragen)).toHaveLength(3)
  })
})

/**
 * **Der Planer besetzt die Schichten, ändert aber den Plan nicht** (Rechte-
 * Stufe „Planer", 4.10.2026). Die Termine sind der Plan; welche Schicht
 * ausfällt, steht an ihrem Termin (`oz_termine.aus`). Beides pflegt der Admin
 * — die Datenbank lässt den Planer dort gar nicht schreiben.
 */
describe('Der Planer im öffentlichen Zeugnisgeben (4.10.2026)', () => {
  const alsPlaner = (over: Partial<AppState> = {}) =>
    zeige(PlanenScreen, { screen: 'planen', planner: false, zuteiler: true, ...over })

  it('teilt zu, verteilt automatisch und sendet — wie der Admin', () => {
    const { container } = alsPlaner()
    expect(container.querySelectorAll('select.oz-zuteilen').length).toBeGreaterThan(0)
    expect(container.querySelector('.plan-auto-btn--primary')).not.toBeNull()
  })

  it('keine Termine anlegen oder ändern — und keine Schicht streichen oder zurückholen', () => {
    const { container } = alsPlaner({ ozTermine: [MITTWOCH, { ...MITTWOCH, id: 't2', aus: ['2026-09-16'] }] })
    expect(knopf(container, t.ozTerminAdd)).toEqual([])
    expect(container.querySelector('.oz-streichen')).toBeNull()
    expect(knopf(container, t.wiederherstellen)).toEqual([])
    // Gegenprobe beim Admin.
    cleanup()
    const admin = zeige(PlanenScreen, { screen: 'planen', planner: true })
    expect(knopf(admin.container, t.ozTerminAdd)).toHaveLength(1)
    expect(admin.container.querySelector('.oz-streichen')).not.toBeNull()
  })
})
