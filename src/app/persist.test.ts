import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { persist } from './persist'
import type { AppAction, AppState } from './context'
import { buildDemoFsWeeks, buildDemoWeeks, DEMO_FS_RULES, DEMO_PERSONS, DEMO_SERVICES, FS_BASE } from '../data/demo'
import type { Week } from '../data/types'

// Supabase truthy (Guard soll durchlassen) — kein echter Client/Netz.
vi.mock('../lib/supabase', () => ({ supabase: {} }))

// Gesamte Persistenz-Schicht mocken: wir prüfen NUR, welche Schreibfunktion
// mit welchen Argumenten je Aktion aufgerufen wird (kein echtes Supabase).
vi.mock('../lib/data', () => ({
  deleteAbsenceRow: vi.fn(),
  deleteConfirmationRows: vi.fn(),
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
}))

import * as data from '../lib/data'

function st(over: Partial<AppState> = {}): AppState {
  return {
    congregationId: 'c1',
    userId: 'u1',
    personId: 'p9',
    week: 0,
    tab: 'mid',
    weeks: buildDemoWeeks(),
    fsWeeks: buildDemoFsWeeks(),
    fsRules: [...DEMO_FS_RULES],
    fsBase: FS_BASE,
    services: [...DEMO_SERVICES],
    persons: [...DEMO_PERSONS],
    groups: [],
    members: [],
    invites: [],
    notifs: [],
    slotSel: null,
    selectedPersonId: null,
    congregation: { name: 'K', hall: 'H', meetings: 'M' },
    reminders: { first: 7, last: 1, repeat: false },
    congLang: 'Deutsch',
    progLangs: [],
    ...over,
  } as unknown as AppState
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
})
afterEach(() => {
  vi.runOnlyPendingTimers() // ausstehende Debounce-Writes leeren (Singleton-Writer)
  vi.useRealTimers()
})

describe('Guard', () => {
  it('ohne congregationId/userId wird nichts geschrieben', () => {
    persist(st({ congregationId: null }), st({ congregationId: null }), { type: 'markAllRead' })
    persist(st({ userId: null }), st({ userId: null }), { type: 'markAllRead' })
    expect(data.markNotificationsRead).not.toHaveBeenCalled()
  })
})

describe('Zuteilen', () => {
  it('assign (Programmpunkt) → saveWeek + Bestätigungen abräumen', () => {
    const prev = st({ slotSel: { kind: 'part', wi: 0, tab: 'mid', si: 1, ii: 1, ni: 0, priv: null, groups: false, label: 'X' } })
    const next = st()
    persist(prev, next, { type: 'assign', name: 'A' })
    expect(data.saveWeek).toHaveBeenCalledWith('c1', 0, next.weeks[0])
    expect(data.deleteConfirmationRows).toHaveBeenCalled()
  })

  it('assign (Treffpunkt-Leiter) → saveFsWeek statt saveWeek', () => {
    const prev = st({ slotSel: { kind: 'fs', wi: 0, instId: 'x', label: '', priv: null, groups: false } })
    const next = st()
    persist(prev, next, { type: 'assign', name: 'A' })
    expect(data.saveFsWeek).toHaveBeenCalledWith('c1', 0, next.fsWeeks[0])
    expect(data.saveWeek).not.toHaveBeenCalled()
  })

  it('autoAssign → saveWeek + Bestätigungen abräumen', () => {
    const prev = st()
    const next = st()
    persist(prev, next, { type: 'autoAssign' })
    expect(data.saveWeek).toHaveBeenCalledWith('c1', 0, next.weeks[0])
    expect(data.deleteConfirmationRows).toHaveBeenCalled()
  })

  it('clearAssignments schreibt nur bei geänderten Wochen', () => {
    const shared = buildDemoWeeks()
    persist(st({ weeks: shared }), st({ weeks: shared }), { type: 'clearAssignments', scope: 'parts' })
    expect(data.saveWeek).not.toHaveBeenCalled() // gleiche Referenz → nichts
    persist(st({ weeks: shared }), st({ weeks: buildDemoWeeks() }), { type: 'clearAssignments', scope: 'parts' })
    expect(data.saveWeek).toHaveBeenCalled()
  })
})

