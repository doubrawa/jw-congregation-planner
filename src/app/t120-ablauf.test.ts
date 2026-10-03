/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * **T120 als Ablauf: echter Reducer, echtes persist, nur die Datenbank ist
 * nachgestellt.**
 *
 * Die Tests in `persist.test.ts` bauen Vorher und Nachher von Hand — sie
 * prüfen, was persist aus einem gegebenen Unterschied macht. Ob eine **echte
 * Folge von Handgriffen** die richtigen Zeilen in der richtigen Reihenfolge
 * schreibt, fragten sie nie: Termin anlegen, Ort tippen, automatisch besetzen,
 * abmelden. Genau dort lag der Befund vom 3.10.2026 — der getippte Ort schrieb
 * jeden Termin der Versammlung mit, auch die, die ein anderer Planer
 * inzwischen gestrichen hatte.
 *
 * Ersetzt ist **jede** Funktion der Datenschicht, die schreibt oder sendet
 * (am Namen erkannt) — eine neue fiele nicht durch, sondern liefe ins Leere.
 */

vi.mock('../lib/supabase', () => ({ supabase: {} }))
vi.mock('../lib/data', async (importActual) => {
  const echt = await importActual<typeof import('../lib/data')>()
  return Object.fromEntries(
    Object.entries(echt).map(([name, wert]) => [
      name,
      typeof wert === 'function' && /^(save|delete|send|notify|mark|substitute|rename|swap)/.test(name) ? vi.fn() : wert,
    ]),
  )
})

import * as data from '../lib/data'
import { persist } from './persist'
import { reducer } from './reducer'
import type { AppAction, AppState } from './context'
import { demoZustand } from '../../tests/testdaten/demo-start'
import { DEMO_GROUPS } from '../../tests/testdaten/testdaten'
import { tagNach } from '../data/meeting-dates'
import { neuerPlan } from '../data/weitere-plaene'
import { OZ_DIENST } from '../../supabase/functions/_shared/zuteilungen.ts'
import type { OzTermin, WeitererPlan } from '../data/types'

/** Mit dem Aufgabenbereich „Öffentliches Zeugnisgeben": Manfred (p1) und Simon (p9). */
function start(over: Partial<AppState> = {}): AppState {
  const demo = demoZustand()
  return {
    ...demo,
    congregationId: 'c1',
    userId: 'u1',
    personId: null,
    persons: demo.persons.map((p) => (p.id === 'p1' || p.id === 'p9' ? { ...p, priv: { ...p.priv, zeugnis: true } } : p)),
    confirmations: {},
    notifs: [],
    ...over,
  }
}

/** Handgriffe wie in der App: Reducer, dann persist mit Vorher und Nachher. */
function ablauf(anfang: AppState) {
  let state = anfang
  return {
    get state() {
      return state
    },
    tue(action: AppAction): AppState {
      const next = reducer(state, action)
      persist(state, next, action)
      state = next
      return state
    },
    /** Ein Stand, der von außen kommt (Nachladen) — ohne Schreiben. */
    setze(patch: Partial<AppState>): void {
      state = { ...state, ...patch }
    },
  }
}

const MARKT: OzTermin = { id: 't1', wd: 3, von: '10:00', bis: '12:00', ort: 'Marktplatz', plaetze: 2 }
const reihenfolge = (fn: unknown, i = 0) => vi.mocked(fn as (...a: unknown[]) => void).mock.invocationCallOrder[i]

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 8, 7, 9, 0)) // Montag, 7.9.2026
})
afterEach(() => {
  vi.runOnlyPendingTimers() // ausstehende Bündel leeren (die Schreiber sind Modul-Singletons)
  vi.useRealTimers()
})

