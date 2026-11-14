/** @vitest-environment happy-dom */
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
import { emptyQualifications } from '../data/helpers'
import { dict } from '../i18n/ui'
import { fill } from '../i18n/useT'
import { zahlBinden } from '../i18n/zahl-binden'
import type { Person } from '../data/types'
import { AbwesenheitEintragen } from './AbwesenheitEintragen'
import { zeitraumTippen } from './kalender'

/**
 * **Eine Abwesenheit eintragen** (T121) — der eine Vorgang, den jeder
 * Verkündiger selbst ausführt, im Profil für sich und im Personen-Detail der
 * Planer für andere. Ein Blatt mit einem Zeitraum-Kalender.
 *
 * - **Ein Tag ist ein Tipp.** Der erste Tipp setzt Von und Bis auf denselben
 *   Tag; ein zweiter danach verlängert bis dorthin.
 * - **Von liegt nie nach Bis.** Ein Tipp vor „Von" beginnt den Zeitraum neu,
 *   statt ihn rückwärts aufzuspannen — sonst entstünde ein Zeitraum, den keine
 *   Prüfung je trifft.
 * - **Eintragen darf, wen es betrifft, oder ein Admin.** Dieselbe Grenze zieht
 *   die Datenbank (`absences_write`); stünde der Knopf anderen offen, schriebe
 *   er ins Leere und die Zeile verschwände beim nächsten Laden.
 */

const t = dict('de')

const ICH: Person = {
  id: 'p-a', fn: 'Anton', ln: 'Alt', role: 'verkuendiger', female: false,
  priv: emptyQualifications(),
}
const BERTA: Person = {
  id: 'p-b', fn: 'Berta', ln: 'Bein', role: 'verkuendiger', female: true,
  priv: emptyQualifications(),
}

function zeige(personId: string | null, over: Partial<AppState> = {}) {
  const dispatch = vi.fn()
  const state: AppState = {
    ...demoZustand(),
    dataStatus: 'ready', congregationId: 'c1', userId: 'u1', personId: 'p-a', admin: false,
    persons: [ICH], absences: [], weeks: [], fsWeeks: [],
    ...over,
  }
  function Buehne() {
    const store = useStaticStore(state)
    return (
      <AppDispatchContext.Provider value={dispatch}>
        <AppStoreContext.Provider value={store}>
          <AppStateContext.Provider value={state}>
            <AbwesenheitEintragen personId={personId} />
          </AppStateContext.Provider>
        </AppStoreContext.Provider>
      </AppDispatchContext.Provider>
    )
  }
  return { dispatch, ...render(<Buehne />) }
}

/** Das Blatt liegt per Portal am Ende des Dokuments, nicht im Container. */
const blatt = () => document.body.querySelector<HTMLElement>('.sheet')
const knopf = (root: ParentNode | null, text: string) =>
  [...(root?.querySelectorAll<HTMLButtonElement>('button') ?? [])].find((b) => b.textContent === text)
/** Einen Tag des angezeigten Monats antippen (nach seinem Namen für Vorleseprogramme; Zahl und Monat gebunden). */
const tippe = (name: string) => {
  const tag = [...document.body.querySelectorAll<HTMLButtonElement>('.kal-tag')].find((b) => b.getAttribute('aria-label') === zahlBinden(name))
  if (!tag) throw new Error(`Tag „${name}" nicht im Kalender`)
  fireEvent.click(tag)
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 15, 12, 0)) // Donnerstag, 15. Oktober 2026
  window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia
})
afterEach(() => {
  vi.useRealTimers()
  cleanup()
})

describe('Den Zeitraum wählen', () => {
  const leer = { von: '', bis: '', ende: 'von' as const }

  it('ein Tag ist ein Tipp: Von und Bis stehen auf demselben Tag', () => {
    expect(zeitraumTippen(leer, '2026-11-02')).toEqual({ von: '2026-11-02', bis: '2026-11-02', ende: 'bis' })
  })

  it('der zweite Tipp danach verlängert bis dorthin', () => {
    const erster = zeitraumTippen(leer, '2026-11-02')
    expect(zeitraumTippen(erster, '2026-11-06')).toEqual({ von: '2026-11-02', bis: '2026-11-06', ende: 'bis' })
  })

  it('ein Tipp vor „Von" beginnt neu — Von liegt nie nach Bis', () => {
    const stand = { von: '2026-11-02', bis: '2026-11-06', ende: 'bis' as const }
    expect(zeitraumTippen(stand, '2026-10-30')).toEqual({ von: '2026-10-30', bis: '2026-11-06', ende: 'bis' })
  })

  it('ist „Von" gewählt, verschiebt ein Tipp nach „Bis" beide Enden', () => {
    const stand = { von: '2026-11-02', bis: '2026-11-06', ende: 'von' as const }
    expect(zeitraumTippen(stand, '2026-11-09')).toEqual({ von: '2026-11-09', bis: '2026-11-09', ende: 'bis' })
  })
})

