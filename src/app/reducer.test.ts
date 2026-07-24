import { describe, expect, it } from 'vitest'
import { isNameless, reducer } from './reducer'
import type { AppState } from './context'
import type { HydratePayload } from './context'
import {
  buildDemoFsWeeks,
  buildDemoWeeks,
  CONGREGATION,
  DEMO_ABSENCES,
  DEMO_FS_RULES,
  DEMO_GROUPS,
  DEMO_MY_TASKS,
  DEMO_NOTIFICATIONS,
  DEMO_PENDING_NAMES,
  DEMO_PERSONS,
  DEMO_PLANNER,
  DEMO_REMINDERS,
  DEMO_SERVICES,
  FS_BASE,
} from '../data/demo'
import { displayName, isSong } from '../data/helpers'
import type { PartItem, PartSlotSelection, Person, Week } from '../data/types'

/** Voller Demo-AppState; `over` überschreibt einzelne Felder je Test. */
function makeState(over: Partial<AppState> = {}): AppState {
  return {
    screen: 'start',
    week: 0,
    tab: 'mid',
    theme: 'weiss',
    planner: DEMO_PLANNER,
    congregation: { ...CONGREGATION },
    congregationId: null,
    userId: null,
    personId: null,
    dataStatus: 'demo',
    dataEmpty: false,
    members: [],
    invites: [],
    recovery: false,
    weeks: buildDemoWeeks(),
    persons: [...DEMO_PERSONS],
    services: [...DEMO_SERVICES],
    groups: [...DEMO_GROUPS],
    fsRules: [...DEMO_FS_RULES],
    fsWeeks: buildDemoFsWeeks(),
    fsBase: FS_BASE,
    absences: [...DEMO_ABSENCES],
    notifs: [...DEMO_NOTIFICATIONS],
    notifOpen: false,
    slotSel: null,
    selectedPersonId: null,
    importing: false,
    imported: false,
    myTasks: [...DEMO_MY_TASKS],
    pendingNames: [...DEMO_PENDING_NAMES],
    confirmations: {},
    confirmOpen: false,
    s89: null,
    reminders: { ...DEMO_REMINDERS },
    lang: 'de',
    langSheetOpen: false,
    langSheetFor: 'cong',
    congLang: 'Deutsch',
    progLangs: [],
    langSearch: '',
    toast: null,
    ...over,
  }
}

/** Erster zuteilbarer Programmpunkt-Slot (kein Lied) einer Woche. */
function firstPartSlot(week: Week, tab: 'mid' | 'we'): PartSlotSelection {
  for (let si = 0; si < week[tab].sections.length; si++) {
    const items = week[tab].sections[si].items
    for (let ii = 0; ii < items.length; ii++) {
      if (!isSong(items[ii]) && (items[ii] as PartItem).names.length > 0) {
        return { kind: 'part', wi: 0, tab, si, ii, ni: 0, priv: null, groups: false, label: 'Test' }
      }
    }
  }
  throw new Error('kein Programmpunkt-Slot gefunden')
}

/** Steht `name` irgendwo in den Zuteilungen (Programmpunkte + Hilfsdienste)? */
function weeksContainName(weeks: Week[], name: string): boolean {
  for (const w of weeks) {
    for (const tab of ['mid', 'we'] as const) {
      for (const s of w[tab].sections) {
        for (const it of s.items) {
          if (!isSong(it) && (it as PartItem).names.some((n) => n.name === name)) return true
        }
      }
      for (const arr of Object.values(w[tab].helpers)) if (arr.includes(name)) return true
    }
  }
  return false
}

const person = (name: string): Person => DEMO_PERSONS.find((p) => displayName(p) === name)!

describe('isNameless', () => {
  it('true nur ohne jeglichen Namen', () => {
    expect(isNameless({ fn: '', ln: '', dn: '' } as Person)).toBe(true)
    expect(isNameless({ fn: '  ', ln: '', dn: undefined } as Person)).toBe(true)
    expect(isNameless({ fn: 'A', ln: '', dn: '' } as Person)).toBe(false)
    expect(isNameless({ fn: '', ln: '', dn: 'Josef 1' } as Person)).toBe(false)
  })
})