describe('Treffpunkte', () => {
  it('fsInstUpdate/Remove speichern die betroffene Woche', () => {
    const next = st()
    persist(st(), next, { type: 'fsInstUpdate', wi: 2, id: 'x', patch: {} })
    expect(data.saveFsWeek).toHaveBeenCalledWith('c1', 2, next.fsWeeks[2])
    vi.clearAllMocks()
    persist(st(), next, { type: 'fsInstRemove', wi: 3, id: 'x' })
    expect(data.saveFsWeek).toHaveBeenCalledWith('c1', 3, next.fsWeeks[3])
  })

  it('fsInstAdd speichert die aktuelle Woche', () => {
    const next = st({ week: 1 })
    persist(st({ week: 1 }), next, { type: 'fsInstAdd', inst: {} as never })
    expect(data.saveFsWeek).toHaveBeenCalledWith('c1', 1, next.fsWeeks[1])
  })

  it('fsRuleAdd speichert Grundplan + alle Wochen', () => {
    const next = st()
    persist(st(), next, { type: 'fsRuleAdd', grp: '' })
    expect(data.saveFsRules).toHaveBeenCalledWith('c1', FS_BASE.toISOString().slice(0, 10), next.fsRules)
    expect((data.saveFsWeek as ReturnType<typeof vi.fn>).mock.calls.length).toBe(next.fsWeeks.length)
  })
})

describe('LAC / Import / Vortrag', () => {
  it('lacMove tauscht nur bei geänderten Wochen (inkl. Bestätigungs-Tausch)', () => {
    const shared = buildDemoWeeks()
    persist(st({ weeks: shared }), st({ weeks: shared }), { type: 'lacMove', si: 0, ii: 1, dir: 1 })
    expect(data.saveWeek).not.toHaveBeenCalled()
  })

  it('lacAdd/talkEdit/openingSong → saveWeek der aktuellen Woche', () => {
    const next = st()
    for (const action of [
      { type: 'lacAdd', si: 0, title: 'T' },
      { type: 'talkEdit', si: 0, ii: 0, title: 'T' },
      { type: 'openingSong', song: '5' },
    ] as AppAction[]) {
      vi.clearAllMocks()
      persist(st(), next, action)
      expect(data.saveWeek).toHaveBeenCalledWith('c1', 0, next.weeks[0])
    }
  })

  it('finishImport/addImportedWeek speichern die letzte Woche', () => {
    const next = st({ weeks: [...buildDemoWeeks(), { range: 'Neu' } as Week] })
    persist(st(), next, { type: 'finishImport' })
    expect(data.saveWeek).toHaveBeenCalledWith('c1', next.weeks.length - 1, next.weeks.at(-1))
  })

  it('mergeWeekAlt speichert die betroffene Woche', () => {
    const next = st()
    persist(st(), next, { type: 'mergeWeekAlt', wi: 1, alt: {} })
    expect(data.saveWeek).toHaveBeenCalledWith('c1', 1, next.weeks[1])
  })
})

