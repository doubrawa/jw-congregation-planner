import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { persist } from './persist'
import type { AppAction, AppState } from './context'
import { buildDemoFsWeeks, buildDemoWeeks, DEMO_FS_RULES, DEMO_PERSONS, DEMO_SERVICES, FS_BASE } from '../data/testdaten'
import { syncAuxSlots } from '../data/aux-class'
import type { Week } from '../data/types'

// Supabase truthy (Guard soll durchlassen) — kein echter Client/Netz.
vi.mock('../lib/supabase', () => ({ supabase: {} }))

/*
 * Persistenz-Schicht mocken: Wir prüfen NUR, welche Schreibfunktion mit welchen
 * Argumenten je Aktion aufgerufen wird (kein echtes Supabase).
 *
 * Der echte Modulinhalt bleibt darunter liegen (`importActual`), weil dort auch
 * **reine** Helfer wohnen — `renameInWeeks` etwa, das der Reducer beim
 * Umbenennen einer Person braucht. Ohne ihn wäre der Vorher/Nachher-Stand, den
 * die Entzugs-Prüfung unten sieht, von Hand nachgebaut statt echt.
 *
 * **Jede** Funktion, die `persist` aufruft, ist darunter überschrieben — die
 * Liste unten deckt sich mit der Importliste in persist.ts. Bliebe eine übrig,
 * liefe sie gegen den leeren Supabase-Stub und flöge.
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
    // Ohne Bestätigungen kann nichts entzogen werden — die Prüfung auf
    // zurückgezogene Zusagen (T99) liest sie bei jeder Wochen-Änderung.
    confirmations: {},
    sentLog: {},
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

  it('im Offline-Stand (staleAt) wird nichts geschrieben', () => {
    // Zweite Absicherung hinter readonly.ts: auf veraltetem Stand darf keine
    // Schreibfunktion laufen, egal über welchen Pfad die Aktion kam.
    persist(st({ staleAt: 1_700_000_000_000 }), st({ staleAt: 1_700_000_000_000 }), { type: 'markAllRead' })
    const prev = st({ staleAt: 1, slotSel: { kind: 'part', wi: 0, tab: 'mid', si: 1, ii: 1, ni: 0, priv: null, groups: false, label: 'X' } })
    persist(prev, st({ staleAt: 1 }), { type: 'assign', name: 'A' })
    expect(data.markNotificationsRead).not.toHaveBeenCalled()
    expect(data.saveWeek).not.toHaveBeenCalled()
  })
})

describe('Zuteilen', () => {
  it('assign (Programmpunkt) → saveWeek + Bestätigungen abräumen', () => {
    const prev = st({ slotSel: { kind: 'part', wi: 0, tab: 'mid', si: 1, ii: 1, ni: 0, priv: null, groups: false, label: 'X' } })
    const next = st()
    persist(prev, next, { type: 'assign', name: 'A' })
    expect(data.saveWeek).toHaveBeenCalledWith('c1', next.weeks[0])
    expect(data.deleteConfirmationRows).toHaveBeenCalled()
  })

  it('assign (Treffpunkt-Leiter) → saveFsWeek statt saveWeek', () => {
    const prev = st({ slotSel: { kind: 'fs', wi: 0, instId: 'x', label: '', priv: null, groups: false } })
    const next = st()
    persist(prev, next, { type: 'assign', name: 'A' })
    expect(data.saveFsWeek).toHaveBeenCalledWith('c1', next.weeks[0]?.start, next.fsWeeks[0])
    expect(data.saveWeek).not.toHaveBeenCalled()
  })

  it('autoAssign → saveWeek + Bestätigungen abräumen', () => {
    const prev = st()
    const next = st()
    persist(prev, next, { type: 'autoAssign' })
    expect(data.saveWeek).toHaveBeenCalledWith('c1', next.weeks[0])
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
    expect(data.saveFsWeek).toHaveBeenCalledWith('c1', next.weeks[2]?.start, next.fsWeeks[2])
    vi.clearAllMocks()
    persist(st(), next, { type: 'fsInstRemove', wi: 3, id: 'x' })
    expect(data.saveFsWeek).toHaveBeenCalledWith('c1', next.weeks[3]?.start, next.fsWeeks[3])
  })

  it('fsInstAdd speichert die aktuelle Woche', () => {
    const next = st({ week: 1 })
    persist(st({ week: 1 }), next, { type: 'fsInstAdd', inst: {} as never })
    expect(data.saveFsWeek).toHaveBeenCalledWith('c1', next.weeks[1]?.start, next.fsWeeks[1])
  })

  // Gebündelt: der Ort ist ein Freitextfeld, und ohne Bündelung ging je
  // Tastenanschlag der Grundplan samt jeder erzeugten Woche an die Datenbank.
  it('fsRuleAdd speichert Grundplan + alle Wochen (gebündelt)', () => {
    const next = st()
    persist(st(), next, { type: 'fsRuleAdd', grp: '' })
    expect(data.saveFsRules).not.toHaveBeenCalled() // erst nach der Bündelung
    vi.advanceTimersByTime(600)
    expect(data.saveFsRules).toHaveBeenCalledWith('c1', FS_BASE.toISOString().slice(0, 10), next.fsRules)
    expect((data.saveFsWeek as ReturnType<typeof vi.fn>).mock.calls.length).toBe(next.fsWeeks.length)
  })

  /*
    Gespeichert wird unter der **Kennung der Woche**, nicht unter ihrem Index
    (T66). Hier stand bis dahin der umgekehrte Test: „lässt Wochen unterhalb von
    `weekFrom` aus" — Platzhalter, deren Zeilen in der Datenbank echte
    Treffpunkte enthielten und nicht geleert werden durften. Die gibt es nicht
    mehr; jede geladene Woche ist eine echte.
  */
  it('fsRuleAdd schreibt jede Woche unter ihre Kennung', () => {
    const next = st()
    persist(st(), next, { type: 'fsRuleAdd', grp: '' })
    vi.advanceTimersByTime(600)
    const kennungen = (data.saveFsWeek as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[1])
    expect(kennungen).toEqual(next.weeks.map((w) => w.start))
  })

  /*
    Der Ort einer Regel ist ein Freitextfeld: `fsRuleUpdate` kam je
    Tastenanschlag. Ungebündelt hieß das ein Grundplan-Upsert **plus** ein
    Upsert je materialisierter Woche — für einen fünfzehn Zeichen langen
    Ortsnamen mehrere Hundert Anfragen, während der Benutzer noch tippt.
  */
  it('mehrere Tastenanschläge werden zu einem Schreibvorgang gebündelt', () => {
    const next = st()
    for (const ort of ['S', 'Sa', 'Saa', 'Saal']) {
      persist(st(), next, { type: 'fsRuleUpdate', id: 'r1', patch: { place: ort } })
    }
    expect(data.saveFsRules).not.toHaveBeenCalled()
    vi.advanceTimersByTime(600)
    expect(data.saveFsRules).toHaveBeenCalledTimes(1)
  })

  it('unveränderte Treffpunkt-Wochen werden nicht geschrieben', () => {
    // Gleiche Referenz auf beiden Seiten = nichts hat sich geändert. Vorher
    // ging trotzdem jede der Wochen einzeln an die Datenbank.
    const gemeinsam = st().fsWeeks
    const prev = st({ fsWeeks: gemeinsam })
    persist(prev, st({ fsWeeks: gemeinsam }), { type: 'fsRuleUpdate', id: 'r1', patch: { place: 'X' } })
    vi.advanceTimersByTime(600)
    expect(data.saveFsWeek).not.toHaveBeenCalled()
  })

  it('ohne die Woche selbst wird ihr Treffpunkt-Blatt nicht geschrieben', () => {
    // Die Kennung steht bei der Woche. Fehlt sie, gäbe es nichts zu bezeichnen
    // — und ein Schreibversuch träfe entweder nichts oder das Falsche.
    const next = st({ weeks: [] })
    persist(st({ weeks: [] }), next, { type: 'fsRuleAdd', grp: '' })
    vi.advanceTimersByTime(600)
    expect(data.saveFsWeek).not.toHaveBeenCalled()
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
      expect(data.saveWeek).toHaveBeenCalledWith('c1', next.weeks[0])
    }
  })

  it('finishImport/addImportedWeek speichern die letzte Woche', () => {
    const next = st({ weeks: [...buildDemoWeeks(), { range: 'Neu' } as Week] })
    persist(st(), next, { type: 'finishImport' })
    expect(data.saveWeek).toHaveBeenCalledWith('c1', next.weeks.at(-1))
  })

  it('mergeWeekAlt speichert die betroffene Woche', () => {
    const next = st()
    persist(st(), next, { type: 'mergeWeekAlt', wi: 1, alt: {} })
    expect(data.saveWeek).toHaveBeenCalledWith('c1', next.weeks[1])
  })
})

