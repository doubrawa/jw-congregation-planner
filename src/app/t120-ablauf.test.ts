/** @vitest-environment happy-dom */
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
// Dieselbe Fabrik für jedes Modul der Datenschicht (`src/lib/daten/`); dass keins
// fehlt, prüft `datenschicht()` unten.
const { SCHREIBT, nachgestellt } = vi.hoisted(() => {
  const SCHREIBT = /^(save|delete|send|notify|mark|substitute|rename|swap)/
  const nachgestellt = (echt: Record<string, unknown>) =>
    Object.fromEntries(
      Object.entries(echt).map(([name, wert]) => [name, typeof wert === 'function' && SCHREIBT.test(name) ? vi.fn() : wert]),
    )
  return { SCHREIBT, nachgestellt }
})
vi.mock('../lib/daten/konto', async (importActual) => nachgestellt(await importActual<Record<string, unknown>>()))
vi.mock('../lib/daten/laden', async (importActual) => nachgestellt(await importActual<Record<string, unknown>>()))
vi.mock('../lib/daten/mitteilungen', async (importActual) => nachgestellt(await importActual<Record<string, unknown>>()))
vi.mock('../lib/daten/personen', async (importActual) => nachgestellt(await importActual<Record<string, unknown>>()))
vi.mock('../lib/daten/plaene', async (importActual) => nachgestellt(await importActual<Record<string, unknown>>()))
vi.mock('../lib/daten/predigtdienst', async (importActual) => nachgestellt(await importActual<Record<string, unknown>>()))
vi.mock('../lib/daten/schreibweg', async (importActual) => nachgestellt(await importActual<Record<string, unknown>>()))
vi.mock('../lib/daten/versammlung', async (importActual) => nachgestellt(await importActual<Record<string, unknown>>()))
vi.mock('../lib/daten/versand', async (importActual) => nachgestellt(await importActual<Record<string, unknown>>()))
vi.mock('../lib/daten/wochen', async (importActual) => nachgestellt(await importActual<Record<string, unknown>>()))
vi.mock('../lib/daten/zusagen', async (importActual) => nachgestellt(await importActual<Record<string, unknown>>()))

import { savePlaene, savePlanEintraege } from '../lib/daten/plaene'
import { saveGruppenbesuche, saveTrolleys } from '../lib/daten/predigtdienst'
import { sendPlanEntzug } from '../lib/daten/versand'
import { saveFsWeek, saveWeek } from '../lib/daten/wochen'
import { deleteConfirmationRows } from '../lib/daten/zusagen'
import { persist } from './persist'
import { reducer } from './reducer'
import type { AppAction, AppState } from './context'
import { demoZustand } from '../../tests/testdaten/demo-start'
import { DEMO_GROUPS } from '../../tests/testdaten/testdaten'
import { tagNach } from '../data/meeting-dates'
import { fsSetLeader, fsTaskKey } from '../data/fs'
import { displayName } from '../data/helpers'
import { neuerPlan } from '../data/weitere-plaene'
import type { Trolley, TrolleyTermin, WeitererPlan } from '../data/types'

/** Die Module der Datenschicht, wie die Attrappen oben sie liefern — ein neues zählt von selbst mit. */
const DATENSCHICHT = import.meta.glob<Record<string, unknown>>(['../lib/daten/*.ts', '!../lib/daten/*.test.ts'], { eager: true })

/**
 * Alle Exporte der Datenschicht. Wirft, wenn der Glob (fast) nichts findet oder
 * ein Modul ohne Attrappe schreiben würde — sonst prüfte die Probe ins Leere.
 */
function datenschicht(): Array<[string, unknown]> {
  const module = Object.entries(DATENSCHICHT)
  if (module.length < 11) throw new Error(`Datenschicht nicht gefunden (${module.length} Module) — Glob nachziehen`)
  const echt = module.filter(([, m]) => Object.entries(m).some(([name, wert]) => typeof wert === 'function' && SCHREIBT.test(name) && !vi.isMockFunction(wert)))
  if (echt.length) throw new Error(`ohne Attrappe: ${echt.map(([pfad]) => pfad).join(', ')} — vi.mock oben ergänzen`)
  return module.flatMap(([, m]) => Object.entries(m))
}

/** Mit dem Trolley-Recht (`zeugnis`): Manfred (p1) und Simon (p9). */
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