describe('Personen (inkl. Debounce)', () => {
  it('addPerson → savePerson sofort', () => {
    const p = DEMO_PERSONS[0]
    persist(st(), st(), { type: 'addPerson', person: p })
    expect(data.savePerson).toHaveBeenCalledWith('c1', p)
  })

  it('updatePerson schreibt gebündelt (Debounce, nach 600 ms)', () => {
    const p = DEMO_PERSONS[0]
    persist(st(), st({ persons: [p, ...DEMO_PERSONS.slice(1)] }), { type: 'updatePerson', id: p.id, patch: { tel: '1' } })
    expect(data.savePerson).not.toHaveBeenCalled() // noch nicht
    vi.advanceTimersByTime(600)
    expect(data.savePerson).toHaveBeenCalledWith('c1', p)
  })

  it('updatePerson mit Planer-Recht spiegelt Konten/Codes sofort', () => {
    const p = DEMO_PERSONS[0]
    const next = st({
      members: [{ userId: 'm1', email: '', personId: p.id, planner: true }, { userId: 'u1', email: '', personId: p.id, planner: true }],
      invites: [{ id: 'i1', code: 'A', personId: p.id, planner: true }],
    })
    persist(st(), next, { type: 'updatePerson', id: p.id, patch: { planner: true } })
    expect(data.saveMemberRow).toHaveBeenCalledTimes(1) // eigenes Konto (u1) ausgenommen
    expect(data.saveInvitePlanner).toHaveBeenCalledWith('i1', true)
  })

  it('navigate löscht eine namenlose entfernte Person und flusht', () => {
    const prev = st({ selectedPersonId: 'ghost', persons: [...DEMO_PERSONS, { id: 'ghost' } as never] })
    const next = st({ selectedPersonId: 'ghost', persons: [...DEMO_PERSONS] })
    persist(prev, next, { type: 'navigate', screen: 'programm' })
    expect(data.deletePersonRow).toHaveBeenCalledWith('ghost')
  })

  it('removePerson löscht die Zeile und löst Konto-Verknüpfungen', () => {
    persist(
      st({ members: [{ userId: 'm1', email: '', personId: 'p1', planner: false }] }),
      st(),
      { type: 'removePerson', id: 'p1' },
    )
    expect(data.deletePersonRow).toHaveBeenCalledWith('p1')
    expect(data.saveMemberRow).toHaveBeenCalledWith(expect.objectContaining({ userId: 'm1', personId: null }))
  })
})

describe('Abwesenheiten / Dienste / Gruppen', () => {
  it('addAbsence / removeAbsence', () => {
    const abs = { id: 'a1', from: '', to: '', reason: '' }
    persist(st(), st(), { type: 'addAbsence', absence: abs })
    expect(data.saveAbsence).toHaveBeenCalledWith('c1', 'u1', 'p9', abs)
    persist(st(), st(), { type: 'removeAbsence', id: 'a1' })
    expect(data.deleteAbsenceRow).toHaveBeenCalledWith('a1')
  })

  it('addService / changeServiceCount / removeService', () => {
    const svc = { key: 'neu', name: 'N', count: 1, groups: false }
    persist(st(), st({ services: [...DEMO_SERVICES, svc] }), { type: 'addService', service: svc })
    expect(data.saveService).toHaveBeenCalledWith('c1', svc, DEMO_SERVICES.length)
    vi.clearAllMocks()
    const key = DEMO_SERVICES[0].key
    persist(st(), st(), { type: 'changeServiceCount', key, delta: 1 })
    expect(data.saveService).toHaveBeenCalledWith('c1', expect.objectContaining({ key }), 0)
    persist(st(), st(), { type: 'removeService', key: 'x' })
    expect(data.deleteServiceRow).toHaveBeenCalledWith('c1', 'x')
  })

  it('addGroup / updateGroup / removeGroup (inkl. grp-Auflösung)', () => {
    const g = { id: 'g9', name: 'G', ov: null, as: null }
    persist(st(), st(), { type: 'addGroup', group: g })
    expect(data.saveGroupRow).toHaveBeenCalledWith('c1', g)
    persist(st({ groups: [g] }), st({ groups: [{ ...g, ov: 'p1' }] }), { type: 'updateGroup', id: 'g9', patch: { ov: 'p1' } })
    expect(data.saveGroupRow).toHaveBeenCalledWith('c1', { ...g, ov: 'p1' })
    // removeGroup: ein Mitglied hatte grp='g9', jetzt null → savePersonGroup
    const before = { id: 'pm', grp: 'g9' } as never
    const after = { id: 'pm', grp: null } as never
    persist(st({ persons: [before] }), st({ persons: [after] }), { type: 'removeGroup', id: 'g9' })
    expect(data.deleteGroupRow).toHaveBeenCalledWith('g9')
    expect(data.savePersonGroup).toHaveBeenCalledWith(after)
  })
})