describe('Öffentliches Zeugnisgeben als Ablauf', () => {
  it('Termin anlegen → Ort tippen → automatisch besetzen → abmelden', () => {
    const a = ablauf(start())
    a.tue({ type: 'ozTerminAdd' })
    const id = a.state.ozTermine[0]!.id
    for (const ort of ['M', 'Ma', 'Markt']) a.tue({ type: 'ozTerminUpdate', id, patch: { ort } })
    // Getippt wird gebündelt — noch ist nichts hinaus.
    expect(data.saveOzTermine).not.toHaveBeenCalled()

    a.tue({ type: 'ozAutoAssign' })
    // Der Termin geht **vor** den Einträgen hinaus, die auf ihn zeigen — einmal,
    // in seiner neuesten Fassung.
    expect(data.saveOzTermine).toHaveBeenCalledTimes(1)
    expect(data.saveOzTermine).toHaveBeenCalledWith('c1', [expect.objectContaining({ id, ort: 'Markt' })], [])
    expect(data.saveOzEintraege).toHaveBeenCalledTimes(1)
    const [, neu, entfernt] = vi.mocked(data.saveOzEintraege).mock.calls[0]!
    expect(entfernt).toEqual([])
    expect(neu.length).toBeGreaterThan(0)
    expect(neu).toEqual(a.state.ozEintraege)
    expect(neu.every((e) => e.terminId === id && !e.selbst && ['p1', 'p9'].includes(e.pid))).toBe(true)
    expect(reihenfolge(data.saveOzTermine)).toBeLessThan(reihenfolge(data.saveOzEintraege)!)

    a.tue({ type: 'logout' })
    vi.runOnlyPendingTimers()
    // Nichts geht ein zweites Mal hinaus.
    expect(data.saveOzTermine).toHaveBeenCalledTimes(1)
    expect(data.saveOzEintraege).toHaveBeenCalledTimes(1)
  })

  it('einen Ort ändern, einen anderen Termin streichen: ein Schreiben, nur diese beiden', () => {
    // Der dritte Termin ist unberührt — ein zweiter Planer hat ihn womöglich
    // gerade geändert oder gestrichen. Bis zum 3.10.2026 ging er hier mit.
    const a = ablauf(start({ ozTermine: [MARKT, { ...MARKT, id: 't2', wd: 6 }, { ...MARKT, id: 't3', wd: 5 }] }))
    a.tue({ type: 'ozTerminUpdate', id: 't1', patch: { ort: 'Bahnhof' } })
    a.tue({ type: 'ozTerminRemove', id: 't2' })
    a.tue({ type: 'navigate', screen: 'start' })
    expect(data.saveOzTermine).toHaveBeenCalledTimes(1)
    expect(data.saveOzTermine).toHaveBeenCalledWith('c1', [expect.objectContaining({ id: 't1', ort: 'Bahnhof' })], ['t2'])
  })

  it('ein Verkündiger trägt sich ein und sagt wieder ab: Platz frei, die Planer erfahren es', () => {
    const a = ablauf(start({ planner: false, personId: 'p9', ozTermine: [MARKT] }))
    a.tue({ type: 'ozEintragen', terminId: 't1', datum: '2026-09-09' })
    const [, neu] = vi.mocked(data.saveOzEintraege).mock.calls[0]!
    expect(neu).toEqual([expect.objectContaining({ terminId: 't1', datum: '2026-09-09', pid: 'p9', selbst: true })])
    const key = `oz|2026-09-07|${neu[0]!.id}`
    // Wer sich einträgt, hat zugesagt — ohne eigene Zeile in `confirmations`.
    expect(a.state.myTasks.find((t) => t.id === key)?.status).toBe('bestätigt')
    expect(data.saveConfirmation).not.toHaveBeenCalled()

    a.tue({ type: 'declineTask', id: key })
    expect(data.saveOzEintraege).toHaveBeenLastCalledWith('c1', [], [neu[0]!.id])
    expect(data.notifyPlanners).toHaveBeenCalledWith(
      'verhindert',
      'Verhinderung gemeldet',
      expect.stringContaining(`${OZ_DIENST} · Mittwoch, 9. September · 10:00–12:00 · Marktplatz`),
    )
    // Die eigene Absage ist keine Wegnahme, und eine Verhinderung bleibt nicht stehen.
    expect(data.sendPlanEntzug).not.toHaveBeenCalled()
    expect(data.saveConfirmation).not.toHaveBeenCalled()
    expect(a.state.myTasks.some((t) => t.id === key)).toBe(false)
  })

  it('ein voller Platz nimmt niemanden mehr auf — weder selbst noch zugeteilt', () => {
    const a = ablauf(start({ planner: false, personId: 'p9', ozTermine: [{ ...MARKT, plaetze: 1 }] }))
    a.setze({ ozEintraege: [{ id: 'z1', terminId: 't1', datum: '2026-09-09', pid: 'p1', selbst: true }] })
    a.tue({ type: 'ozEintragen', terminId: 't1', datum: '2026-09-09' })
    expect(a.state.ozEintraege).toHaveLength(1)
    expect(data.saveOzEintraege).not.toHaveBeenCalled()
  })

  it('der Planer verlegt einen Termin: Kommendes geht, wer zugesagt hatte, erfährt den alten Tag', () => {
    const a = ablauf(start({ ozTermine: [MARKT] }))
    a.tue({ type: 'ozZuteilen', terminId: 't1', datum: '2026-09-09', pid: 'p1' })
    const id = a.state.ozEintraege[0]!.id
    const key = `oz|2026-09-07|${id}`
    // Manfred hat auf seinem Gerät bestätigt — hier kommt das mit dem Nachladen an.
    a.setze({ confirmations: { [key]: 'bestätigt' } })

    a.tue({ type: 'ozTerminUpdate', id: 't1', patch: { wd: 4 } })
    expect(a.state.ozEintraege).toEqual([])
    expect(data.saveOzEintraege).toHaveBeenLastCalledWith('c1', [], [id])
    expect(data.deleteConfirmationRows).toHaveBeenCalledWith('c1', [key])
    expect(data.sendPlanEntzug).toHaveBeenCalledWith([
      expect.objectContaining({ key, pid: 'p1', datum: 'Mittwoch, 9. September · 10:00–12:00 · Marktplatz' }),
    ])
  })
})