const reihenfolge = (fn: unknown, i = 0) => vi.mocked(fn as (...a: unknown[]) => void).mock.invocationCallOrder[i]

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 8, 7, 9, 0)) // Montag, 7.9.2026
  // Die Wochen gelingen — erst danach geht hinaus, was an ihnen hängt (16.10.2026).
  vi.mocked(saveWeek).mockResolvedValue(true)
  vi.mocked(saveFsWeek).mockResolvedValue(true)
})

/** Bis das Schreiben der Woche geantwortet hat (`nachDemSchreiben` in persist.ts). */
async function geschrieben(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve()
}
afterEach(() => {
  vi.runOnlyPendingTimers() // ausstehende Bündel leeren (die Schreiber sind Modul-Singletons)
  vi.useRealTimers()
})

/*
 * **Trolleys (T121, Phase 7) als Ablauf**: Den Trolley legt der Admin an und
 * tippt seinen Namen — geschrieben wird einmal, beim Abmelden spätestens. Die
 * Termine schreibt die Function `trolley`; was sie zurückgibt, landet im
 * Zustand, ohne dass hier noch etwas hinausgeht.
 */
describe('Trolleys als Ablauf', () => {
  const T1: Trolley = { id: 'tr1', name: 'Trolley 1', ort: 'Depot', hinweis: '' }
  const TERMIN: TrolleyTermin = {
    id: 'r1',
    trolleyId: 'tr1',
    datum: '2026-09-09',
    von: '10:00',
    bis: '12:00',
    pid: 'p9',
    partner: 'p1',
    gemeinsam: true,
  }

  it('Trolley anlegen → Namen tippen → abmelden: ein Schreiben, mit dem letzten Namen', () => {
    const a = ablauf(start({ planner: true }))
    a.tue({ type: 'trolleyAnlegen', trolley: T1 })
    for (const name of ['T', 'Tr', 'Trolley Saal']) a.tue({ type: 'trolleyAendern', id: 'tr1', patch: { name } })
    expect(saveTrolleys).not.toHaveBeenCalled()
    a.tue({ type: 'logout' })
    expect(saveTrolleys).toHaveBeenCalledTimes(1)
    expect(saveTrolleys).toHaveBeenCalledWith('c1', [expect.objectContaining({ id: 'tr1', name: 'Trolley Saal' })])
  })

  it('ein Termin aus der Function und der entfernte Trolley: kein Schreiben, und seine Termine gehen mit', () => {
    const a = ablauf(start({ trolleys: [T1] }))
    a.tue({ type: 'trolleyTermin', id: 'r1', termin: TERMIN, toast: 'eingetragen' })
    expect(a.state.trolleyTermine).toEqual([TERMIN])
    a.tue({ type: 'trolleyEntfernt', id: 'tr1' })
    expect(a.state.trolleys).toEqual([])
    expect(a.state.trolleyTermine).toEqual([])
    vi.runOnlyPendingTimers()
    for (const [name, fn] of datenschicht()) {
      if (vi.isMockFunction(fn)) expect(fn, name).not.toHaveBeenCalled()
    }
  })

  it('geht eine Person, geht ihr Termin mit — als Partner fehlt sie nur, und der andere sucht wieder', () => {
    // Wie die Fremdschlüssel: Wer eingetragen hat, `on delete cascade`; der Partner `on delete set null`.
    const eigener: TrolleyTermin = { ...TERMIN, id: 'r2', pid: 'p1', partner: null, gemeinsam: false }
    const a = ablauf(start({ trolleys: [T1], trolleyTermine: [TERMIN, eigener] }))
    a.tue({ type: 'removePerson', id: 'p1' })
    expect(a.state.trolleyTermine).toEqual([{ ...TERMIN, partner: null, gemeinsam: false }])
  })

  it('Termine aus der Function stehen nach dem Tag und der Zeit — wie die Ansicht sie liest', () => {
    const spaeter: TrolleyTermin = { ...TERMIN, id: 'r2', datum: '2026-09-10' }
    const frueher: TrolleyTermin = { ...TERMIN, id: 'r3', von: '08:00', bis: '09:00' }
    const a = ablauf(start({ trolleys: [T1] }))
    for (const termin of [spaeter, TERMIN, frueher]) a.tue({ type: 'trolleyTermin', id: termin.id, termin })
    expect(a.state.trolleyTermine.map((t) => t.id)).toEqual(['r3', 'r1', 'r2'])
  })
})

/*
 * **Gruppenbesuche: Wer seine Zusage verliert, erfährt es** — wie bei jedem
 * anderen Leiterwechsel. Der Besuch selbst ist keine Aufgabe; zugesagt wird am
 * Treffpunkt (`fs|<Montag>|<Instanz>`), und der Schlüssel trägt keine Person:
 * Ohne das Abräumen erbte der nächste Leiter die Zusage des Besuchers.
 */
