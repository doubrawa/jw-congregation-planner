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
import { besuchsWocheText } from '../components/gruppenbesuch-anzeige'
import { fsSetLeader, genFsWeek } from '../data/fs'
import { besuchVorschlag } from '../data/gruppenbesuche'
import { tagNach } from '../data/meeting-dates'
import { dict } from '../i18n/ui'
import { fill } from '../i18n/useT'
import type { FsInstance, Gruppenbesuch } from '../data/types'
import { PlanenScreen } from './PlanenScreen'

/**
 * **Gruppenbesuche beim Planen — bedient, nicht nur angezeigt** (T120, Phase 2;
 * T121, Entwurf `GGruppenbesuchePlanen`).
 *
 * Die Besuche stehen als Zeilen in einer Karte; ein Tipp öffnet das Blatt des
 * Besuchs, „Besuch hinzufügen" das zum Anlegen — vorbelegt, ohne Automatik
 * (13.10.2026). Die Regeln dahinter prüfen `data/gruppenbesuche.test.ts` und
 * `app/gruppenbesuche-reducer.test.ts`; hier geht es darum, dass die Knöpfe sie
 * auslösen und die Sätze an der richtigen Stelle stehen.
 */

const t = dict('de')
const demo = demoZustand()
const KENN = demo.weeks.map((w) => w.start)
/** Woche 1 der Testdaten und eine Gruppe, die sich dort trifft. */
const W1 = KENN[1]!
const GRP = demo.fsWeeks[1]!.find((i) => i.grp)!.grp!
const MANFRED = demo.persons.find((p) => p.id === 'p1')! // darf Treffpunkte leiten
const THOMAS = demo.persons.find((p) => p.id === 'p2')!
const ANDERE = demo.groups.find((g) => g.id !== GRP)!

/** Die Treffpunkte der Gruppe in Woche 1 mit diesem Leiter (leer: ohne). */
function leiterInW1(name: string, pid?: string): FsInstance[][] {
  let fsWeeks = demo.fsWeeks
  for (const inst of demo.fsWeeks[1]!.filter((i) => i.grp === GRP)) fsWeeks = fsSetLeader(fsWeeks, 1, inst.id, name, pid)
  return fsWeeks
}

const besuch = (woche: string, pid: string | null = MANFRED.id, id = `b-${woche}`): Gruppenbesuch => ({ id, woche, grp: GRP, pid })
/** Manfred besucht in Woche 1 und leitet dort schon. */
const EINGETRAGEN: Partial<AppState> = { gruppenbesuche: [besuch(W1)], fsWeeks: leiterInW1('Manfred Albrecht', MANFRED.id) }

function zeige(over: Partial<AppState> = {}) {
  const dispatch = vi.fn()
  const state: AppState = {
    ...demo,
    screen: 'planen',
    tab: 'fs',
    fsBereich: 'gruppenbesuche',
    planner: true,
    dataStatus: 'ready',
    congregationId: 'c1',
    userId: 'u1',
    absences: [],
    confirmations: {},
    gruppenbesuche: [],
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

const zeilen = (c: Element) => [...c.querySelectorAll<HTMLElement>('.gb-zeile')]
const zeile = (c: Element) => zeilen(c)[0]!
const probleme = (el: Element) => [...el.querySelectorAll('.gb-problem')].map((p) => p.textContent)
const blatt = () => document.querySelector<HTMLElement>('[role="dialog"]')
const knopf = (el: Element, text: string) => [...el.querySelectorAll('button')].find((b) => b.textContent === text)
/** Das Feld eines Blatts, an seiner Marke gefunden. */
const feld = (marke: string) =>
  ([...(blatt()?.querySelectorAll('.blatt-feld') ?? [])]
    .find((f) => f.querySelector('.feld-marke')?.textContent === marke)
    ?.querySelector('select') as HTMLSelectElement | null | undefined) ?? null
const oeffne = (c: Element) => fireEvent.click(zeile(c))
const neu = (c: Element) => fireEvent.click(c.querySelector('.gb-neu')!)

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 8, 7, 9, 0)) // Montag, 7. September 2026
  window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('Die Besuche als Zeilen (T121, `GGruppenbesuchePlanen`)', () => {
  it('Woche, Tag und Uhrzeit des Treffpunkts — rechts die Gruppe', () => {
    const { container } = zeige(EINGETRAGEN)
    expect(zeile(container).querySelector('.gb-zeile-woche')?.textContent).toBe(besuchsWocheText(W1, 'de'))
    const treffpunkt = demo.fsWeeks[1]!.find((i) => i.grp === GRP)!
    expect(zeile(container).textContent).toContain(treffpunkt.time)
    expect(zeile(container).querySelector('.gb-gruppe-pille')?.textContent).toBe(
      demo.groups.find((g) => g.id === GRP)!.name,
    )
  })

  it('ohne Besuche sagt die Karte es', () => {
    const { container } = zeige()
    expect(container.querySelector('.gb-leer')?.textContent).toBe(t.gbLeer)
  })

  it('vorbei: nur noch die Zeile mit der Marke — zum Ändern gibt es nichts mehr', () => {
    const { container } = zeige({ gruppenbesuche: [besuch('2026-08-24')] })
    expect(zeile(container).tagName).toBe('DIV')
    expect(zeile(container).classList.contains('is-vorbei')).toBe(true)
    expect(zeile(container).textContent).toContain(t.gbVorbei)
  })

  it('vorgemerkt: Woche noch nicht geladen — Marke an der Zeile, der Hinweis im Blatt, kein Problem', () => {
    // Die erste Woche nach den geladenen, in der sich die Gruppe laut Grundplan trifft.
    const spaeter = Array.from({ length: 8 }, (_unused, i) => tagNach(KENN.at(-1)!, 7 * (i + 1))).find((w) =>
      genFsWeek(w, demo.fsRules).some((inst) => inst.grp === GRP),
    )!
    const { container } = zeige({ gruppenbesuche: [besuch(spaeter)] })
    expect(zeile(container).textContent).toContain(t.gbVorgemerkt)
    expect(probleme(zeile(container))).toEqual([])
    oeffne(container)
    expect(blatt()?.textContent).toContain(t.gbVorgemerktHint)
  })
})

