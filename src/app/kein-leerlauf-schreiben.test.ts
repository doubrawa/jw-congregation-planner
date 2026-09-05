/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppAction, AppState, HydratePayload } from './context'
import { initialState } from './init'
import {
  buildDemoFsWeeks,
  buildDemoWeeks,
  CONGREGATION,
  DEMO_ABSENCES,
  DEMO_FS_RULES,
  DEMO_GROUPS,
  DEMO_NOTIFICATIONS,
  DEMO_PERSONS,
  DEMO_REMINDERS,
  DEMO_SERVICES,
  FS_BASE,
} from '../data/testdaten'
import { isSong } from '../data/helpers'
import { isoDay } from '../data/meeting-dates'
import type { PartItem, Week } from '../data/types'

/**
 * **Eine unveränderte Woche darf nicht geschrieben werden.**
 *
 * Die Wochen gehen mit Vergleiche-und-Tausche in die Datenbank (T39):
 * `saveWeek` schickt den zuletzt gelesenen Zeitstempel mit und schlägt fehl,
 * wenn inzwischen jemand anderes geschrieben hat. Der Nutzer bekommt dann einen
 * Konflikt gemeldet und seine Ansicht neu geladen.
 *
 * Ein Schreibvorgang **ohne Änderung** ist damit nicht bloß Verschwendung: Er
 * meldet einem zweiten Planer einen Konflikt für eine Woche, die niemand
 * angefasst hat. Genau davor warnt `endenNachziehen` in `meeting-edit.ts`
 * ausdrücklich — dort wurde es einmal gefunden und behoben, an einer Stelle.
 *
 * Die Gefahr liegt in der Bauart von `persist`: Es entscheidet über die
 * **Aktion**, nicht über einen Vergleich. `case 'lacAdd': wocheSpeichern(…)`
 * schreibt, ob der Punkt angelegt wurde oder nicht — dass eine abgeprallte
 * Aktion nichts schreibt, muss die Aktion selbst sicherstellen.
 *
 * Geprüft wird deshalb an der Woche, nicht am Zustand: **Jede Woche, die an
 * `saveWeek` geht, muss ein anderes Objekt sein als die, die vorher an ihrer
 * Stelle stand.** Das braucht keine Liste, die jemand pflegen müsste — der
 * Reducer gibt unberührte Wochen identisch zurück, und genau darauf baut die
 * ganze Persistenzschicht auf.
 */

vi.mock('../lib/supabase', () => ({ supabase: {}, isSupabaseConfigured: true }))

/*
 * Dieselbe Liste wie in `persist.test.ts` — sie deckt sich mit der Importliste
 * in `persist.ts`. Bliebe eine Funktion übrig, liefe sie gegen den leeren
 * Supabase-Stub und flöge; der Test fiele also auf, statt still zu schweigen.
 */
vi.mock('../lib/data', async (importActual) => ({
  ...(await importActual<typeof import('../lib/data')>()),
  deleteAbsenceRow: vi.fn(),
  deleteConfirmationRows: vi.fn(),
  renameConfirmationKeys: vi.fn(),
  swapConfirmationKeys: vi.fn(),
  deleteGroupRow: vi.fn(),
  deletePersonRow: vi.fn(),
  deleteInviteRow: vi.fn(),
  deleteMemberRow: vi.fn(),
  deleteNotifications: vi.fn(),
  deleteServiceRow: vi.fn(),
  insertNotifications: vi.fn(),
  markNotificationsRead: vi.fn(),
  saveAbsence: vi.fn(),
  saveConfirmation: vi.fn(),
  saveCongregationInfo: vi.fn(),
  saveFsRules: vi.fn(),
  saveFsWeek: vi.fn(),
  saveGroupRow: vi.fn(),
  saveInvite: vi.fn(),
  saveInvitePlanner: vi.fn(),
  saveMemberRow: vi.fn(),
  savePerson: vi.fn(),
  savePersonGroup: vi.fn(),
  saveService: vi.fn(),
  saveSettings: vi.fn(),
  saveWeek: vi.fn(),
  substituteSeek: vi.fn(),
  substituteTake: vi.fn(),
  sendPlanEntzug: vi.fn(),
}))