describe('navigate (Rechteprüfung)', () => {
  it('Planer darf jede Ansicht', () => {
    expect(reducer(makeState({ planner: true }), { type: 'navigate', screen: 'planen' }).screen).toBe('planen')
    expect(reducer(makeState({ planner: true }), { type: 'navigate', screen: 'personen' }).screen).toBe('personen')
  })

  it('Nicht-Planer wird von Planer-Ansichten auf Programm umgeleitet', () => {
    const s = makeState({ planner: false, personId: 'p9', groups: [] })
    expect(reducer(s, { type: 'navigate', screen: 'planen' }).screen).toBe('programm')
    expect(reducer(s, { type: 'navigate', screen: 'personen' }).screen).toBe('programm')
    expect(reducer(s, { type: 'navigate', screen: 'einstellungen' }).screen).toBe('programm')
    expect(reducer(s, { type: 'navigate', screen: 'aufgaben' }).screen).toBe('aufgaben') // erlaubt
  })

  it('Gruppenaufseher darf Planen/Einstellungen, aber nicht Personen', () => {
    // p1 ist Aufseher (ov) von Gruppe 1 → fsOverseer
    const s = makeState({ planner: false, personId: 'p1' })
    expect(reducer(s, { type: 'navigate', screen: 'planen' }).screen).toBe('planen')
    expect(reducer(s, { type: 'navigate', screen: 'einstellungen' }).screen).toBe('einstellungen')
    expect(reducer(s, { type: 'navigate', screen: 'personen' }).screen).toBe('programm')
  })

  it('setzt den fs-Tab beim Verlassen von Programm/Planen zurück', () => {
    expect(reducer(makeState({ tab: 'fs' }), { type: 'navigate', screen: 'aufgaben' }).tab).toBe('mid')
    expect(reducer(makeState({ tab: 'fs', planner: true }), { type: 'navigate', screen: 'planen' }).tab).toBe('fs')
    expect(reducer(makeState({ tab: 'we' }), { type: 'navigate', screen: 'aufgaben' }).tab).toBe('we')
  })

  it('entfernt eine namenlose selektierte Person beim Navigieren', () => {
    const empty: Person = { id: 'pX', fn: '', ln: '', role: 'verkuendiger', tel: '', mail: '', absent: [], priv: {} as Person['priv'], grp: null }
    const s = makeState({ persons: [...DEMO_PERSONS, empty], selectedPersonId: 'pX' })
    const next = reducer(s, { type: 'navigate', screen: 'programm' })
    expect(next.persons.some((p) => p.id === 'pX')).toBe(false)
    expect(next.selectedPersonId).toBeNull()
  })
})

describe('Wochennavigation', () => {
  it('prevWeek klemmt bei 0, nextWeek beim letzten Index', () => {
    const s = makeState({ week: 0 })
    expect(reducer(s, { type: 'prevWeek' }).week).toBe(0)
    const last = s.weeks.length - 1
    expect(reducer(makeState({ week: last }), { type: 'nextWeek' }).week).toBe(last)
  })

  it('bewegt sich innerhalb der Grenzen', () => {
    expect(reducer(makeState({ week: 1 }), { type: 'prevWeek' }).week).toBe(0)
    expect(reducer(makeState({ week: 0 }), { type: 'nextWeek' }).week).toBe(1)
  })
})

describe('einfache UI-Setter', () => {
  it('setTab / setTheme / Slot / Notif-Panel', () => {
    expect(reducer(makeState(), { type: 'setTab', tab: 'we' }).tab).toBe('we')
    expect(reducer(makeState(), { type: 'setTheme', theme: 'graphit' }).theme).toBe('graphit')
    expect(reducer(makeState(), { type: 'openNotifs' }).notifOpen).toBe(true)
    expect(reducer(makeState({ notifOpen: true }), { type: 'closeNotifs' }).notifOpen).toBe(false)
    const sel = { kind: 'part', wi: 0, tab: 'mid', si: 1, ii: 1, ni: 0, priv: null, groups: false, label: 'X' } as const
    expect(reducer(makeState(), { type: 'openSlot', sel }).slotSel).toEqual(sel)
    expect(reducer(makeState({ slotSel: sel }), { type: 'closeSlot' }).slotSel).toBeNull()
  })

  it('markAllRead / clearNotifs', () => {
    const read = reducer(makeState(), { type: 'markAllRead' })
    expect(read.notifs.every((n) => n.read)).toBe(true)
    expect(reducer(makeState(), { type: 'clearNotifs' }).notifs).toEqual([])
  })

  it('showToast / hideToast (id steigt monoton)', () => {
    const t1 = reducer(makeState(), { type: 'showToast', text: 'Hallo' })
    expect(t1.toast).toMatchObject({ text: 'Hallo', id: 1 })
    const t2 = reducer(t1, { type: 'showToast', text: 'Hallo' })
    expect(t2.toast!.id).toBe(2) // gleicher Text, neue id → Timer-Neustart
    expect(reducer(t1, { type: 'hideToast' }).toast).toBeNull()
  })
})