describe('Was an einem Besuch nicht aufgeht — an der Zeile und im Blatt', () => {
  it('ein anderer Leiter: der Satz nennt ihn, „Übernehmen" trägt den Besucher ein', () => {
    const b = besuch(W1)
    const { container, dispatch } = zeige({ gruppenbesuche: [b], fsWeeks: leiterInW1('Thomas Lindner', THOMAS.id) })
    const satz = fill(t.gbAndererLeiter, { name: 'Thomas Lindner' })
    expect(probleme(zeile(container))).toEqual([satz])
    oeffne(container)
    expect(probleme(blatt()!)).toEqual([satz])
    fireEvent.click(knopf(blatt()!, t.gbUebernehmen)!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'besuchUebernehmen', id: b.id })
  })

  it('ein Treffpunkt ohne Leiter: „Eintragen" holt den Besucher dorthin', () => {
    const b = besuch(W1)
    const { container, dispatch } = zeige({ gruppenbesuche: [b], fsWeeks: leiterInW1('') })
    expect(probleme(zeile(container))).toEqual([t.gbOffen])
    oeffne(container)
    fireEvent.click(knopf(blatt()!, t.gbEintragen)!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'besuchUebernehmen', id: b.id })
  })

  it('eingetragen: kein Problem, kein Knopf zum Übernehmen', () => {
    const { container } = zeige(EINGETRAGEN)
    expect(probleme(zeile(container))).toEqual([])
    oeffne(container)
    expect(probleme(blatt()!)).toEqual([])
    expect(knopf(blatt()!, t.gbUebernehmen)).toBeUndefined()
    expect(knopf(blatt()!, t.gbEintragen)).toBeUndefined()
  })

  it('der Besucher ist in der Woche abwesend', () => {
    const urlaub = { id: 'a1', personId: MANFRED.id, userId: null, from: W1, to: tagNach(W1, 6), reason: '' }
    const { container } = zeige({ ...EINGETRAGEN, absences: [urlaub] })
    expect(probleme(zeile(container))).toEqual([fill(t.toastAbsentP, { name: 'Manfred Albrecht' })])
  })

  it('die Gruppe trifft sich in dieser Woche nicht (am ersten Samstag der Versammlungstreffpunkt)', () => {
    const ohne = KENN.find((_w, wi) => wi > 0 && !demo.fsWeeks[wi]!.some((i) => i.grp === GRP))!
    expect(ohne).toBeDefined()
    const { container } = zeige({ gruppenbesuche: [besuch(ohne)] })
    expect(probleme(zeile(container))).toEqual([t.gbKeinTreffpunkt])
    oeffne(container)
    expect(knopf(blatt()!, t.gbUebernehmen)).toBeUndefined()
  })

  it('ohne Besucher (Person gelöscht): „Besucher wählen" steht als Problem da — eintragen lässt sich nichts', () => {
    const { container } = zeige({ gruppenbesuche: [besuch(W1, null)], fsWeeks: leiterInW1('') })
    expect(probleme(zeile(container))).toContain(t.gbBesucherWaehlen)
    oeffne(container)
    expect(knopf(blatt()!, t.gbEintragen)).toBeUndefined()
  })
})