describe('Weitere Pläne als Ablauf', () => {
  it('Plan anlegen → Namen tippen → reihum verteilen → Zeitraum kürzen', () => {
    // Ein zweiter, veröffentlichter Plan, den hier niemand anfasst.
    const anderer: WeitererPlan = { id: 'p-alt', vorlage: 'saal', name: 'Fenster', von: '2026-09-07', bis: '2026-11-29', entwurf: false }
    const a = ablauf(start({ plaene: [anderer] }))
    const plan = neuerPlan('p-neu', 'saal', new Date())
    a.tue({ type: 'wpPlanAnlegen', plan })
    for (const name of ['W', 'Wi', 'Winter']) a.tue({ type: 'wpPlanAendern', id: 'p-neu', patch: { name } })
    expect(data.savePlaene).not.toHaveBeenCalled()

    a.tue({ type: 'wpGruppenVerteilen', planId: 'p-neu', abGruppe: DEMO_GROUPS[0]!.id })
    // Der Plan geht vor seinen Einträgen hinaus — einmal, mit Namen, ohne den anderen.
    expect(data.savePlaene).toHaveBeenCalledTimes(1)
    expect(data.savePlaene).toHaveBeenCalledWith('c1', [expect.objectContaining({ id: 'p-neu', name: 'Winter' })], [])
    const [, verteilt, nichtsWeg] = vi.mocked(data.savePlanEintraege).mock.calls[0]!
    expect(verteilt).toHaveLength(13)
    expect(nichtsWeg).toEqual([])
    expect(reihenfolge(data.savePlaene)).toBeLessThan(reihenfolge(data.savePlanEintraege)!)

    // Auf vier Wochen kürzen: Die neun Wochen danach gehen, die vier davor bleiben unberührt.
    const bis = tagNach(plan.von, 4 * 7 - 1)
    a.tue({ type: 'wpPlanAendern', id: 'p-neu', patch: { bis } })
    const [, geaendert, entfernt] = vi.mocked(data.savePlanEintraege).mock.calls[1]!
    expect(geaendert).toEqual([])
    expect(entfernt).toHaveLength(9)
    expect(a.state.planEintraege.filter((e) => e.planId === 'p-neu')).toHaveLength(4)
    // Das neue Ende ging vor dem Löschen hinaus — und wieder nur dieser Plan.
    expect(vi.mocked(data.savePlaene).mock.calls[1]).toEqual(['c1', [expect.objectContaining({ id: 'p-neu', bis })], []])
    expect(reihenfolge(data.savePlaene, 1)).toBeLessThan(reihenfolge(data.savePlanEintraege, 1)!)
  })

  it('erst getippt, dann gelöscht: der Plan geht nur als Löschung hinaus', () => {
    const a = ablauf(start())
    a.tue({ type: 'wpPlanAnlegen', plan: neuerPlan('p-neu', 'familien', new Date()) })
    a.tue({ type: 'wpPlanAendern', id: 'p-neu', patch: { name: 'Kreisaufseher' } })
    a.tue({ type: 'wpPlanLoeschen', id: 'p-neu' })
    a.tue({ type: 'navigate', screen: 'start' })
    // Geschrieben nach dem Löschen, stünde er wieder da.
    expect(data.savePlaene).toHaveBeenCalledTimes(1)
    expect(data.savePlaene).toHaveBeenCalledWith('c1', [], ['p-neu'])
  })
})