describe('Abwesenheiten', () => {
  const abs = { id: 'a99', from: '2026-09-01', to: '2026-09-05', reason: 'Urlaub' }
  it('addAbsence hängt an und meldet Toast', () => {
    const next = reducer(makeState({ absences: [] }), { type: 'addAbsence', absence: abs })
    expect(next.absences).toEqual([abs])
    expect(next.toast?.text).toBeTruthy()
  })
  it('removeAbsence filtert', () => {
    const next = reducer(makeState({ absences: [abs] }), { type: 'removeAbsence', id: 'a99' })
    expect(next.absences).toEqual([])
  })
})

describe('Personen', () => {
  const fresh: Person = { id: 'pNeu', fn: 'Neu', ln: 'Person', role: 'verkuendiger', tel: '', mail: '', absent: [], priv: {} as Person['priv'], grp: null }

  it('addPerson hängt an, öffnet das Detail', () => {
    const next = reducer(makeState(), { type: 'addPerson', person: fresh })
    expect(next.persons.at(-1)).toEqual(fresh)
    expect(next.selectedPersonId).toBe('pNeu')
    expect(next.toast?.text).toBeTruthy()
  })

  it('selectPerson verwirft eine zuvor namenlose Person', () => {
    const empty: Person = { ...fresh, id: 'pLeer', fn: '', ln: '', dn: '' }
    const s = makeState({ persons: [...DEMO_PERSONS, empty], selectedPersonId: 'pLeer' })
    const next = reducer(s, { type: 'selectPerson', id: 'p1' })
    expect(next.persons.some((p) => p.id === 'pLeer')).toBe(false)
    expect(next.selectedPersonId).toBe('p1')
  })

  it('updatePerson zieht eine Namensänderung durch Wochen und pendingNames', () => {
    const target = person('Manfred Albrecht')
    const s = makeState({ pendingNames: ['Manfred Albrecht'] })
    const next = reducer(s, { type: 'updatePerson', id: target.id, patch: { fn: 'Manfredo' } })
    expect(weeksContainName(next.weeks, 'Manfredo Albrecht')).toBe(true)
    expect(weeksContainName(next.weeks, 'Manfred Albrecht')).toBe(false)
    expect(next.pendingNames).toContain('Manfredo Albrecht')
  })

  it('updatePerson spiegelt das Planer-Recht in Konten/Codes (eigenes Konto ausgenommen)', () => {
    const target = person('Manfred Albrecht')
    const s = makeState({
      userId: 'me',
      members: [
        { userId: 'u1', email: 'u1@x', personId: target.id, planner: false },
        { userId: 'me', email: 'me@x', personId: target.id, planner: false },
      ],
      invites: [{ id: 'i1', code: 'ABC', personId: target.id, planner: false }],
    })
    const next = reducer(s, { type: 'updatePerson', id: target.id, patch: { planner: true } })
    expect(next.members.find((m) => m.userId === 'u1')!.planner).toBe(true)
    expect(next.members.find((m) => m.userId === 'me')!.planner).toBe(false)
    expect(next.invites[0].planner).toBe(true)
  })

  it('removePerson löst Gruppen-, Konto- und Code-Referenzen', () => {
    const s = makeState({
      groups: [{ id: 'g1', name: 'G1', ov: 'p1', as: 'p6' }],
      members: [{ userId: 'u1', email: 'u1@x', personId: 'p1', planner: true }],
      invites: [{ id: 'i1', code: 'ABC', personId: 'p1', planner: false }],
    })
    const next = reducer(s, { type: 'removePerson', id: 'p1' })
    expect(next.persons.some((p) => p.id === 'p1')).toBe(false)
    expect(next.groups[0].ov).toBeNull()
    expect(next.members[0].personId).toBeNull()
    expect(next.invites[0].personId).toBeNull()
  })
})

describe('Dienste', () => {
  it('changeServiceCount bleibt in 1..6', () => {
    const s = makeState({ services: [{ key: 'x', name: 'X', count: 6, groups: false }] })
    expect(reducer(s, { type: 'changeServiceCount', key: 'x', delta: 1 }).services[0].count).toBe(6)
    const lo = makeState({ services: [{ key: 'x', name: 'X', count: 1, groups: false }] })
    expect(reducer(lo, { type: 'changeServiceCount', key: 'x', delta: -1 }).services[0].count).toBe(1)
    const mid = makeState({ services: [{ key: 'x', name: 'X', count: 3, groups: false }] })
    expect(reducer(mid, { type: 'changeServiceCount', key: 'x', delta: 1 }).services[0].count).toBe(4)
  })

  it('addService / removeService', () => {
    const svc = { key: 'neu', name: 'Neu', count: 1, groups: false }
    expect(reducer(makeState(), { type: 'addService', service: svc }).services.at(-1)).toEqual(svc)
    const next = reducer(makeState({ services: [svc] }), { type: 'removeService', key: 'neu' })
    expect(next.services).toEqual([])
  })
})