describe('Abwesenheit eintragen', () => {
  const oeffne = () => fireEvent.click(knopf(document.body, t.abwEintragen)!)

  it('der Knopf öffnet das Blatt mit dem Kalender', () => {
    zeige('p-a')
    expect(blatt()).toBeNull()
    oeffne()
    expect(blatt()?.querySelector('.kal')).not.toBeNull()
    expect(blatt()?.querySelector('.sheet-title')?.textContent).toBe(t.abwEintragen)
  })

  it('ohne Zeitraum wird nichts eingetragen, sondern nachgefragt', () => {
    const { dispatch } = zeige('p-a')
    oeffne()
    fireEvent.click(knopf(blatt(), t.abwEintragen)!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'showToast', text: t.toastVonBis })
    expect(dispatch.mock.calls.some((c) => c[0].type === 'addAbsence')).toBe(false)
    expect(blatt()).not.toBeNull()
  })

  it('ein vollständiger Zeitraum wird eingetragen — auf DIESE Person, mit Ersteller und Grund', () => {
    const { dispatch } = zeige('p-a')
    oeffne()
    tippe('Dienstag, 20. Oktober')
    tippe('Freitag, 23. Oktober')
    fireEvent.change(blatt()!.querySelector('input.feld')!, { target: { value: '  Urlaub ' } })
    fireEvent.click(knopf(blatt(), t.abwEintragen)!)
    expect(dispatch).toHaveBeenCalledWith({
      type: 'addAbsence',
      absence: expect.objectContaining({ personId: 'p-a', userId: 'u1', from: '2026-10-20', to: '2026-10-23', reason: 'Urlaub' }),
    })
    // Danach geht das Blatt zu.
    expect(blatt()).toBeNull()
  })

  it('der Planer trägt für eine ANDERE Person ein — sie ist die Betroffene, er der Ersteller', () => {
    const { dispatch } = zeige('p-b', { admin: true })
    oeffne()
    tippe('Montag, 19. Oktober')
    fireEvent.click(knopf(blatt(), t.abwEintragen)!)
    expect(dispatch).toHaveBeenCalledWith({
      type: 'addAbsence',
      absence: expect.objectContaining({ personId: 'p-b', userId: 'u1', from: '2026-10-19', to: '2026-10-19' }),
    })
  })

  it('für sich selbst spricht der Hinweis dich an und nennt keinen Namen', () => {
    zeige('p-a', { persons: [ICH, BERTA] })
    oeffne()
    expect(blatt()?.querySelector('.sheet-sub')).toBeNull()
    expect(blatt()?.querySelector('.abw-fuss .klein-text')?.textContent).toBe(`${t.abwHinweis} ${t.abwKonflikt}`)
  })

  it('für eine ANDERE Person nennt das Blatt sie — unter der Überschrift und im Hinweis, nicht „du"', () => {
    zeige('p-b', { admin: true, persons: [ICH, BERTA] })
    oeffne()
    expect(blatt()?.querySelector('.sheet-sub')?.textContent).toBe('Berta Bein')
    expect(blatt()?.querySelector('.abw-fuss .klein-text')?.textContent).toBe(
      `${fill(t.abwHinweisFuer, { name: 'Berta Bein' })} ${t.abwKonflikt}`,
    )
  })

  it('ein Admin ohne eigene Person trägt für andere ein — auch dann mit ihrem Namen', () => {
    zeige('p-b', { admin: true, personId: null, persons: [ICH, BERTA] })
    oeffne()
    expect(blatt()?.querySelector('.sheet-sub')?.textContent).toBe('Berta Bein')
  })

  it('ein Konto ohne eigene Person trägt ohne Person-Bezug ein', () => {
    const { dispatch } = zeige(null, { personId: null })
    oeffne()
    tippe('Dienstag, 20. Oktober')
    fireEvent.click(knopf(blatt(), t.abwEintragen)!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'addAbsence', absence: expect.objectContaining({ personId: null }) })
  })

  it('das Blatt blättert die Monate', () => {
    zeige('p-a')
    oeffne()
    expect(blatt()?.querySelector('.kal-monat')?.textContent).toBe('Oktober 2026')
    fireEvent.click(blatt()!.querySelector(`[aria-label="${t.a11yNextMonth}"]`)!)
    expect(blatt()?.querySelector('.kal-monat')?.textContent).toBe('November 2026')
  })
})

