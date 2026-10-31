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

describe('Einzelne Besuche', () => {
  it('hinzufügen trägt ein — dieselbe Gruppe in derselben Woche nur einmal', () => {
    const s = reducer(zustand(), { type: 'besuchHinzufuegen', woche: '2026-09-14', grp: 'g2', pid: 'p5' })
    expect(s.gruppenbesuche).toHaveLength(1)
    // Eindeutig statt zeitgestempelt, lesbar am Präfix.
    expect(s.gruppenbesuche[0]!.id).toMatch(/^b.{8,}/)
    expect(leiter(s, '2026-09-14', 'g2')).toBe('Konrad Sommer')
    // Die anderen Gruppen derselben Woche bleiben frei.
    expect(leiter(s, '2026-09-14', 'g1')).toBe('')
    expect(reducer(s, { type: 'besuchHinzufuegen', woche: '2026-09-14', grp: 'g2', pid: 'p6' })).toBe(s)
  })

  it('in einer Woche hinter den geladenen wird er vorgemerkt — eingetragen ist noch nichts', () => {
    const s = zustand()
    const next = reducer(s, { type: 'besuchHinzufuegen', woche: '2026-11-09', grp: 'g1', pid: 'p5' })
    expect(next.gruppenbesuche).toHaveLength(1)
    expect(next.fsWeeks).toBe(s.fsWeeks)
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

  it('… nur an diesem Besuch: der Besuch einer anderen Gruppe behält seinen Besucher', () => {
    let s = reducer(zustand(), { type: 'besuchHinzufuegen', woche: '2026-09-14', grp: 'g2', pid: 'p5' })
    s = reducer(s, { type: 'besuchHinzufuegen', woche: '2026-09-21', grp: 'g1', pid: 'p5' })
    const anderer = s.gruppenbesuche.find((b) => b.grp === 'g1')!
    const neu = reducer(s, { type: 'besuchBesucher', id: s.gruppenbesuche.find((b) => b.grp === 'g2')!.id, pid: 'p6' })
    expect(neu.gruppenbesuche.map((b) => [b.grp, b.pid])).toEqual([['g2', 'p6'], ['g1', 'p5']])
    expect(neu.gruppenbesuche.find((b) => b.grp === 'g1')).toBe(anderer)
    expect(leiter(neu, '2026-09-21', 'g1')).toBe('Konrad Sommer')
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

})

/** An jedem kommenden Besuch lassen sich Woche und Gruppe ändern (4.10.2026). */
describe('Einen Besuch verlegen', () => {
  const mit = () => reducer(zustand(), { type: 'besuchHinzufuegen', woche: '2026-09-14', grp: 'g2', pid: 'p5' })

  it('in eine andere Woche: dort tritt der Besucher an, die alte wird frei', () => {
    const s = mit()
    const id = s.gruppenbesuche[0]!.id
    const next = reducer(s, { type: 'besuchAendern', id, patch: { woche: '2026-09-21' } })
    expect(next.gruppenbesuche).toEqual([{ id, woche: '2026-09-21', grp: 'g2', pid: 'p5' }])
    expect(leiter(next, '2026-09-14', 'g2')).toBe('')
    expect(leiter(next, '2026-09-21', 'g2')).toBe('Konrad Sommer')
  })

  it('zu einer anderen Gruppe ebenso — und die Zusage am alten Treffpunkt verfällt', () => {
    let s = mit()
    const id = s.gruppenbesuche[0]!.id
    const alt = fsTaskKey('2026-09-14', 'r5')
    s = { ...s, confirmations: { [alt]: 'bestätigt' } }
    expect(leiter(s, '2026-09-14', 'g2')).toBe('Konrad Sommer')
    // Gegenprobe: Eine Änderung anderswo lässt die Zusage stehen.
    expect(reducer(s, { type: 'besuchHinzufuegen', woche: '2026-09-21', grp: 'g3', pid: 'p5' }).confirmations[alt]).toBe('bestätigt')
    const next = reducer(s, { type: 'besuchAendern', id, patch: { grp: 'g1' } })
    expect(next.gruppenbesuche[0]).toMatchObject({ id, woche: '2026-09-14', grp: 'g1' })
    expect(leiter(next, '2026-09-14', 'g2')).toBe('')
    expect(leiter(next, '2026-09-14', 'g1')).toBe('Konrad Sommer')
    expect(next.confirmations[alt]).toBeUndefined()
  })

  it('verlegt wird nur dieser Besuch — ein zweiter bleibt, wo er war', () => {
    let s = mit()
    s = reducer(s, { type: 'besuchHinzufuegen', woche: '2026-09-21', grp: 'g3', pid: 'p5' })
    const zweiter = s.gruppenbesuche.find((b) => b.grp === 'g3')!
    const next = reducer(s, { type: 'besuchAendern', id: s.gruppenbesuche.find((b) => b.grp === 'g2')!.id, patch: { woche: '2026-09-28' } })
    expect(next.gruppenbesuche.map((b) => [b.woche, b.grp])).toEqual([['2026-09-21', 'g3'], ['2026-09-28', 'g2']])
    expect(next.gruppenbesuche.find((b) => b.grp === 'g3')).toBe(zweiter)
  })

  it('wo die Gruppe in der Woche schon besucht wird: nichts — so auch die Datenbank', () => {
    let s = mit()
    s = reducer(s, { type: 'besuchHinzufuegen', woche: '2026-09-21', grp: 'g2', pid: 'p5' })
    const erster = s.gruppenbesuche.find((b) => b.woche === '2026-09-14')!
    expect(reducer(s, { type: 'besuchAendern', id: erster.id, patch: { woche: '2026-09-21' } })).toBe(s)
  })

  it('ohne Änderung, ohne Besuch, in Vergangenes oder aus Vergangenem: nichts', () => {
    const s = mit()
    const id = s.gruppenbesuche[0]!.id
    expect(reducer(s, { type: 'besuchAendern', id, patch: { woche: '2026-09-14', grp: 'g2' } })).toBe(s)
    expect(reducer(s, { type: 'besuchAendern', id: 'b-weg', patch: { grp: 'g1' } })).toBe(s)
    // Die Woche vor der ersten ist um.
    expect(reducer(s, { type: 'besuchAendern', id, patch: { woche: '2026-08-31' } })).toBe(s)
    // Ist der Besuch selbst vorbei, bleibt er als Rückblick stehen.
    vi.setSystemTime(new Date(2026, 8, 21, 9, 0))
    expect(reducer(s, { type: 'besuchAendern', id, patch: { woche: '2026-09-28' } })).toBe(s)
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
      vortraege: [],
      trolleys: [],
      trolleyTermine: [],
      plaene: [],
      planEintraege: [],
      absences: [],
      notifications: [],
      confirmations: {},
      sentLog: {},
      reminders: s.reminders,
      congLang: 'de',
      progLangs: [],
      auxClass: false,
      members: [],
      anmeldeLinks: [],
    } satisfies HydratePayload
    const next = reducer({ ...s, gruppenbesuche: [besuch('2026-10-12', 'g1')] }, {
      type: 'hydrate',
      payload: rest as unknown as HydratePayload,
    })
    expect(next.gruppenbesuche).toEqual([])
  })
})