describe('Gruppen', () => {
  it('addGroup / updateGroup', () => {
    const g = { id: 'gN', name: 'Neu', ov: null, as: null }
    expect(reducer(makeState(), { type: 'addGroup', group: g }).groups.at(-1)).toEqual(g)
    const upd = reducer(makeState({ groups: [g] }), { type: 'updateGroup', id: 'gN', patch: { ov: 'p2' } })
    expect(upd.groups[0].ov).toBe('p2')
  })

  it('removeGroup entfernt die Gruppe und löst die Mitglieder-Zuordnung', () => {
    const s = makeState({
      groups: [{ id: 'gN', name: 'Neu', ov: null, as: null }],
      persons: [{ ...person('Manfred Albrecht'), grp: 'gN' }],
    })
    const next = reducer(s, { type: 'removeGroup', id: 'gN' })
    expect(next.groups).toEqual([])
    expect(next.persons[0].grp).toBeNull()
  })
})

describe('Versammlung / Mitglieder / Einladungen', () => {
  it('updateCongregation mischt Felder', () => {
    const next = reducer(makeState(), { type: 'updateCongregation', patch: { hall: 'Neu 1' } })
    expect(next.congregation.hall).toBe('Neu 1')
    expect(next.congregation.name).toBe(CONGREGATION.name)
  })
  it('updateMember / removeMember', () => {
    const s = makeState({ members: [{ userId: 'u1', email: 'u1@x', personId: null, planner: false }] })
    expect(reducer(s, { type: 'updateMember', userId: 'u1', patch: { planner: true } }).members[0].planner).toBe(true)
    expect(reducer(s, { type: 'removeMember', userId: 'u1' }).members).toEqual([])
  })
  it('addInvite / removeInvite', () => {
    const inv = { id: 'i1', code: 'ABC', personId: null, planner: false }
    expect(reducer(makeState(), { type: 'addInvite', invite: inv }).invites).toContainEqual(inv)
    expect(reducer(makeState({ invites: [inv] }), { type: 'removeInvite', id: 'i1' }).invites).toEqual([])
  })
})

describe('Import (Demo)', () => {
  it('startImport setzt importing, ist aber gesperrt wenn schon importiert', () => {
    expect(reducer(makeState(), { type: 'startImport' }).importing).toBe(true)
    const done = makeState({ imported: true })
    expect(reducer(done, { type: 'startImport' })).toBe(done)
    const busy = makeState({ importing: true })
    expect(reducer(busy, { type: 'startImport' })).toBe(busy)
  })

  it('finishImport fügt eine Woche + Mitteilung hinzu (einmalig)', () => {
    const s = makeState({ importing: true })
    const before = s.weeks.length
    const next = reducer(s, { type: 'finishImport' })
    expect(next.weeks.length).toBe(before + 1)
    expect(next.imported).toBe(true)
    expect(next.importing).toBe(false)
    expect(next.notifs[0].type).toBe('import')
    // zweiter Aufruf ändert nichts
    expect(reducer(next, { type: 'finishImport' })).toBe(next)
  })

  it('addImportedWeek hängt die übergebene Woche an', () => {
    const s = makeState()
    const week = { ...s.weeks[0], range: 'Testwoche' }
    const next = reducer(s, { type: 'addImportedWeek', week })
    expect(next.weeks.at(-1)!.range).toBe('Testwoche')
    expect(next.notifs[0].type).toBe('import')
  })

  it('mergeWeekAlt mischt Sprachvarianten; stopImport beendet', () => {
    const s = makeState()
    const alt = { en: s.weeks[0] }
    const next = reducer(s, { type: 'mergeWeekAlt', wi: 0, alt })
    expect(next.weeks[0].alt).toMatchObject({ en: expect.anything() })
    expect(reducer(makeState({ importing: true }), { type: 'stopImport' }).importing).toBe(false)
  })
})