import * as data from '../lib/data'
import { persist } from './persist'
import { reducer } from './reducer'

function ladung(): HydratePayload {
  return {
    congregationId: 'c1',
    userId: 'u1',
    empty: false,
    congregation: { ...CONGREGATION },
    planner: true,
    personId: DEMO_PERSONS[0]!.id,
    persons: DEMO_PERSONS.map((p) => ({ ...p })),
    services: DEMO_SERVICES.map((s) => ({ ...s })),
    groups: DEMO_GROUPS.map((g) => ({ ...g })),
    weeks: buildDemoWeeks(),
    fsRules: DEMO_FS_RULES.map((r) => ({ ...r })),
    fsWeeks: buildDemoFsWeeks(),
    fsBase: isoDay(FS_BASE),
    absences: DEMO_ABSENCES.map((a) => ({ ...a })),
    notifications: DEMO_NOTIFICATIONS.map((n) => ({ ...n })),
    confirmations: {},
    sentLog: {},
    reminders: { ...DEMO_REMINDERS },
    congLang: 'Deutsch',
    progLangs: [],
    auxClass: true,
    members: [{ userId: 'u1', personId: DEMO_PERSONS[0]!.id, planner: true, email: 'a@b.c' }],
    invites: [],
  }
}

/** Erster zuteilbarer Programmpunkt einer Zusammenkunft. */
function ersterPunkt(week: Week, tab: 'mid' | 'we'): { si: number; ii: number } {
  const sections = week[tab].sections
  for (let si = 0; si < sections.length; si++) {
    const items = sections[si]!.items
    for (let ii = 0; ii < items.length; ii++) {
      const it = items[ii]!
      if (!isSong(it) && (it as PartItem).names.length > 0) return { si, ii }
    }
  }
  throw new Error('kein Programmpunkt gefunden')
}

/**
 * Aktionen, die etwas ändern **können** — jede mit brauchbaren Nutzdaten.
 *
 * Welche davon beim zweiten Mal abprallen, entscheidet der Test selbst; eine
 * Liste „diese sind wiederholbar" wäre genau die Sorte handgepflegte Liste, die
 * hier schon mehrfach schiefgegangen ist.
 */