describe('Gruppenbesuche als Ablauf', () => {
  const BESUCHER = 'p1' // Manfred Albrecht — darf Treffpunkte leiten
  const ANDERER = 'p2' // Thomas Lindner — ebenso

  /** Woche 1 der Testdaten und eine Gruppe, die sich dort trifft. */
  function besuchsLage(a: ReturnType<typeof ablauf>) {
    const woche = a.state.weeks[1]!.start
    const grp = a.state.fsWeeks[1]!.find((i) => i.grp)!.grp!
    return { woche, grp }
  }
  /** Die Treffpunkte, die `pid` in Woche 1 bei dieser Gruppe leitet — als Aufgaben-Schlüssel. */
  const seineSchluessel = (a: ReturnType<typeof ablauf>, woche: string, grp: string, pid: string) =>
    a.state.fsWeeks[1]!.filter((i) => i.grp === grp && i.lpid === pid).map((i) => fsTaskKey(woche, i.id))

  /** Ein Besuch, bei dem der Besucher die Treffpunkte der Gruppe leitet und zugesagt hat. */
  function zugesagterBesuch(a: ReturnType<typeof ablauf>) {
    const { woche, grp } = besuchsLage(a)
    a.tue({ type: 'besuchHinzufuegen', woche, grp, pid: BESUCHER })
    const besuch = a.state.gruppenbesuche.find((b) => b.woche === woche && b.grp === grp)!
    // Steht dort schon jemand, übernimmt der Besucher ausdrücklich.
    a.tue({ type: 'besuchUebernehmen', id: besuch.id })
    const keys = seineSchluessel(a, woche, grp, BESUCHER)
    expect(keys.length).toBeGreaterThan(0)
    // Er hat auf seinem Gerät bestätigt — hier kommt das mit dem Nachladen an.
    a.setze({ confirmations: Object.fromEntries(keys.map((k) => [k, 'bestätigt' as const])) })
    vi.clearAllMocks()
    return { woche, grp, besuch, keys }
  }

  it('Besuch gelöscht: der Platz wird frei, die Zusage gelöscht, der Besucher erfährt es', async () => {
    const a = ablauf(start())
    const { woche, grp, besuch, keys } = zugesagterBesuch(a)
    a.tue({ type: 'besuchEntfernen', id: besuch.id })
    expect(seineSchluessel(a, woche, grp, BESUCHER)).toEqual([])
    expect(saveGruppenbesuche).toHaveBeenCalledWith('c1', [], [besuch.id])
    // Seine Zusagen gehen mit der Woche, in einer Transaktion.
    expect(saveFsWeek).toHaveBeenCalledWith('c1', woche, a.state.fsWeeks[1], expect.arrayContaining(keys))
    await geschrieben()
    expect(deleteConfirmationRows).not.toHaveBeenCalled()
    expect(sendPlanEntzug).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ key: keys[0], pid: BESUCHER })]),
    )
  })

  it('anderer Besucher: der neue leitet, die Zusage des alten verfällt — er erfährt es, der neue erbt nichts', async () => {
    const a = ablauf(start())
    const { woche, grp, besuch, keys } = zugesagterBesuch(a)
    a.tue({ type: 'besuchBesucher', id: besuch.id, pid: ANDERER })
    expect(seineSchluessel(a, woche, grp, ANDERER)).toEqual(keys)
    for (const k of keys) expect(a.state.confirmations[k]).toBeUndefined()
    expect(saveGruppenbesuche).toHaveBeenCalledWith('c1', [expect.objectContaining({ id: besuch.id, pid: ANDERER })], [])
    await geschrieben()
    expect(vi.mocked(saveFsWeek).mock.calls.flatMap((c) => c[3] ?? [])).toEqual(expect.arrayContaining(keys))
    expect(deleteConfirmationRows).not.toHaveBeenCalled()
    expect(sendPlanEntzug).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ key: keys[0], pid: BESUCHER })]),
    )
  })


  it('leitete der Besucher den Treffpunkt schon vor dem Besuch, geht er mit dem Besuch trotzdem (entschieden am 3.10.2026)', async () => {
    const a = ablauf(start())
    const { woche, grp } = besuchsLage(a)
    // Schon vorher sein Platz — etwa aus der Auto-Zuteilung, geladen.
    const inst = a.state.fsWeeks[1]!.find((i) => i.grp === grp)!
    const manfred = a.state.persons.find((p) => p.id === BESUCHER)!
    a.setze({ fsWeeks: fsSetLeader(a.state.fsWeeks, 1, inst.id, displayName(manfred), BESUCHER) })
    const key = fsTaskKey(woche, inst.id)
    a.setze({ confirmations: { [key]: 'bestätigt' } })

    a.tue({ type: 'besuchHinzufuegen', woche, grp, pid: BESUCHER })
    // Eintragen ändert nichts — der Platz ist schon seiner.
    expect(a.state.confirmations[key]).toBe('bestätigt')
    const besuch = a.state.gruppenbesuche.find((b) => b.woche === woche && b.grp === grp)!
    vi.clearAllMocks()

    a.tue({ type: 'besuchEntfernen', id: besuch.id })
    expect(a.state.fsWeeks[1]!.find((i) => i.id === inst.id)?.leader).toBe('')
    await geschrieben()
    expect(vi.mocked(saveFsWeek).mock.calls.flatMap((c) => c[3] ?? [])).toEqual([key])
    expect(sendPlanEntzug).toHaveBeenCalledWith([expect.objectContaining({ key, pid: BESUCHER })])
  })
})