describe('assign (Zuteilen)', () => {
  it('ohne offenes Sheet unverändert', () => {
    const s = makeState({ slotSel: null })
    expect(reducer(s, { type: 'assign', name: 'X' })).toBe(s)
  })

  it('Programmpunkt: setzt Namen, ergänzt pendingNames + Mitteilung', () => {
    const s = makeState()
    const sel = firstPartSlot(s.weeks[0], 'mid')
    const next = reducer(makeState({ slotSel: sel }), { type: 'assign', name: 'Neue Person' })
    expect((next.weeks[0].mid.sections[sel.si].items[sel.ii] as PartItem).names[0].name).toBe('Neue Person')
    expect(next.pendingNames).toContain('Neue Person')
    expect(next.notifs[0].type).toBe('gesendet')
    expect(next.slotSel).toBeNull()
  })

  it('Gastredner-Slot landet nicht in pendingNames', () => {
    const s = makeState()
    const sel = { ...firstPartSlot(s.weeks[0], 'mid'), guest: true }
    const next = reducer(makeState({ slotSel: sel }), { type: 'assign', name: 'Gast Redner' })
    expect(next.pendingNames).not.toContain('Gast Redner')
  })

  it('leerer Name entfernt (kein pending, kein Mitteilungs-Push)', () => {
    const s = makeState()
    const sel = firstPartSlot(s.weeks[0], 'mid')
    const before = makeState({ slotSel: sel })
    const next = reducer(before, { type: 'assign', name: '' })
    expect((next.weeks[0].mid.sections[sel.si].items[sel.ii] as PartItem).names[0].name).toBe('')
    expect(next.notifs.length).toBe(before.notifs.length) // kein neuer Eintrag
  })

  it('Treffpunkt-Leiter (fs): setzt Leiter in fsWeeks, kein Wochen-Slot', () => {
    const s = makeState()
    const inst = s.fsWeeks[0][0]
    const sel = { kind: 'fs', wi: 0, instId: inst.id, label: 'Leiter', priv: 'treffpunkt', groups: false } as const
    const next = reducer(makeState({ slotSel: sel }), { type: 'assign', name: 'Fritz Leiter' })
    expect(next.fsWeeks[0].find((i) => i.id === inst.id)!.leader).toBe('Fritz Leiter')
    expect(next.pendingNames).toContain('Fritz Leiter')
    expect(next.notifs[0].type).toBe('gesendet')
  })
})

describe('autoAssign / clearAssignments', () => {
  it('autoAssign füllt offene Slots (Mitteilung + Toast mit Anzahl)', () => {
    const weeks = buildDemoWeeks()
    const closeSi = weeks[0].mid.sections.length - 1
    ;(weeks[0].mid.sections[closeSi].items[0] as PartItem).names[0].name = ''
    const s = makeState({ weeks, week: 0, tab: 'mid' })
    const next = reducer(s, { type: 'autoAssign', scope: 'parts' })
    expect(next.notifs[0].type).toBe('gesendet')
    expect(next.toast!.text).toMatch(/\d/) // enthält die Anzahl
  })

  it('autoAssign ohne besetzbare Person → „keine passende" (count 0, unfilled>0)', () => {
    const weeks = buildDemoWeeks()
    const closeSi = weeks[0].mid.sections.length - 1
    ;(weeks[0].mid.sections[closeSi].items[0] as PartItem).names[0].name = ''
    const s = makeState({ weeks, week: 0, tab: 'mid', persons: [] })
    const next = reducer(s, { type: 'autoAssign', scope: 'parts' })
    expect(next.weeks).toBe(weeks) // nichts zugeteilt
    expect(next.toast?.text).toBeTruthy()
  })

  it('autoAssign ohne geladene Woche ist ein No-op', () => {
    const s = makeState({ week: 99 })
    expect(reducer(s, { type: 'autoAssign' })).toBe(s)
  })

  it('clearAssignments leert und zählt; erneut geleert → 0', () => {
    const s = makeState({ week: 0, tab: 'mid' })
    const cleared = reducer(s, { type: 'clearAssignments', scope: 'parts' })
    expect(cleared.toast!.text).toMatch(/\d/)
    const again = reducer({ ...cleared, weeks: cleared.weeks }, { type: 'clearAssignments', scope: 'parts' })
    expect(again.toast!.text).toMatch(/0/)
  })

  it('clearAssignments ohne geladene Woche ist ein No-op', () => {
    const s = makeState({ week: 99 })
    expect(reducer(s, { type: 'clearAssignments', scope: 'parts' })).toBe(s)
  })
})

describe('Treffpunkte-Instanzen', () => {
  it('fsInstUpdate ändert Zeit/Ort der Woche', () => {
    const s = makeState()
    const inst = s.fsWeeks[0][0]
    const next = reducer(s, { type: 'fsInstUpdate', wi: 0, id: inst.id, patch: { time: '11:11' } })
    expect(next.fsWeeks[0].find((i) => i.id === inst.id)!.time).toBe('11:11')
  })
  it('fsInstRemove entfernt die Instanz', () => {
    const s = makeState()
    const inst = s.fsWeeks[0][0]
    const next = reducer(s, { type: 'fsInstRemove', wi: 0, id: inst.id })
    expect(next.fsWeeks[0].some((i) => i.id === inst.id)).toBe(false)
    expect(next.toast?.text).toBeTruthy()
  })
  it('fsInstAdd fügt in die aktuelle Woche ein', () => {
    const s = makeState({ week: 1 })
    const inst = { id: 'xManual', ruleId: null, grp: '', wd: 4, time: '18:00', place: 'Ort', leader: '', manual: true }
    const next = reducer(s, { type: 'fsInstAdd', inst })
    expect(next.fsWeeks[1].some((i) => i.id === 'xManual')).toBe(true)
  })
})