function folge(s: AppState): AppAction[] {
  const week = s.weeks[0]!
  const p = ersterPunkt(week, 'mid')
  const person = s.persons[0]!
  const svc = s.services[0]!
  const grp = s.groups[0]!
  const regel = s.fsRules[0]!
  return [
    { type: 'openSlot', sel: { kind: 'part', wi: 0, tab: 'mid', si: p.si, ii: p.ii, ni: 0, priv: null, groups: false, label: 'x' } },
    { type: 'assign', name: `${person.fn} ${person.ln}`, pid: person.id },
    { type: 'openSlot', sel: { kind: 'part', wi: 0, tab: 'mid', si: p.si, ii: p.ii, ni: 0, priv: null, groups: false, label: 'x' } },
    { type: 'assign', name: '' },
    { type: 'setPartThema', tab: 'mid', si: p.si, ii: p.ii, begriff: 'Thema', thema: 'Probe' },
    { type: 'talkEdit', si: p.si, ii: p.ii, title: 'Probevortrag' },
    { type: 'openingSong', song: '12' },
    { type: 'closingSong', song: '34' },
    { type: 'clearAssignments', scope: 'parts' },
    { type: 'clearAssignments', scope: 'helpers' },
    { type: 'lacAdd', si: p.si, title: '' }, // leerer Titel → legt nichts an
    { type: 'lacRemove', si: p.si, ii: 999 }, // Punkt gibt es nicht
    { type: 'lacMove', si: p.si, ii: 0, dir: -1 }, // schon ganz oben
    { type: 'lacAdjust', si: p.si, ii: p.ii, delta: 0 },
    { type: 'setAbweichung', tab: 'mid', patch: { day: 'Mittwoch' } },
    { type: 'setDienstwoche', on: false }, // ist ohnehin aus
    { type: 'setAnlass', art: null }, // ist ohnehin keiner gesetzt
    { type: 'updatePerson', id: person.id, patch: { tel: person.tel } },
    { type: 'updateCongregation', patch: { hall: CONGREGATION.hall } },
    { type: 'changeServiceCount', key: svc.key, delta: 1 },
    { type: 'updateGroup', id: grp.id, patch: { ov: grp.ov } },
    { type: 'fsRuleUpdate', id: regel.id, patch: { time: regel.time } },
    { type: 'fsClear', onlyGroup: null },
    { type: 'setCongLang', name: 'Deutsch' },
    { type: 'removeProgLang', name: 'gibt-es-nicht' },
    { type: 'removeAbsence', id: 'gibt-es-nicht' },
    { type: 'removeService', key: 'gibt-es-nicht' },
    { type: 'removeGroup', id: 'gibt-es-nicht' },
    { type: 'removePerson', id: 'gibt-es-nicht' },
    { type: 'removeInvite', id: 'gibt-es-nicht' },
    { type: 'removeMember', userId: 'gibt-es-nicht' },
    { type: 'toggleReminderRepeat' },
    { type: 'setAuxClass', on: true }, // ist schon an
    { type: 'markAllRead' },
  ]
}

/** Jede gemockte Schreibfunktion — dieselbe Menge, die `persist` benutzt. */
function schreiber(): Array<[string, { mockClear: () => void }]> {
  const out: Array<[string, { mockClear: () => void }]> = []
  for (const [name, wert] of Object.entries(data)) {
    if (vi.isMockFunction(wert)) out.push([name, wert as { mockClear: () => void }])
  }
  return out
}

/** Die Woche, die vor der Aktion an derselben Stelle stand (über `start`). */
function vorher(weeks: Week[], week: Week): Week | undefined {
  return weeks.find((w) => w.start === week.start)
}

describe('Ein Leerlauf schreibt keine Woche', () => {
  beforeEach(() => {
    for (const [, fn] of schreiber()) fn.mockClear()
  })
  afterEach(() => vi.clearAllMocks())

  it('jede geschriebene Woche hat sich wirklich geändert', () => {
    const basis = reducer(initialState(), { type: 'hydrate', payload: ladung() })
    let s = basis
    let geschrieben = 0
    const verstoesse: string[] = []
    const saveWeek = data.saveWeek as unknown as ReturnType<typeof vi.fn>

    /*
      **Jede Aktion zweimal.** Der erste Lauf ändert etwas und darf schreiben;
      der zweite ist der Fall, den die Bedienung wirklich auslöst — dasselbe
      Thema noch einmal aus dem Feld heraus (`onBlur` schickt bei jedem
      Verlassen), dieselbe Liednummer, derselbe schon gesetzte Anlass. Dabei
      darf keine Woche mehr an die Datenbank gehen.
    */
    for (const action of folge(basis)) {
      for (const lauf of [1, 2]) {
        saveWeek.mockClear()
        const next = reducer(s, action)
        persist(s, next, action)
        for (const aufruf of saveWeek.mock.calls) {
          const week = aufruf[1] as Week
          geschrieben++
          if (vorher(s.weeks, week) === week) {
            verstoesse.push(`${action.type} (${lauf}. Lauf) → ${week.start} unverändert`)
          }
        }
        s = next
      }
    }

    // Gegenprobe: Wurde gar nichts geschrieben, prüfte der Test nichts.
    expect(geschrieben, 'keine einzige Woche geschrieben').toBeGreaterThan(3)
    expect(verstoesse, verstoesse.join(' · ')).toEqual([])
  })
})