describe('Mitteilungen / Bestätigungen / Einstellungen / Mitglieder', () => {
  it('markAllRead / clearNotifs', () => {
    persist(st(), st(), { type: 'markAllRead' })
    expect(data.markNotificationsRead).toHaveBeenCalledWith('c1', 'u1')
    persist(st(), st(), { type: 'clearNotifs' })
    expect(data.deleteNotifications).toHaveBeenCalledWith('c1', 'u1')
  })

  it('confirmTask / declineTask schreiben den Status', () => {
    persist(st(), st(), { type: 'confirmTask', id: 'k1' })
    expect(data.saveConfirmation).toHaveBeenCalledWith('c1', 'u1', 'k1', 'bestätigt')
    persist(st(), st(), { type: 'declineTask', id: 'k2' })
    expect(data.saveConfirmation).toHaveBeenCalledWith('c1', 'u1', 'k2', 'verhindert')
  })

  it('Erinnerungen/Sprache → saveSettings', () => {
    for (const action of [
      { type: 'changeReminder', key: 'first', delta: 1 },
      { type: 'toggleReminderRepeat' },
      { type: 'setCongLang', name: 'Englisch' },
      { type: 'addProgLang', name: 'X' },
      { type: 'removeProgLang', name: 'X' },
    ] as AppAction[]) {
      vi.clearAllMocks()
      persist(st(), st(), action)
      expect(data.saveSettings).toHaveBeenCalledWith('c1', { reminders: expect.anything(), congLang: 'Deutsch', progLangs: [] })
    }
  })

  it('updateCongregation schreibt gebündelt (Debounce)', () => {
    persist(st(), st({ congregation: { name: 'Neu', hall: '', meetings: '' } }), { type: 'updateCongregation', patch: { name: 'Neu' } })
    expect(data.saveCongregationInfo).not.toHaveBeenCalled()
    vi.advanceTimersByTime(600)
    expect(data.saveCongregationInfo).toHaveBeenCalledWith('c1', { name: 'Neu', hall: '', meetings: '' })
  })

  it('updateMember / removeMember / addInvite / removeInvite', () => {
    const m = { userId: 'm1', email: '', personId: null, planner: true }
    persist(st({ members: [m] }), st({ members: [m] }), { type: 'updateMember', userId: 'm1', patch: { planner: true } })
    expect(data.saveMemberRow).toHaveBeenCalledWith(m)
    persist(st(), st(), { type: 'removeMember', userId: 'm1' })
    expect(data.deleteMemberRow).toHaveBeenCalledWith('m1')
    const inv = { id: 'i1', code: 'A', personId: null, planner: false }
    persist(st(), st(), { type: 'addInvite', invite: inv })
    expect(data.saveInvite).toHaveBeenCalledWith('c1', inv)
    persist(st(), st(), { type: 'removeInvite', id: 'i1' })
    expect(data.deleteInviteRow).toHaveBeenCalledWith('i1')
  })
})

describe('Mitteilungs-Fanout', () => {
  it('eine neue Mitteilung wird an die Planer verteilt', () => {
    const prev = st({ notifs: [] })
    const next = st({
      notifs: [{ id: 'n1', type: 'gesendet', title: 'T', text: 'B', time: '', read: false }],
      members: [{ userId: 'm1', email: '', personId: null, planner: true }, { userId: 'm2', email: '', personId: null, planner: false }],
    })
    persist(prev, next, { type: 'showToast', text: 'x' }) // Aktion ohne eigenen Save-Zweig
    expect(data.insertNotifications).toHaveBeenCalledWith('c1', ['m1'], 'gesendet', 'T', 'B')
  })
})