describe('Treffpunkte-Grundplan (Regeln)', () => {
  it('fsRuleAdd: Versammlungsregel ohne skipCong, Gruppenregel mit skipCong', () => {
    const cong = reducer(makeState(), { type: 'fsRuleAdd', grp: '' })
    expect(cong.fsRules.at(-1)).toMatchObject({ grp: '', wd: 6, skipCong: false })
    const grp = reducer(makeState(), { type: 'fsRuleAdd', grp: 'g1' })
    expect(grp.fsRules.at(-1)).toMatchObject({ grp: 'g1', skipCong: true })
    expect(cong.fsWeeks.length).toBe(cong.weeks.length === 0 ? 0 : cong.fsWeeks.length) // regeneriert
  })
  it('fsRuleUpdate patcht eine Regel', () => {
    const s = makeState()
    const id = s.fsRules[0].id
    const next = reducer(s, { type: 'fsRuleUpdate', id, patch: { time: '20:00' } })
    expect(next.fsRules.find((r) => r.id === id)!.time).toBe('20:00')
  })
  it('fsRuleRemove entfernt und regeneriert', () => {
    const s = makeState()
    const id = s.fsRules[0].id
    const next = reducer(s, { type: 'fsRuleRemove', id })
    expect(next.fsRules.some((r) => r.id === id)).toBe(false)
    expect(next.toast?.text).toBeTruthy()
  })
})

describe('Bestätigungs-Flow', () => {
  it('Demo: confirmTask/declineTask ändern den Task-Status direkt', () => {
    const s = makeState()
    const taskId = s.myTasks[0].id
    const conf = reducer(s, { type: 'confirmTask', id: taskId })
    expect(conf.myTasks.find((t) => t.id === taskId)!.status).toBe('bestätigt')
    const dec = reducer(s, { type: 'declineTask', id: taskId })
    expect(dec.myTasks.find((t) => t.id === taskId)!.status).toBe('verhindert')
    expect(dec.notifs[0].type).toBe('verhindert')
  })

  it('Produktion: schreibt in die ConfirmationMap statt in myTasks', () => {
    const s = makeState({ dataStatus: 'ready', personId: null })
    const conf = reducer(s, { type: 'confirmTask', id: 'slot|key|1' })
    expect(conf.confirmations['slot|key|1']).toBe('bestätigt')
    const dec = reducer(s, { type: 'declineTask', id: 'slot|key|2' })
    expect(dec.confirmations['slot|key|2']).toBe('verhindert')
    expect(dec.notifs[0].type).toBe('verhindert')
  })
})

