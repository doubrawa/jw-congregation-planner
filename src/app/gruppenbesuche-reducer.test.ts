/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reducer } from './reducer'
import type { AppState, HydratePayload } from './context'
import { demoZustand } from '../../tests/testdaten/demo-start'
import { DEMO_FS_RULES } from '../../tests/testdaten/testdaten'
import { buildFsWeeks, fsTaskKey, genFsWeek } from '../data/fs'
import type { Gruppenbesuch } from '../data/types'

/**
 * **Gruppenbesuche im Reducer** (T120, Phase 2): Jede Aktion trägt den
 * Besucher in die Treffpunkte der Gruppe ein oder aus — soweit die Woche
 * geladen ist. Die Logik dahinter prüft `data/gruppenbesuche.test.ts`; hier
 * geht es darum, dass jede Aktion sie wirklich benutzt, und um die Wege, auf
 * denen ein Besuch ohne eigene Aktion etwas ändert: Import, Gruppe löschen,
 * Person löschen, Laden.
 */

/** Demo-Bestand (Wochen 7., 14., 21. und 28. September 2026), Treffpunkte ohne Leiter. */
function zustand(over: Partial<AppState> = {}): AppState {
  const basis = demoZustand()
  return {
    ...basis,
    planner: true,
    fsWeeks: buildFsWeeks(basis.weeks.map((w) => w.start), DEMO_FS_RULES),
    confirmations: {},
    terminGewaehlt: true,
    ...over,
  }
}

/** Der Leiter des Gruppen-Treffpunkts in einer geladenen Woche. */
function leiter(s: AppState, woche: string, grp: string): string | undefined {
  const wi = s.weeks.findIndex((w) => w.start === woche)
  return s.fsWeeks[wi]?.find((inst) => inst.grp === grp)?.leader
}

const besuch = (woche: string, grp: string, pid: string | null = 'p5'): Gruppenbesuch => ({
  id: `b-${woche}-${grp}`,
  woche,
  grp,
  pid,
})

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 8, 7, 9, 0)) // Montag der ersten Demo-Woche
})
afterEach(() => vi.useRealTimers())

describe('Reihum verteilen', () => {
  it('trägt in geladene Wochen ein und merkt den Rest vor', () => {
    const next = reducer(zustand(), { type: 'besucheVerteilen', pid: 'p5' })
    expect(next.gruppenbesuche).toHaveLength(6)
    expect(next.gruppenbesuche[0]).toMatchObject({ woche: '2026-09-07', grp: 'g1', pid: 'p5' })
    expect(next.gruppenbesuche.every((b) => /^b.{8,}/.test(b.id))).toBe(true)
    // Die erste Woche ist geladen: Konrad leitet dort den Treffpunkt der Gruppe 1.
    expect(leiter(next, '2026-09-07', 'g1')).toBe('Konrad Sommer')
    // Die anderen Gruppen derselben Woche bleiben frei.
    expect(leiter(next, '2026-09-07', 'g2')).toBe('')
    expect(next.toast?.text).toBe('Besuche geplant: 6')
  })

  it('ohne Gruppen gibt es nur einen Hinweis', () => {
    const s = zustand({ groups: [] })
    const next = reducer(s, { type: 'besucheVerteilen', pid: 'p5' })
    expect(next.gruppenbesuche).toBe(s.gruppenbesuche)
    expect(next.fsWeeks).toBe(s.fsWeeks)
    expect(next.toast?.text).toBe('Keine passende Woche gefunden')
  })
})