/**
 * **Was in die Zeit fällt** (T181, Betreiber: „klingt gut"): Die Aufgaben, die
 * im gewählten Zeitraum liegen, stehen im Blatt, jede mit Schalter.
 * Eingeschaltet sagt das Eintragen sie ab — für die eigene Person. Trägt der
 * Admin für jemand anderen ein, gibt es sie frei (Betreiber: „Plätze
 * freigeben").
 */
describe('Was in die Zeit fällt (T181)', () => {
  const oeffne = () => fireEvent.click(knopf(document.body, t.abwEintragen)!)
  const MIK_20 = '2026-10-19|mid|helper|mik|0'
  const aufgabe = (id: string, tag: number, status: 'offen' | 'bestätigt' | 'verhindert' = 'offen') => ({
    id, title: '', rolle: 'Mikrofone', date: `Dienstag, ${tag}. Oktober · 19:00`, at: Date.UTC(2026, 9, tag), status, s89: null,
  })
  const liste = () => [...(blatt()?.querySelectorAll('.abw-aufgaben .schalter-zeile') ?? [])]
  const eintragen = () => fireEvent.click(knopf(blatt(), t.abwEintragen)!)

  it('die eigenen Aufgaben im Zeitraum stehen da, eingeschaltet — die danach nicht', () => {
    zeige('p-a', { myTasks: [aufgabe(MIK_20, 20), aufgabe('2026-10-26|mid|helper|mik|0', 27)] })
    oeffne()
    expect(liste()).toHaveLength(0)
    tippe('Dienstag, 20. Oktober')
    expect(liste()).toHaveLength(1)
    expect(liste()[0]?.querySelector('[role="switch"]')?.getAttribute('aria-checked')).toBe('true')
    expect(blatt()?.querySelector('.abw-aufgaben > .klein-text')?.textContent).toBe(t.abwAbsagenHinweis)
  })

  it('Eintragen sagt sie ab — wie im Absage-Blatt — und trägt die Abwesenheit ein', () => {
    const { dispatch } = zeige('p-a', { myTasks: [aufgabe(MIK_20, 20)] })
    oeffne()
    tippe('Dienstag, 20. Oktober')
    eintragen()
    expect(dispatch).toHaveBeenCalledWith({ type: 'declineTask', ids: [MIK_20] })
    expect(dispatch).toHaveBeenCalledWith({ type: 'addAbsence', absence: expect.objectContaining({ personId: 'p-a', from: '2026-10-20' }) })
    expect(dispatch).toHaveBeenCalledWith({ type: 'showToast', text: fill(t.toastAbwAbgesagt, { n: 1 }) })
  })

  it('mehrere sagt es in einem Zug ab — wer plant, bekommt einen Push für alle, nicht je Aufgabe einen', () => {
    const MIK_27 = '2026-10-26|mid|helper|mik|0'
    const { dispatch } = zeige('p-a', { myTasks: [aufgabe(MIK_20, 20), aufgabe(MIK_27, 27)] })
    oeffne()
    tippe('Dienstag, 20. Oktober')
    tippe('Dienstag, 27. Oktober')
    eintragen()
    const absagen = dispatch.mock.calls.map((c) => c[0]).filter((a) => a.type === 'declineTask')
    expect(absagen).toEqual([{ type: 'declineTask', ids: [MIK_20, MIK_27] }])
    expect(dispatch).toHaveBeenCalledWith({ type: 'showToast', text: fill(t.toastAbwAbgesagt, { n: 2 }) })
  })

  /*
   * Offline weist die App jede schreibende Aktion ab und sagt es
   * (`store.tsx`). Eine Erfolgsmeldung danach — „Abgesagt: 1" — überdeckte
   * den Hinweis und behauptete, was nirgends angekommen ist.
   */
  it('offline sagt das Blatt nichts ab und meldet keinen Erfolg — nur, dass es nicht geht', () => {
    const { dispatch } = zeige('p-a', { myTasks: [aufgabe(MIK_20, 20)], staleAt: Date.UTC(2026, 9, 14) })
    oeffne()
    tippe('Dienstag, 20. Oktober')
    eintragen()
    expect(dispatch.mock.calls.map((c) => c[0])).toEqual([{ type: 'showToast', text: t.offlineReadOnly }])
    // Das Blatt bleibt offen, samt Zeitraum.
    expect(blatt()).not.toBeNull()
  })

  it('Gegenprobe: Ausgeschaltet bleibt sie, wie sie ist — die Abwesenheit kommt trotzdem', () => {
    const { dispatch } = zeige('p-a', { myTasks: [aufgabe(MIK_20, 20)] })
    oeffne()
    tippe('Dienstag, 20. Oktober')
    fireEvent.click(liste()[0]!.querySelector('[role="switch"]')!)
    eintragen()
    expect(dispatch.mock.calls.map((c) => c[0].type)).toEqual(['addAbsence'])
  })

  it('was schon abgesagt ist, kommt nicht noch einmal', () => {
    zeige('p-a', { myTasks: [aufgabe(MIK_20, 20, 'verhindert')] })
    oeffne()
    tippe('Dienstag, 20. Oktober')
    expect(blatt()?.querySelector('.abw-aufgaben')).toBeNull()
  })

  it('wer absagt, hat die Mitteilungen zur Aufgabe beantwortet', () => {
    const notif = { id: 'n1', type: 'zuteilung', title: '', text: '', time: '', read: false, taskId: MIK_20 }
    const { dispatch } = zeige('p-a', { myTasks: [aufgabe(MIK_20, 20)], notifs: [notif] as unknown as AppState['notifs'] })
    oeffne()
    tippe('Dienstag, 20. Oktober')
    eintragen()
    expect(dispatch).toHaveBeenCalledWith({ type: 'mitteilungGelesen', id: 'n1' })
  })

  it('für eine ANDERE Person gibt der Admin die Plätze frei, statt abzusagen', () => {
    const woche = {
      range: '', book: '', start: '2026-10-19',
      mid: { date: '', end: '', sections: [], helpers: { mik: [{ name: 'Berta Bein', pid: 'p-b' }] } },
      we: { date: '', end: '', sections: [], helpers: {} },
    }
    const { dispatch } = zeige('p-b', {
      admin: true, persons: [ICH, BERTA], weeks: [woche], fsWeeks: [[]], confirmations: {},
      services: [{ key: 'mik', name: 'Mikrofone', count: 1 }],
      congregation: { name: 'Probe', hall: '', times: { mid: { wd: 2, time: '19:00' }, we: { wd: 0, time: '10:00' } } },
    })
    oeffne()
    tippe('Dienstag, 20. Oktober')
    expect(liste()).toHaveLength(1)
    expect(blatt()?.querySelector('.abw-aufgaben > .klein-text')?.textContent).toBe(t.abwFreigebenHinweis)
    eintragen()
    expect(dispatch).toHaveBeenCalledWith({ type: 'plaetzeFreigeben', personId: 'p-b', keys: [MIK_20] })
    expect(dispatch.mock.calls.some((c) => c[0].type === 'declineTask')).toBe(false)
    expect(dispatch).toHaveBeenCalledWith({ type: 'showToast', text: fill(t.toastAbwFreigegeben, { n: 1 }) })
  })
})

describe('Wer eintragen darf', () => {
  it('die eigene Person', () => {
    expect(knopf(zeige('p-a').container, t.abwEintragen)).toBeDefined()
  })

  it('ein Admin bei jeder Person', () => {
    expect(knopf(zeige('p-b', { admin: true }).container, t.abwEintragen)).toBeDefined()
  })

  it('sonst niemand — kein Knopf, der ins Leere schriebe', () => {
    expect(knopf(zeige('p-b').container, t.abwEintragen)).toBeUndefined()
  })
})