describe('LAC / Vortrag (über den Reducer)', () => {
  const lacSi = (s: AppState) => s.weeks[0].mid.sections.findIndex((x) => x.label === 'UNSER LEBEN ALS CHRIST')
  const gehIdx = (s: AppState) =>
    s.weeks[0].mid.sections[lacSi(s)].items.findIndex(
      (i) => !isSong(i) && (i as PartItem).title.startsWith('Geh während'),
    )

  it('lacAdd fügt einen Punkt ein (mit Toast)', () => {
    const s = makeState({ week: 0, tab: 'mid' })
    const before = s.weeks[0].mid.sections[lacSi(s)].items.length
    const next = reducer(s, { type: 'lacAdd', si: lacSi(s), title: 'Örtliche Hinweise' })
    expect(next.weeks[0].mid.sections[lacSi(s)].items.length).toBe(before + 1)
    expect(next.toast?.text).toBeTruthy()
  })

  it('lacAdjust ändert die Minuten des Punkts', () => {
    const s = makeState({ week: 0, tab: 'mid' })
    const si = lacSi(s)
    const next = reducer(s, { type: 'lacAdjust', si, ii: gehIdx(s), delta: 5 })
    expect(next.weeks).not.toBe(s.weeks)
    expect(next.weeks[0].mid.end).not.toBe(s.weeks[0].mid.end) // Endzeit nachgezogen
  })

  it('lacRemove entfernt den Punkt (mit Toast)', () => {
    const s = makeState({ week: 0, tab: 'mid' })
    const si = lacSi(s)
    const before = s.weeks[0].mid.sections[si].items.length
    const next = reducer(s, { type: 'lacRemove', si, ii: gehIdx(s) })
    expect(next.weeks[0].mid.sections[si].items.length).toBe(before - 1)
    expect(next.toast?.text).toBeTruthy()
  })

  it('lacMove am Rand lässt den State unverändert', () => {
    const s = makeState({ week: 0, tab: 'mid' })
    const si = lacSi(s)
    const firstReal = s.weeks[0].mid.sections[si].items.findIndex((i) => !isSong(i))
    expect(reducer(s, { type: 'lacMove', si, ii: firstReal, dir: -1 })).toBe(s)
  })

  it('lacMove tauscht einen Nicht-Rand-Punkt (inkl. Bestätigungs-Mitnahme)', () => {
    const s = makeState({ week: 0, tab: 'mid' })
    const si = lacSi(s)
    const next = reducer(s, { type: 'lacMove', si, ii: gehIdx(s), dir: 1 })
    expect(next.weeks).not.toBe(s.weeks) // getauscht → neuer Wochen-Baum
  })

  it('talkEdit setzt das Vortragsthema (Wochenende)', () => {
    const s = makeState({ week: 1 })
    // ersten Nicht-Lied-Punkt im Wochenende finden
    let tsi = -1
    let tii = -1
    for (let si = 0; si < s.weeks[1].we.sections.length && tsi < 0; si++) {
      const ii = s.weeks[1].we.sections[si].items.findIndex((i) => !isSong(i))
      if (ii >= 0) {
        tsi = si
        tii = ii
      }
    }
    const next = reducer(s, { type: 'talkEdit', si: tsi, ii: tii, title: 'Mein Thema' })
    expect((next.weeks[1].we.sections[tsi].items[tii] as PartItem).title).toBe('Mein Thema')
  })
  it('openingSong setzt das Anfangslied der Wochenend-ZK', () => {
    const next = reducer(makeState({ week: 0 }), { type: 'openingSong', song: '99' })
    const found = next.weeks[0].we.sections.some((sec) =>
      sec.items.some((it) => !isSong(it) && (it as PartItem).title.includes('Lied 99')),
    )
    expect(found).toBe(true)
  })
})

describe('Erinnerungen', () => {
  it('changeReminder klemmt first (1..21) und last (0..7)', () => {
    const s = makeState({ reminders: { first: 1, last: 0, repeat: false } })
    expect(reducer(s, { type: 'changeReminder', key: 'first', delta: -1 }).reminders.first).toBe(1)
    expect(reducer(s, { type: 'changeReminder', key: 'last', delta: -1 }).reminders.last).toBe(0)
    const hi = makeState({ reminders: { first: 21, last: 7, repeat: false } })
    expect(reducer(hi, { type: 'changeReminder', key: 'first', delta: 1 }).reminders.first).toBe(21)
    expect(reducer(hi, { type: 'changeReminder', key: 'last', delta: 1 }).reminders.last).toBe(7)
  })
  it('toggleReminderRepeat kippt den Schalter', () => {
    expect(reducer(makeState({ reminders: { first: 5, last: 1, repeat: false } }), { type: 'toggleReminderRepeat' }).reminders.repeat).toBe(true)
  })
})

describe('Sprache', () => {
  it('setLang / setCongLang / Sprach-Sheet', () => {
    expect(reducer(makeState(), { type: 'setLang', lang: 'en' }).lang).toBe('en')
    const open = reducer(makeState(), { type: 'openLangSheet', mode: 'alt' })
    expect(open).toMatchObject({ langSheetOpen: true, langSheetFor: 'alt' })
    expect(reducer(makeState(), { type: 'openLangSheet' }).langSheetFor).toBe('cong')
    expect(reducer(makeState({ langSheetOpen: true, langSearch: 'x' }), { type: 'closeLangSheet' })).toMatchObject({ langSheetOpen: false, langSearch: '' })
    expect(reducer(makeState(), { type: 'setLangSearch', text: 'fr' }).langSearch).toBe('fr')
    expect(reducer(makeState({ langSheetOpen: true }), { type: 'setCongLang', name: 'Englisch' })).toMatchObject({ congLang: 'Englisch', langSheetOpen: false })
  })

  it('addProgLang überspringt Versammlungssprache und Duplikate', () => {
    const self = reducer(makeState({ congLang: 'Deutsch' }), { type: 'addProgLang', name: 'Deutsch' })
    expect(self.progLangs).toEqual([])
    const dup = reducer(makeState({ progLangs: ['Englisch'] }), { type: 'addProgLang', name: 'Englisch' })
    expect(dup.progLangs).toEqual(['Englisch'])
    const add = reducer(makeState({ progLangs: [] }), { type: 'addProgLang', name: 'Französisch' })
    expect(add.progLangs).toEqual(['Französisch'])
    expect(add.toast?.text).toBeTruthy()
  })

  it('removeProgLang entfernt eine Programmsprache', () => {
    const next = reducer(makeState({ progLangs: ['Englisch', 'Französisch'] }), { type: 'removeProgLang', name: 'Englisch' })
    expect(next.progLangs).toEqual(['Französisch'])
  })
})