describe('Weitere Pläne als Ablauf', () => {
  it('Plan anlegen → Namen tippen → reihum verteilen → Zeitraum kürzen', () => {
    // Ein zweiter, veröffentlichter Plan, den hier niemand anfasst.
    const anderer: WeitererPlan = { id: 'p-alt', name: 'Fenster', von: '2026-09-07', bis: '2026-11-29', entwurf: false }
    const a = ablauf(start({ plaene: [anderer] }))
    const plan = neuerPlan('p-neu', new Date())
    a.tue({ type: 'wpPlanAnlegen', plan })
    for (const name of ['W', 'Wi', 'Winter']) a.tue({ type: 'wpPlanAendern', id: 'p-neu', patch: { name } })
    expect(savePlaene).not.toHaveBeenCalled()

    a.tue({ type: 'wpGruppenVerteilen', planId: 'p-neu', abGruppe: DEMO_GROUPS[0]!.id })
    // Der Plan geht vor seinen Einträgen hinaus — einmal, mit Namen, ohne den anderen.
    expect(savePlaene).toHaveBeenCalledTimes(1)
    expect(savePlaene).toHaveBeenCalledWith('c1', [expect.objectContaining({ id: 'p-neu', name: 'Winter' })], [])
    const [, verteilt, nichtsWeg] = vi.mocked(savePlanEintraege).mock.calls[0]!
    expect(verteilt).toHaveLength(13)
    expect(nichtsWeg).toEqual([])
    expect(reihenfolge(savePlaene)).toBeLessThan(reihenfolge(savePlanEintraege)!)

    // Auf vier Wochen kürzen: Die neun Wochen danach gehen, die vier davor bleiben unberührt.
    const bis = tagNach(plan.von, 4 * 7 - 1)
    a.tue({ type: 'wpPlanAendern', id: 'p-neu', patch: { bis } })
    const [, geaendert, entfernt] = vi.mocked(savePlanEintraege).mock.calls[1]!
    expect(geaendert).toEqual([])
    expect(entfernt).toHaveLength(9)
    expect(a.state.planEintraege.filter((e) => e.planId === 'p-neu')).toHaveLength(4)
    // Das neue Ende ging vor dem Löschen hinaus — und wieder nur dieser Plan.
    expect(vi.mocked(savePlaene).mock.calls[1]).toEqual(['c1', [expect.objectContaining({ id: 'p-neu', bis })], []])
    expect(reihenfolge(savePlaene, 1)).toBeLessThan(reihenfolge(savePlanEintraege, 1)!)
  })

  it('erst getippt, dann gelöscht: der Plan geht nur als Löschung hinaus', () => {
    const a = ablauf(start())
    a.tue({ type: 'wpPlanAnlegen', plan: neuerPlan('p-neu', new Date()) })
    a.tue({ type: 'wpPlanAendern', id: 'p-neu', patch: { name: 'Grundreinigung' } })
    a.tue({ type: 'wpPlanLoeschen', id: 'p-neu' })
    a.tue({ type: 'navigate', screen: 'start' })
    // Geschrieben nach dem Löschen, stünde er wieder da.
    expect(savePlaene).toHaveBeenCalledTimes(1)
    expect(savePlaene).toHaveBeenCalledWith('c1', [], ['p-neu'])
  })
})