describe('Ein Besuch im Blatt — jede Änderung gilt gleich', () => {
  it('überschrieben mit seiner Woche, darunter die Gruppe', () => {
    const { container } = zeige(EINGETRAGEN)
    oeffne(container)
    expect(blatt()?.getAttribute('aria-label')).toBe(besuchsWocheText(W1, 'de'))
    expect(blatt()?.querySelector('.sheet-sub')?.textContent).toBe(demo.groups.find((g) => g.id === GRP)!.name)
  })

  it('Woche und Gruppe verlegen ihn — als „besuchAendern"', () => {
    const b = besuch(W1)
    const { container, dispatch } = zeige({ ...EINGETRAGEN, gruppenbesuche: [b] })
    oeffne(container)
    expect(feld(t.gbWoche)!.value).toBe(W1)
    expect(feld(t.gbGruppe)!.value).toBe(GRP)
    fireEvent.change(feld(t.gbWoche)!, { target: { value: KENN[2] } })
    expect(dispatch).toHaveBeenCalledWith({ type: 'besuchAendern', id: b.id, patch: { woche: KENN[2] } })
    fireEvent.change(feld(t.gbGruppe)!, { target: { value: ANDERE.id } })
    expect(dispatch).toHaveBeenCalledWith({ type: 'besuchAendern', id: b.id, patch: { grp: ANDERE.id } })
  })

  it('gesperrt ist, was es schon gibt: dieselbe Gruppe in einer Woche, dieselbe Woche für eine Gruppe', () => {
    const a = besuch(W1, MANFRED.id, 'b-a')
    const spaeter = besuch(KENN[3]!, MANFRED.id, 'b-s')
    const nachbar = { ...besuch(W1, MANFRED.id, 'b-n'), grp: ANDERE.id }
    const { container } = zeige({ gruppenbesuche: [a, nachbar, spaeter] })
    fireEvent.click(zeilen(container).find((z) => z.querySelector('.gb-gruppe-pille')?.textContent !== ANDERE.name)!)
    const woche = (w: string) => [...feld(t.gbWoche)!.options].find((o) => o.value === w)!
    expect(woche(KENN[3]!).disabled).toBe(true) // dort wird die Gruppe schon besucht
    expect(woche(KENN[2]!).disabled).toBe(false)
    const gruppe = (g: string) => [...feld(t.gbGruppe)!.options].find((o) => o.value === g)!
    expect(gruppe(ANDERE.id).disabled).toBe(true) // die andere Gruppe hat in W1 schon ihren Besuch
  })

  it('ein anderer Besucher — „Besucher wählen" allein ändert nichts', () => {
    const b = besuch(W1)
    const { container, dispatch } = zeige({ ...EINGETRAGEN, gruppenbesuche: [b] })
    oeffne(container)
    fireEvent.change(feld(t.gbBesucher)!, { target: { value: THOMAS.id } })
    expect(dispatch).toHaveBeenCalledWith({ type: 'besuchBesucher', id: b.id, pid: THOMAS.id })
    dispatch.mockClear()
    fireEvent.change(feld(t.gbBesucher)!, { target: { value: '' } })
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('Entfernen fragt erst nach — dann geht der Besuch und mit ihm das Blatt', () => {
    const b = besuch(W1)
    const { container, dispatch } = zeige({ ...EINGETRAGEN, gruppenbesuche: [b] })
    oeffne(container)
    const entfernen = blatt()!.querySelector<HTMLButtonElement>('.knopf-entfernen')!
    fireEvent.click(entfernen)
    expect(dispatch).not.toHaveBeenCalledWith({ type: 'besuchEntfernen', id: b.id })
    expect(entfernen.textContent).toBe(t.loeschenSicher)
    fireEvent.click(entfernen)
    expect(dispatch).toHaveBeenCalledWith({ type: 'besuchEntfernen', id: b.id })
    expect(blatt()).toBeNull()
  })
})

describe('„Besuch hinzufügen" — vorbelegt, erst „Hinzufügen" legt an (13.10.2026)', () => {
  const hinzufuegen = () => knopf(blatt()!, t.hinzufuegenKnopf)!

  it('vorbelegt mit Gruppe, Woche und Besucher des Vorschlags', () => {
    const { container, dispatch } = zeige(EINGETRAGEN)
    neu(container)
    const v = besuchVorschlag([besuch(W1)], demo.groups, KENN[0]!)
    expect(feld(t.gbWoche)!.value).toBe(v.woche)
    expect(feld(t.gbGruppe)!.value).toBe(v.grp)
    expect(feld(t.gbBesucher)!.value).toBe(MANFRED.id)
    expect(dispatch.mock.calls.some((c) => c[0].type === 'besuchHinzufuegen')).toBe(false)
    fireEvent.click(hinzufuegen())
    expect(dispatch).toHaveBeenCalledWith({ type: 'besuchHinzufuegen', woche: v.woche, grp: v.grp, pid: MANFRED.id })
    expect(blatt()).toBeNull()
  })

  it('ohne Besucher gesperrt — mit ihm geht der Besuch hinaus, wie eingestellt', () => {
    const { container, dispatch } = zeige()
    neu(container)
    expect(hinzufuegen().disabled).toBe(true)
    fireEvent.change(feld(t.gbWoche)!, { target: { value: W1 } })
    fireEvent.change(feld(t.gbGruppe)!, { target: { value: GRP } })
    fireEvent.change(feld(t.gbBesucher)!, { target: { value: MANFRED.id } })
    expect(hinzufuegen().disabled).toBe(false)
    fireEvent.click(hinzufuegen())
    expect(dispatch).toHaveBeenCalledWith({ type: 'besuchHinzufuegen', woche: W1, grp: GRP, pid: MANFRED.id })
  })

  it('wer keine Treffpunkte mehr leiten darf, wird nicht vorgeschlagen', () => {
    const ohneRecht = demo.persons.map((p) =>
      p.id === MANFRED.id ? { ...p, priv: { ...p.priv, treffpunkt: false } } : p,
    )
    const { container } = zeige({ ...EINGETRAGEN, persons: ohneRecht })
    neu(container)
    expect(feld(t.gbBesucher)!.value).toBe('')
    expect(hinzufuegen().disabled).toBe(true)
  })

  it('was auch nach dem Anlegen nicht aufginge, steht vorher da — etwa: die Gruppe trifft sich nicht', () => {
    const ohne = KENN.find((_w, wi) => wi > 0 && !demo.fsWeeks[wi]!.some((i) => i.grp === GRP))!
    const { container } = zeige()
    neu(container)
    fireEvent.change(feld(t.gbWoche)!, { target: { value: ohne } })
    fireEvent.change(feld(t.gbGruppe)!, { target: { value: GRP } })
    expect(probleme(blatt()!)).toEqual([t.gbKeinTreffpunkt])
  })

  it('ein freier Treffpunkt ist kein Problem — er füllt sich beim Anlegen; ein fehlender Besucher sperrt nur den Knopf', () => {
    const { container } = zeige({ fsWeeks: leiterInW1('') })
    neu(container)
    fireEvent.change(feld(t.gbWoche)!, { target: { value: W1 } })
    fireEvent.change(feld(t.gbGruppe)!, { target: { value: GRP } })
    expect(feld(t.gbBesucher)!.value).toBe('')
    expect(probleme(blatt()!)).toEqual([])
  })

  it('eine Gruppe, die in der Woche schon besucht wird, ist gesperrt', () => {
    const { container } = zeige(EINGETRAGEN)
    neu(container)
    fireEvent.change(feld(t.gbWoche)!, { target: { value: W1 } })
    expect([...feld(t.gbGruppe)!.options].find((o) => o.value === GRP)!.disabled).toBe(true)
  })

  it('„Abbrechen" legt nichts an', () => {
    const { container, dispatch } = zeige(EINGETRAGEN)
    neu(container)
    fireEvent.click(knopf(blatt()!, t.abbrechen)!)
    expect(dispatch.mock.calls.some((c) => c[0].type === 'besuchHinzufuegen')).toBe(false)
    expect(blatt()).toBeNull()
  })
})

/**
 * **Der Planer wechselt den Besucher, plant aber keine Besuche** (Rechte-Stufe
 * „Planer", 4.10.2026 — einer der vier Grenzfälle des Betreibers). Anlegen,
 * Verlegen und Streichen ist der Plan; die Datenbank lässt den Planer nur den
 * Besucher ändern (`gruppenbesuche_pruefen`).
 */
describe('Der Planer bei den Gruppenbesuchen (4.10.2026)', () => {
  const alsPlaner = (over: Partial<AppState> = {}) => zeige({ planner: false, zuteiler: true, ...over })

  it('sieht die Besuche und wechselt im Blatt den Besucher', () => {
    const { container, dispatch } = alsPlaner({ gruppenbesuche: [besuch(W1)] })
    oeffne(container)
    expect(feld(t.gbBesucher)!.value).toBe(MANFRED.id)
    fireEvent.change(feld(t.gbBesucher)!, { target: { value: THOMAS.id } })
    expect(dispatch).toHaveBeenCalledWith({ type: 'besuchBesucher', id: `b-${W1}`, pid: THOMAS.id })
  })

  it('kein Hinzufügen, kein Verlegen, kein Entfernen', () => {
    const { container } = alsPlaner({ gruppenbesuche: [besuch(W1)] })
    expect(container.querySelector('.gb-neu')).toBeNull()
    oeffne(container)
    expect(feld(t.gbWoche)).toBeNull()
    expect(feld(t.gbGruppe)).toBeNull()
    expect(blatt()!.querySelector('.knopf-entfernen')).toBeNull()
  })
})