/*
 * Ein Index aus einer Aktion muss nicht mehr im geladenen Fenster stehen — eine
 * Lücke (T35), eine Woche, die zwischen Auswahl und Speichern herausgerutscht
 * ist. `weeks[wi]` ist dann undefined. Ungeprüft ging genau das an saveWeek,
 * und die liest als Erstes `week.stub`: TypeError mitten im Dispatch. Deshalb
 * hier für jeden Weg eine Probe mit einem Index, den es nicht gibt (T42).
 */
describe('Index außerhalb des Fensters', () => {
  const WEIT_DRAUSSEN = 99

  it('assign auf eine Woche, die es nicht gibt, schreibt nichts', () => {
    const sel = { kind: 'part', wi: WEIT_DRAUSSEN, tab: 'mid', si: 1, ii: 1, ni: 0, priv: null, groups: false, label: 'X' } as const
    const prev = st({ slotSel: sel })
    expect(() => persist(prev, st({ slotSel: sel }), { type: 'assign', name: 'A' })).not.toThrow()
    expect(data.saveWeek).not.toHaveBeenCalled()
    expect(data.deleteConfirmationRows).not.toHaveBeenCalled()
  })

  it('assign auf einen Treffpunkt, den es nicht gibt, schreibt nichts', () => {
    const sel = { kind: 'fs', wi: WEIT_DRAUSSEN, instId: 'x', label: '', priv: null, groups: false } as const
    persist(st({ slotSel: sel }), st({ slotSel: sel }), { type: 'assign', name: 'A' })
    expect(data.saveFsWeek).not.toHaveBeenCalled()
  })

  it('mergeWeekAlt auf eine Woche, die es nicht gibt, schreibt nichts', () => {
    persist(st(), st(), { type: 'mergeWeekAlt', wi: WEIT_DRAUSSEN, alt: {} })
    expect(data.saveWeek).not.toHaveBeenCalled()
  })

  it('fsInstUpdate auf eine Woche, die es nicht gibt, schreibt nichts', () => {
    persist(st(), st(), { type: 'fsInstUpdate', wi: WEIT_DRAUSSEN, id: 'x', patch: {} })
    expect(data.saveFsWeek).not.toHaveBeenCalled()
  })

  it('lacMove/lacAdd auf einen Abschnitt, den es nicht gibt, stürzt nicht ab', () => {
    // Die Woche gibt es, den Abschnitt nicht: hier bricht die Kette erst im
    // zweiten Glied — die Woche wird gespeichert, die Bestätigungsrechnung
    // entfällt.
    const next = st()
    expect(() =>
      persist(st(), next, { type: 'lacMove', si: WEIT_DRAUSSEN, ii: 0, dir: 1 }),
    ).not.toThrow()
    expect(data.swapConfirmationKeys).not.toHaveBeenCalled()
    vi.clearAllMocks()
    expect(() =>
      persist(st(), next, { type: 'lacAdd', si: WEIT_DRAUSSEN, title: 'T' }),
    ).not.toThrow()
    expect(data.renameConfirmationKeys).not.toHaveBeenCalled()
  })

  it('finishImport ohne eine einzige Woche schreibt nichts', () => {
    persist(st({ weeks: [] }), st({ weeks: [] }), { type: 'finishImport' })
    expect(data.saveWeek).not.toHaveBeenCalled()
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

  /*
    Gebündelt wird je **Woche**, nicht je Index (T66).

    Der Unterschied wird erst sichtbar, wenn sich die geladene Menge zwischen
    zwei Änderungen verschiebt — beim stillen Nachladen nach einem
    Schreibkonflikt etwa, das eine ältere Woche mitbringt. Dieselbe Woche steht
    dann an einem anderen Index. Über den Index gebündelt lägen zwei Einträge in
    der Warteschlange, und der ältere schriebe seine überholte Fassung
    hinterher; über die Kennung gebündelt bleibt es bei einem.
  */
  it('bündelt dieselbe Woche auch dann, wenn ihr Index sich verschoben hat', () => {
    const p = DEMO_PERSONS[0]!
    const [w0, w1] = [buildDemoWeeks()[0]!, buildDemoWeeks()[1]!]
    const aendern = (w: Week): Week => ({ ...w, book: `${w.book}!` })
    // Erst steht w1 an Index 1 …
    const vorher = st({ weeks: [w0, w1] })
    const neuer1 = aendern(w1)
    persist(vorher, st({ weeks: [w0, neuer1] }), { type: 'updatePerson', id: p.id, patch: { ln: 'A' } })
    // … dann ist w0 aus dem Fenster gerutscht und w1 steht an Index 0.
    const neuer2 = aendern(neuer1)
    persist(st({ weeks: [neuer1] }), st({ weeks: [neuer2] }), { type: 'updatePerson', id: p.id, patch: { ln: 'B' } })

    vi.advanceTimersByTime(600)
    expect(data.saveWeek).toHaveBeenCalledTimes(1)
    expect(data.saveWeek).toHaveBeenCalledWith('c1', neuer2)
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
    const abs = { id: 'a1', personId: 'p9', userId: 'u1', from: '', to: '', reason: '' }
    persist(st(), st(), { type: 'addAbsence', absence: abs })
    expect(data.saveAbsence).toHaveBeenCalledWith('c1', abs)
    persist(st(), st(), { type: 'removeAbsence', id: 'a1' })
    expect(data.deleteAbsenceRow).toHaveBeenCalledWith('a1')
  })

  it('addAbsence für eine ANDERE Person geht auch an diese Person', () => {
    /*
     * Der Planer trägt im Personen-Detail für jemand anderen ein. Die
     * Effekt-Schicht hat dabei früher `state.personId` mitgegeben — die eigene
     * Person des Angemeldeten. Die Zeile wäre auf dem Planer gelandet, und
     * gemerkt hätte es niemand: In seiner Liste taucht sie nicht auf (die
     * filtert seit T93 über die Person), beim Gemeinten auch nicht.
     */
    const fremd = { id: 'a2', personId: 'p-anders', userId: 'u1', from: '', to: '', reason: '' }
    persist(st(), st(), { type: 'addAbsence', absence: fremd })
    expect(data.saveAbsence).toHaveBeenCalledWith('c1', fremd)
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

  it('updateCongregation speichert die Wochen, deren Endzeit mitgewandert ist', () => {
    // Die Endzeit steht in der Wochenzeile, nicht in den Einstellungen: ohne
    // dieses saveWeek stünde nach dem nächsten Laden wieder die alte da.
    const prev = st()
    // Nur Position 1 bekommt ein neues Objekt — der Reducer gibt unveränderte
    // Wochen identisch zurück, und genau daran erkennt die Persistenz sie.
    const weeks = [...prev.weeks]
    weeks[1] = { ...weeks[1], mid: { ...weeks[1].mid, end: 'Ende ca. 20:15' } }
    persist(prev, st({ weeks, congregation: { name: 'K', hall: 'H', meetings: 'Di 18:30 · So 10:00' } }), {
      type: 'updateCongregation',
      patch: { meetings: 'Di 18:30 · So 10:00' },
    })
    expect(data.saveWeek).toHaveBeenCalledTimes(1) // nur die eine geänderte
    expect(data.saveWeek).toHaveBeenCalledWith('c1', weeks[1])
  })

  it('updateCongregation ohne Zeitänderung schreibt keine Woche', () => {
    const prev = st()
    persist(prev, st({ weeks: prev.weeks, congregation: { name: 'Neu', hall: 'H', meetings: 'M' } }), {
      type: 'updateCongregation',
      patch: { name: 'Neu' },
    })
    expect(data.saveWeek).not.toHaveBeenCalled()
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
  /** Wie der Reducer sie erzeugt: mit `local`-Kennzeichen. */
  const hier = { id: 'n1', type: 'gesendet' as const, title: 'T', text: 'B', at: '2026-09-14T10:00:00Z', read: false, local: true as const }
  /** Wie sie aus der Datenbank kommt: ohne Kennzeichen. */
  const geladen = { id: 'n2', type: 'gesendet' as const, title: 'T', text: 'B', at: '2026-09-14T10:00:00Z', read: false }
  const planer = [{ userId: 'm1', email: '', personId: null, planner: true }]

  it('eine hier entstandene Mitteilung geht an die Planer', () => {
    persist(st({ notifs: [] }), st({ notifs: [hier], members: planer }), { type: 'declineTask', id: 'x' })
    expect(data.insertNotifications).toHaveBeenCalledWith('c1', ['m1'], 'gesendet', 'T', 'B')
  })

  it('Laden aus der Datenbank verteilt NICHTS', () => {
    // Der Fehler: frueher haengte das Verteilen daran, dass die Liste laenger
    // geworden ist. Auf `hydrate` trifft das ebenfalls zu — es bringt die
    // gespeicherten Mitteilungen mit. Aus jedem Laden wurde so eine neue, die
    // beim naechsten Laden wieder mitkam; der Zaehler wuchs bei jeder
    // Aktualisierung um eins.
    persist(st({ notifs: [] }), st({ notifs: [geladen], members: planer }), {
      type: 'hydrate',
      payload: {} as never,
    })
    expect(data.insertNotifications).not.toHaveBeenCalled()
  })

  it('dieselbe Mitteilung wird nicht zweimal verteilt', () => {
    // Jede Aktion laeuft durch persist; nur das ERSTE Auftreten zaehlt.
    persist(st({ notifs: [hier], members: planer }), st({ notifs: [hier], members: planer }), {
      type: 'showToast',
      text: 'x',
    })
    expect(data.insertNotifications).not.toHaveBeenCalled()
  })

  it('unabhaengig von der Aktion — das Kennzeichen entscheidet', () => {
    // Genau das ist der Gewinn: wer kuenftig eine Aktion mit Mitteilung
    // ergaenzt, muss an keiner zweiten Stelle etwas eintragen.
    persist(st({ notifs: [] }), st({ notifs: [hier], members: planer }), { type: 'autoAssign' })
    expect(data.insertNotifications).toHaveBeenCalledTimes(1)
  })
})

/*
 * **Wann eine Nachricht „Zuteilung zurückgezogen" hinausgeht — und wann nicht.**
 *
 * Der Auslöser steht am Ende von `persist` und liest den Vorher/Nachher-Stand
 * der Wochen. Genau darin lag die Gefahr, und genau die prüfen die Fälle hier:
 * Die reine Rechenfunktion (`entzogeneZusagen`) hatte ihre Tests, der Auslöser
 * keinen — und deshalb fiel lange nicht auf, dass ganz andere Vorgänge als das
 * Umteilen denselben Vorher/Nachher-Unterschied erzeugen.
 *
 * Der teure Fehler ist hier die **falsche** Nachricht: Wer erfährt, ihm sei
 * etwas genommen worden, hört auf vorzubereiten. Deshalb steht unter jedem
 * Fall, der schweigen muss, auch einer, der reden muss — sonst wäre die
 * Prüfung mit einem `return []` zu bestehen.
 */
describe('Entzug einer bestätigten Zusage: der Auslöser', () => {
  const MONTAG = '2026-09-07'
  const SCHLUESSEL = `${MONTAG}|mid|part|i-lesung|0`
  const AUX_SCHLUESSEL = `${MONTAG}|mid|aux|i-lesung|0`
  const RATGEBER = `${MONTAG}|mid|ratgeber`

  /** Eine Woche mit einem Schülerteil im Hauptsaal und in der Zweitklasse. */
  function wocheMitKlasse(): Week {
    return {
      range: '7.–13. September',
      book: '',
      start: MONTAG,
      current: true,
      mid: {
        date: '',
        end: '',
        sections: [
          {
            label: 'SCHÄTZE AUS GOTTES WORT',
            kind: 'schatz',
            items: [
              {
                iid: 'i-lesung',
                title: 'Bibellesung',
                mins: 4,
                names: [{ name: 'A. Berg', rolle: '', pid: 'pA' }],
                aux: [{ name: 'K. Zwei', rolle: '', pid: 'pK' }],
              },
            ],
          },
        ],
        helpers: {},
        auxRatgeber: { name: 'R. Geber', rolle: '', pid: 'pR' },
      },
      we: { date: '', end: '', sections: [], helpers: {} },
    } as unknown as Week
  }

  const bestaetigt = {
    [SCHLUESSEL]: 'bestätigt',
    [AUX_SCHLUESSEL]: 'bestätigt',
    [RATGEBER]: 'bestätigt',
  } as const

  /** Zustand mit **einer** Woche — sonst mischen sich die Demo-Wochen ein. */
  function mitWoche(week: Week, over: Partial<AppState> = {}): AppState {
    return st({
      weeks: [week],
      fsWeeks: [[]],
      services: [],
      confirmations: { ...bestaetigt },
      ...over,
    })
  }

  it('das Umteilen eines bestätigten Platzes meldet — mit Person-Id', () => {
    // Die Gegenprobe zu allem Folgenden: Der Weg funktioniert überhaupt.
    const vorher = wocheMitKlasse()
    const nachher = wocheMitKlasse()
    const punkt = nachher.mid.sections[0]?.items[0] as { names: { name: string; pid?: string }[] }
    punkt.names[0] = { name: 'B. Neu', pid: 'pB' }

    persist(mitWoche(vorher), mitWoche(nachher), { type: 'assign', name: 'B. Neu' })

    expect(data.sendPlanEntzug).toHaveBeenCalledTimes(1)
    // Die Id muss mit: Zwei Gleichnamige bekämen sonst gegenseitig die
    // Nachricht des anderen — die Function stellt danach zu.
    expect(data.sendPlanEntzug).toHaveBeenCalledWith([
      {
        key: SCHLUESSEL,
        name: 'A. Berg',
        pid: 'pA',
        label: expect.any(String),
        datum: expect.any(String),
      },
    ])
  })

  it('mehrere Entzüge derselben Änderung gehen in EINEM Aufruf hinaus', () => {
    /*
     * Je Entzug ein eigener Aufruf hieß: Die Function las für jeden davon
     * aufs Neue alle Mitglieder, Personen und Push-Abos der Versammlung. Eine
     * Auto-Zuteilung fasst aber die ganze Zusammenkunft an — aus einer
     * Handlung wurden ein Dutzend voller Aufrufe.
     *
     * Geprüft wird deshalb die **Zahl der Aufrufe**, nicht nur ihr Inhalt:
     * Die alte Fassung bestünde jede Inhaltsprüfung und fiele nur hier.
     */
    const vorher = wocheMitKlasse()
    const nachher = wocheMitKlasse()
    const punkt = nachher.mid.sections[0]?.items[0] as {
      names: { name: string; pid?: string }[]
      aux: { name: string; pid?: string }[]
    }
    punkt.names[0] = { name: 'B. Neu', pid: 'pB' }
    punkt.aux[0] = { name: 'C. Neu', pid: 'pC' }

    persist(mitWoche(vorher), mitWoche(nachher), { type: 'autoAssign' })

    expect(data.sendPlanEntzug).toHaveBeenCalledTimes(1)
    const liste = (data.sendPlanEntzug as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0] as Array<{ key: string }>
    expect(liste.map((z) => z.key).sort()).toEqual([SCHLUESSEL, AUX_SCHLUESSEL].sort())
  })

  it('eine berichtigte Schreibweise des Namens meldet nichts', () => {
    /*
     * Der teuerste der falschen Fälle: Personenfelder lösen **je
     * Tastenanschlag** aus, und der Reducer zieht den neuen Namen durch alle
     * geladenen Wochen (`renameInWeeks`). Am Namen verglichen sah das aus wie
     * „ein anderer sitzt jetzt dort" — und weil die Datenbank wegen der
     * Verzögerung noch den alten Namen führte, kam die Nachricht auch wirklich
     * bei der Person an, deren Namen man gerade berichtigte.
     */
    const vorher = wocheMitKlasse()
    const umbenannt = data.renameInWeeks([vorher], 'pA', 'A. Berg', 'A. Bergh')[0] as Week

    persist(mitWoche(vorher), mitWoche(umbenannt), {
      type: 'updatePerson',
      id: 'pA',
      patch: { ln: 'Bergh' },
    })

    expect(data.sendPlanEntzug).not.toHaveBeenCalled()
  })

  it('das Abschalten der Zusätzlichen Klasse meldet nichts', () => {
    /*
     * Beim Ausschalten bleiben die Namen der Klasse absichtlich stehen — der
     * Reducer nimmt nur die Marke `auxRatgeber` weg, damit ein Fehlgriff nicht
     * die Planung mehrerer Wochen kostet. Danach zählt die Aufzählung den Raum
     * nicht mehr auf. Das ist kein Entzug, sondern ein abwesender Raum: Die
     * Zuteilungen ruhen, sie sind nicht verwaist.
     */
    const vorher = wocheMitKlasse()
    const nachher = syncAuxSlots([vorher], false)[0] as Week

    persist(mitWoche(vorher), mitWoche(nachher), { type: 'setAuxClass', on: false })

    expect(data.sendPlanEntzug).not.toHaveBeenCalled()
  })

  it('eine ausgefallene Zusammenkunft meldet nichts', () => {
    /*
     * Der Regelfall dafür ist die Kongress-Woche: Dort fallen **alle**
     * Zusammenkünfte aus, planmäßig und jedes Jahr. Ohne diese Prüfung ginge
     * an die halbe Versammlung „Zuteilung zurückgezogen" — und beim
     * Zurücknehmen des Hakens käme keine Berichtigung hinterher.
     */
    const vorher = wocheMitKlasse()
    const nachher = { ...vorher, dev: { mid: { cancelled: true } } } as unknown as Week

    persist(mitWoche(vorher), mitWoche(nachher), {
      type: 'setAbweichung',
      tab: 'mid',
      dev: { cancelled: true },
    } as unknown as AppAction)

    expect(data.sendPlanEntzug).not.toHaveBeenCalled()
  })

  it('ein Neuladen meldet nichts, auch wenn der Bestand ein anderer ist', () => {
    // `hydrate` ersetzt alles auf einmal. Zählte es mit, brächte jedes
    // Nachladen nach einem Schreibkonflikt ganze Wochen voller Entzüge hervor.
    persist(mitWoche(wocheMitKlasse()), mitWoche({ ...wocheMitKlasse(), mid: { date: '', end: '', sections: [], helpers: {} } } as unknown as Week), {
      type: 'hydrate',
      payload: {} as never,
    })
    expect(data.sendPlanEntzug).not.toHaveBeenCalled()
  })

  it('unbestätigte Zuteilungen bleiben still — sie sind Entwurf', () => {
    const vorher = wocheMitKlasse()
    const nachher = wocheMitKlasse()
    const punkt = nachher.mid.sections[0]?.items[0] as { names: { name: string; pid?: string }[] }
    punkt.names[0] = { name: 'B. Neu', pid: 'pB' }

    persist(mitWoche(vorher, { confirmations: {} }), mitWoche(nachher, { confirmations: {} }), {
      type: 'assign',
      name: 'B. Neu',
    })

    expect(data.sendPlanEntzug).not.toHaveBeenCalled()
  })
})
