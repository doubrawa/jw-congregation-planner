/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppState } from './context'

/**
 * **Freie Plätze: der ganze Weg** (4.10.2026) — vom gesendeten Plan über das
 * Angebot unter „Meine Aufgaben" bis zum Eintrag, mit dem echten Reducer und
 * dem echten `persist`. Schreiben darf der Verkündiger die Woche nicht selbst:
 * Der Platz geht an die Edge Function (`platzFuellen`), die Woche bleibt
 * ungeschrieben, und die Zusage setzt ebenfalls der Server.
 */

vi.mock('../lib/supabase', () => ({ supabase: {}, isSupabaseConfigured: true }))
vi.mock('../lib/data', async (importActual) => ({
  ...(await importActual<typeof import('../lib/data')>()),
  platzFuellen: vi.fn(),
  saveWeek: vi.fn(),
  saveConfirmation: vi.fn(),
  deleteConfirmationRows: vi.fn(),
  sendPlanEntzug: vi.fn(),
  sendPlanZeugnisAenderung: vi.fn(),
  notifyPlanners: vi.fn(),
}))

const data = await import('../lib/data')
const { persist } = await import('./persist')
const { aufgabenAbgeleitet, reducer } = await import('./reducer')
const { initialState } = await import('./init')
const { emptyQualifications } = await import('../data/helpers')
const { helferKey, punktKey, sentKey } = await import('../data/planning')

const MONTAG = '2026-09-07'
const KEY = helferKey(MONTAG, 'mid', 'mik', 0)

function start(over: Partial<AppState> = {}): AppState {
  // Mit dem Bereich für das Gebet: Den leeren Gebet-Platz bietet die App trotzdem nicht an — Aufgaben teilt der Planer zu.
  const ich = {
    id: 'p-ich', fn: 'Ich', ln: 'Selbst', role: 'verkuendiger' as const, mail: '',
    priv: { ...emptyQualifications(), gebet: true, 'svc:mik': true },
  }
  return aufgabenAbgeleitet({
    ...initialState(),
    dataStatus: 'ready',
    congregationId: 'c1',
    userId: 'u1',
    personId: ich.id,
    planner: false,
    persons: [ich],
    services: [{ key: 'mik', name: 'Mikrofone', count: 1, groups: false }],
    congregation: { name: 'Nordheim', hall: '', times: { mid: { wd: 2, time: '19:00' }, we: { wd: 0, time: '10:00' } } },
    weeks: [
      {
        range: '', book: '', start: MONTAG,
        mid: {
          date: '', end: '',
          sections: [
            { label: 'ERÖFFNUNG', farbe: 'neutral', items: [{ iid: 'k1', title: 'Lied 1 · Gebet', names: [{ name: '', rolle: 'Gebet', bereichsKey: 'gebet' }] }] },
          ],
          helpers: {},
        },
        // Am Sonntag ist das Mikrofon besetzt — frei bleibt nur das am Dienstag.
        we: { date: '', end: '', sections: [], helpers: { mik: [{ name: 'Andere Person', pid: 'p-x' }] } },
      },
    ] as AppState['weeks'],
    fsWeeks: [],
    // Ein Platz dieser Woche ist gesendet — der Plan steht.
    sentLog: { [sentKey(punktKey(MONTAG, 'mid', 'kx', 0), 'Andere Person')]: '2026-09-01T10:00:00Z' },
    ...over,
  })
}

// Montag früh vor der Zusammenkunft — mit der echten Uhr läge die Woche im
// Rückblick, und „Vergangenes fällt heraus" nähme jedes Angebot weg.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-07T09:00:00Z'))
})
afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('Freie Plätze — vom Angebot zum Eintrag', () => {
  it('der gesendete Plan bietet den Platz an', () => {
    expect(start().offenePlaetze.map((p) => p.key)).toEqual([KEY])
  })

  it('der ungesendete nicht — und wird er gesendet, erscheint der Platz', () => {
    const s = start({ sentLog: {} })
    expect(s.offenePlaetze).toEqual([])
    // Das Versand-Tagebuch kommt nur mit dem Laden: Das Nachladen nach „Plan
    // senden" leitet neu ab (`hydrate`), und der Platz erscheint.
    const danach = reducer(s, { type: 'hydrate', payload: hydrateAus(s, start().sentLog) })
    expect(danach.offenePlaetze.map((p) => p.key)).toEqual([KEY])
  })

  it('„Übernehmen": eingetragen, zugesagt, bedankt — und der Server schreibt, nicht der Client', () => {
    const vorher = start()
    const nachher = reducer(vorher, { type: 'platzUebernehmen', key: KEY })
    expect(nachher.weeks[0]!.mid.helpers.mik?.[0]).toMatchObject({ name: 'Ich Selbst', pid: 'p-ich' })
    expect(nachher.confirmations[KEY]).toBe('bestätigt')
    expect(nachher.toast?.text).toBe('Danke! Du bist eingetragen')
    // Angeboten wird er danach nicht mehr — er gehört jetzt mir.
    expect(nachher.offenePlaetze).toEqual([])
    expect(nachher.myTasks.map((t) => t.id)).toContain(KEY)

    persist(vorher, nachher, { type: 'platzUebernehmen', key: KEY })
    expect(data.platzFuellen).toHaveBeenCalledWith(KEY)
    expect(data.saveWeek).not.toHaveBeenCalled()
    expect(data.saveConfirmation).not.toHaveBeenCalled()
  })

  it('was nicht angeboten ist, ändert nichts — ein veralteter Tipp, ein Programmpunkt', () => {
    const s = start()
    expect(reducer(s, { type: 'platzUebernehmen', key: punktKey(MONTAG, 'mid', 'weg', 0) })).toBe(s)
    expect(reducer(s, { type: 'platzUebernehmen', key: punktKey(MONTAG, 'mid', 'k1', 0) })).toBe(s)
    const ohneAngebot = start({ sentLog: {} })
    expect(reducer(ohneAngebot, { type: 'platzUebernehmen', key: KEY })).toBe(ohneAngebot)
  })
})

/** Eine Ladung, die den Bestand von `s` wiederholt — mit anderem Versand-Tagebuch. */
function hydrateAus(s: AppState, sentLog: AppState['sentLog']) {
  return {
    congregationId: s.congregationId, userId: s.userId, empty: false, congregation: s.congregation,
    planner: s.planner, personId: s.personId, persons: s.persons, services: s.services, groups: s.groups,
    weeks: s.weeks, fsRules: s.fsRules, fsWeeks: s.fsWeeks, gruppenbesuche: s.gruppenbesuche,
    trolleys: s.trolleys, trolleyTermine: s.trolleyTermine, plaene: s.plaene, planEintraege: s.planEintraege,
    absences: s.absences, notifications: s.notifs, confirmations: s.confirmations, sentLog,
    reminders: s.reminders, congLang: s.congLang, progLangs: s.progLangs, auxClass: s.auxClass,
    members: s.members, anmeldeLinks: s.anmeldeLinks,
  } as Parameters<typeof reducer>[1] extends { type: 'hydrate'; payload: infer P } ? P : never
}