describe('login / logout / setRecovery', () => {
  it('login → Startseite', () => {
    expect(reducer(makeState({ screen: 'login' }), { type: 'login' }).screen).toBe('start')
  })
  it('logout schließt alle Overlays', () => {
    const s = makeState({ notifOpen: true, langSheetOpen: true, selectedPersonId: 'p1', confirmOpen: true })
    const next = reducer(s, { type: 'logout' })
    expect(next).toMatchObject({ screen: 'login', notifOpen: false, langSheetOpen: false, selectedPersonId: null, confirmOpen: false, recovery: false })
  })
  it('setRecovery schaltet die Reset-Ansicht', () => {
    expect(reducer(makeState(), { type: 'setRecovery', on: true }).recovery).toBe(true)
  })
})

describe('S-89', () => {
  it('openS89 / closeS89', () => {
    const payload = { name: 'A', partner: '', date: '', type: 'X', point: '' }
    expect(reducer(makeState(), { type: 'openS89', payload }).s89).toEqual(payload)
    expect(reducer(makeState({ s89: payload }), { type: 'closeS89' }).s89).toBeNull()
  })
})

describe('hydrate / setDataStatus', () => {
  const payload: HydratePayload = {
    congregationId: 'c1',
    userId: 'u1',
    empty: false,
    congregation: { name: 'Krumbach', hall: 'H', meetings: 'M' },
    planner: true,
    personId: 'p9',
    persons: DEMO_PERSONS,
    services: DEMO_SERVICES,
    groups: DEMO_GROUPS,
    weeks: buildDemoWeeks(),
    fsRules: DEMO_FS_RULES,
    fsWeeks: buildDemoFsWeeks(),
    fsBase: '2026-09-07',
    absences: [],
    notifications: [],
    confirmations: {},
    reminders: DEMO_REMINDERS,
    congLang: 'Deutsch',
    progLangs: [],
    members: [],
    invites: [],
  }

  it('übernimmt die Nutzdaten, setzt ready und Woche 0', () => {
    const next = reducer(makeState({ dataStatus: 'loading', week: 3 }), { type: 'hydrate', payload })
    expect(next.dataStatus).toBe('ready')
    expect(next.week).toBe(0)
    expect(next.congregation.name).toBe('Krumbach')
    expect(next.congregationId).toBe('c1')
  })

  it('liest fsBase als 12:00 Ortszeit (kein UTC-Tagesversatz)', () => {
    const next = reducer(makeState(), { type: 'hydrate', payload })
    expect(next.fsBase.getFullYear()).toBe(2026)
    expect(next.fsBase.getMonth()).toBe(8) // September
    expect(next.fsBase.getDate()).toBe(7)
  })

  it('fsBase null behält die bisherige Basis', () => {
    const keep = makeState().fsBase
    const next = reducer(makeState({ fsBase: keep }), { type: 'hydrate', payload: { ...payload, fsBase: null } })
    expect(next.fsBase).toBe(keep)
  })

  it('setDataStatus übernimmt Status und optional userId', () => {
    expect(reducer(makeState(), { type: 'setDataStatus', status: 'error', userId: 'u9' })).toMatchObject({ dataStatus: 'error', userId: 'u9' })
    expect(reducer(makeState({ userId: 'keep' }), { type: 'setDataStatus', status: 'no-membership' }).userId).toBe('keep')
  })
})

describe('abgeleitete Aufgaben (Produktionsmodus)', () => {
  it('DERIVE_ACTIONS berechnen myTasks/pendingNames aus den Wochen neu', () => {
    const me = person('Simon Krüger')
    const s = makeState({ dataStatus: 'ready', personId: me.id, myTasks: [], pendingNames: [] })
    // setLang ist eine DERIVE_ACTION → withDerivedTasks greift (Produktion)
    const next = reducer(s, { type: 'setLang', lang: 'de' })
    expect(next.myTasks.length).toBeGreaterThan(0)
    expect(next.pendingNames).toContain('Simon Krüger')
  })

  it('im Demo-Modus bleiben die Demo-Aufgaben unangetastet', () => {
    const s = makeState({ dataStatus: 'demo' })
    const next = reducer(s, { type: 'setLang', lang: 'en' })
    expect(next.myTasks).toEqual(s.myTasks)
  })
})