describe('Einzelne Besuche', () => {
  it('hinzufügen trägt ein — dieselbe Gruppe in derselben Woche nur einmal', () => {
    const s = reducer(zustand(), { type: 'besuchHinzufuegen', woche: '2026-09-14', grp: 'g2', pid: 'p5' })
    expect(s.gruppenbesuche).toHaveLength(1)
    expect(leiter(s, '2026-09-14', 'g2')).toBe('Konrad Sommer')
    expect(reducer(s, { type: 'besuchHinzufuegen', woche: '2026-09-14', grp: 'g2', pid: 'p6' })).toBe(s)
  })

  it('entfernen gibt den Treffpunkt wieder frei', () => {
    const mit = reducer(zustand(), { type: 'besuchHinzufuegen', woche: '2026-09-14', grp: 'g2', pid: 'p5' })
    const ohne = reducer(mit, { type: 'besuchEntfernen', id: mit.gruppenbesuche[0]!.id })
    expect(ohne.gruppenbesuche).toEqual([])
    expect(leiter(ohne, '2026-09-14', 'g2')).toBe('')
  })

  it('ein anderer Besucher tritt an die Stelle des bisherigen', () => {
    const mit = reducer(zustand(), { type: 'besuchHinzufuegen', woche: '2026-09-14', grp: 'g2', pid: 'p5' })
    const neu = reducer(mit, { type: 'besuchBesucher', id: mit.gruppenbesuche[0]!.id, pid: 'p6' })
    expect(neu.gruppenbesuche[0]?.pid).toBe('p6')
    expect(leiter(neu, '2026-09-14', 'g2')).toBe('Jonas Berger')
  })

  it('„Übernehmen" ersetzt einen anderen Leiter — und dessen Zusage verfällt', () => {
    // Jonas leitet Gruppe 1 am 19. September und hat zugesagt.
    let s = zustand()
    s = reducer({ ...s, slotSel: { kind: 'fs', wi: 1, instId: 'r4', label: '', priv: 'treffpunkt', groups: false } }, {
      type: 'assign',
      name: 'Jonas Berger',
      pid: 'p6',
    })
    const schluessel = fsTaskKey('2026-09-14', 'r4')
    s = { ...s, confirmations: { [schluessel]: 'bestätigt' } }
    // Der Besuch trägt ihn nicht ungefragt aus …
    s = reducer(s, { type: 'besuchHinzufuegen', woche: '2026-09-14', grp: 'g1', pid: 'p5' })
    expect(leiter(s, '2026-09-14', 'g1')).toBe('Jonas Berger')
    expect(s.confirmations[schluessel]).toBe('bestätigt')
    // … erst „Übernehmen" — dann gehört der Platz Konrad, und Jonas' Zusage ist weg.
    const next = reducer(s, { type: 'besuchUebernehmen', id: s.gruppenbesuche[0]!.id })
    expect(leiter(next, '2026-09-14', 'g1')).toBe('Konrad Sommer')
    expect(next.confirmations[schluessel]).toBeUndefined()
  })

  it('„Leeren" nimmt nur, was noch kommt — Vergangenes bleibt als Rückblick', () => {
    vi.setSystemTime(new Date(2026, 8, 20, 9, 0))
    let s = zustand({ gruppenbesuche: [besuch('2026-09-07', 'g1'), besuch('2026-09-21', 'g2')] })
    s = reducer(s, { type: 'besuchUebernehmen', id: 'b-2026-09-21-g2' })
    expect(leiter(s, '2026-09-21', 'g2')).toBe('Konrad Sommer')
    const next = reducer(s, { type: 'besucheLeeren' })
    expect(next.gruppenbesuche.map((b) => b.id)).toEqual(['b-2026-09-07-g1'])
    expect(leiter(next, '2026-09-21', 'g2')).toBe('')
    // Gezählt sind Besuche, nicht Zuteilungen.
    expect(next.toast?.text).toBe('Entfernte Besuche: 1')
  })
})

describe('Wege ohne eigene Aktion', () => {
  it('der Import trägt einen vorgemerkten Besuch in die neue Woche ein', () => {
    const s = zustand({ gruppenbesuche: [besuch('2026-10-12', 'g2')] })
    const next = reducer(s, { type: 'addImportedWeek', week: { ...s.weeks[0]!, start: '2026-10-12' } })
    expect(leiter(next, '2026-10-12', 'g2')).toBe('Konrad Sommer')
    // Die übrigen Treffpunkte kommen wie immer aus dem Grundplan.
    expect(next.fsWeeks.at(-1)!.filter((inst) => inst.grp !== 'g2')).toEqual(
      genFsWeek('2026-10-12', s.fsRules).filter((inst) => inst.grp !== 'g2'),
    )
  })

  it('mit einer Gruppe gehen ihre Besuche', () => {
    const s = zustand({ gruppenbesuche: [besuch('2026-10-12', 'g1'), besuch('2026-11-09', 'g2')] })
    const next = reducer(s, { type: 'removeGroup', id: 'g1' })
    expect(next.gruppenbesuche.map((b) => b.grp)).toEqual(['g2'])
  })

  it('mit einer Person geht nur der Besucher, nicht der Besuch', () => {
    const s = zustand({ gruppenbesuche: [besuch('2026-10-12', 'g1'), besuch('2026-11-09', 'g2', 'p6')] })
    const next = reducer(s, { type: 'removePerson', id: 'p5' })
    expect(next.gruppenbesuche.map((b) => b.pid)).toEqual([null, 'p6'])
  })

  it('eine Momentaufnahme von vor T120 lädt ohne Besuche', () => {
    const s = zustand()
    const { gruppenbesuche: _ohne, ...rest } = {
      congregationId: 'c1',
      userId: 'u1',
      empty: false,
      congregation: s.congregation,
      planner: true,
      personId: null,
      persons: s.persons,
      services: s.services,
      groups: s.groups,
      weeks: s.weeks,
      fsRules: s.fsRules,
      fsWeeks: s.fsWeeks,
      gruppenbesuche: [],
      absences: [],
      notifications: [],
      confirmations: {},
      sentLog: {},
      reminders: s.reminders,
      congLang: 'de',
      progLangs: [],
      auxClass: false,
      members: [],
      invites: [],
    } satisfies HydratePayload
    const next = reducer({ ...s, gruppenbesuche: [besuch('2026-10-12', 'g1')] }, {
      type: 'hydrate',
      payload: rest as unknown as HydratePayload,
    })
    expect(next.gruppenbesuche).toEqual([])
  })
})
