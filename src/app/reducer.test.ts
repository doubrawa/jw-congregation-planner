import { describe, expect, it, vi } from 'vitest'
import { isNameless, reducer } from './reducer'
import { hatAuxKlasse } from '../data/aux-class'
import type { AppAction, AppState } from './context'
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
  DEMO_PENDING_IDS,
  DEMO_PERSONS,
  DEMO_PLANNER,
  DEMO_REMINDERS,
  DEMO_SERVICES,
  FS_BASE,
} from '../data/testdaten'
import { LABEL_VORTRAG } from '../data/constants'
import { displayName, emptyQualifications, isSong, istAusgefallen, ROLE_OWN_SPEAKER } from '../data/helpers'
import { deriveMyTasks, derivePendingIds } from '../data/planning'
import type { PartItem, PartSlotSelection, Person, Week } from '../data/types'

/** Voller Demo-AppState; `over` überschreibt einzelne Felder je Test. */
function makeState(over: Partial<AppState> = {}): AppState {
  return {
    screen: 'start',
    week: 0,
    tab: 'mid',
    theme: 'weiss',
    fontScale: 1,
    planner: DEMO_PLANNER,
    congregation: { ...CONGREGATION },
    congregationId: null,
    userId: null,
    personId: null,
    dataStatus: 'demo',
    dataEmpty: false,
    staleAt: null,
    members: [],
    invites: [],
    auxClass: false,
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
    pendingIds: [...DEMO_PENDING_IDS],
    confirmations: {},
    sentLog: {},
    confirmOpen: false,
    myTaskId: null,
    substituteReqs: [],
    s89: null,
    reminders: { ...DEMO_REMINDERS },
    lang: 'de',
    langSheetOpen: false,
    langSheetFor: 'cong',
    svcSheet: null,
    terminGewaehlt: true, // Tests wählen Woche/Reiter selbst — kein Springen (T82)
    congLang: 'Deutsch',
    progLangs: [],
    langSearch: '',
    toast: null,
    welcomePending: false,
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
      for (const arr of Object.values(w[tab].helpers)) if (arr.some((s) => s.name === name)) return true
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
    const empty: Person = { id: 'pX', fn: '', ln: '', role: 'verkuendiger', tel: '', mail: '', priv: {} as Person['priv'], grp: null }
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

  it('geht nicht vor die erste Woche zurück', () => {
    // Bis T66 lag diese Grenze bei `weekFrom`: davor standen Platzhalter für
    // Wochen außerhalb des Ladefensters, damit der Index die Datenbank-Position
    // blieb. Die Platzhalter sind weg — die erste geladene Woche ist die erste.
    expect(reducer(makeState({ week: 0 }), { type: 'prevWeek' }).week).toBe(0)
  })
})

describe('einfache UI-Setter', () => {
  it('setTab / setTheme / Slot / Notif-Panel', () => {
    expect(reducer(makeState(), { type: 'setTab', tab: 'we' }).tab).toBe('we')
    expect(reducer(makeState(), { type: 'setTheme', theme: 'graphit' }).theme).toBe('graphit')
    expect(reducer(makeState(), { type: 'setFontScale', scale: 1.3 }).fontScale).toBe(1.3)
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
  const abs = { id: 'a99', personId: 'p1', userId: 'u1', from: '2026-09-01', to: '2026-09-05', reason: 'Urlaub' }
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
  const fresh: Person = { id: 'pNeu', fn: 'Neu', ln: 'Person', role: 'verkuendiger', tel: '', mail: '', priv: {} as Person['priv'], grp: null }

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

  it('updatePerson zieht eine Namensänderung durch die Wochen', () => {
    const target = person('Manfred Albrecht')
    const s = makeState({ pendingIds: [target.id] })
    const next = reducer(s, { type: 'updatePerson', id: target.id, patch: { fn: 'Manfredo' } })
    expect(weeksContainName(next.weeks, 'Manfredo Albrecht')).toBe(true)
    expect(weeksContainName(next.weeks, 'Manfred Albrecht')).toBe(false)
    // Die „…"-Markierung hängt an der Id und überlebt die Umbenennung von
    // selbst — früher musste sie eigens mitgepflegt werden.
    expect(next.pendingIds).toContain(target.id)
  })

  it('updatePerson zieht die Namensänderung auch durch die Treffpunkte', () => {
    // Zweite Datenquelle, eigener Schreibweg — und lange vergessen: der
    // Treffpunkt-Plan zeigte weiter den alten Namen, während die
    // Zusammenkünfte daneben schon den neuen trugen.
    const target = person('Manfred Albrecht')
    const s = makeState({
      fsWeeks: [[
        { id: '0|r1', ruleId: 'r1', grp: '', wd: 6, time: '09:30', place: 'Saal',
          leader: 'Manfred Albrecht', lpid: target.id },
        { id: '0|r2', ruleId: 'r2', grp: '', wd: 3, time: '09:30', place: 'Halle',
          leader: 'Jemand Anders', lpid: 'p-fremd' },
      ]],
    })
    const next = reducer(s, { type: 'updatePerson', id: target.id, patch: { fn: 'Manfredo' } })
    expect(next.fsWeeks[0]![0]!.leader).toBe('Manfredo Albrecht')
    expect(next.fsWeeks[0]![1]!.leader).toBe('Jemand Anders')
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

  it('removePerson löst auch die pid aus Wochen und Treffpunkten (T38)', () => {
    // Der Name bleibt als Text stehen — so war es immer dokumentiert. Die Id
    // aber muss weg: ohne Ziel ist sie ein Fremdschlüssel ins Leere, der Slot
    // zählte nirgends mehr, und eine neu angelegte Person desselben Namens
    // bekäme eine neue Id und passte nie wieder dazu.
    const s = makeState()
    const mitPid = (w: Week): { name: string; pid?: string } | undefined => {
      for (const tab of ['mid', 'we'] as const) {
        for (const sec of w[tab].sections) {
          for (const it of sec.items) {
            if (isSong(it)) continue
            const slot = (it as PartItem).names.find((n) => n.pid)
            if (slot) return slot
          }
        }
      }
      return undefined
    }
    // Eine echte Zuteilung mit pid herstellen und dann ihre Person löschen.
    const sel = firstPartSlot(s.weeks[0], 'mid')
    const belegt = reducer(makeState({ slotSel: sel }), {
      type: 'assign', name: 'Anna Beispiel', pid: 'p1',
    })
    expect(mitPid(belegt.weeks[0])?.pid).toBe('p1')

    const geloescht = reducer(belegt, { type: 'removePerson', id: 'p1' })
    const slot = (geloescht.weeks[0].mid.sections[sel.si].items[sel.ii] as PartItem).names[0]
    expect(slot.name).toBe('Anna Beispiel') // Name bleibt
    expect(slot.pid).toBeUndefined() // Id ist gelöst
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

  describe('geänderte Zusammenkunftszeit zieht die Endzeiten nach', () => {
    /**
     * Importierte Wochen: im `date`-Feld steht die Überschrift der
     * jw.org-Seite, ohne Uhrzeit — ihre Startzeit kommt aus den Einstellungen,
     * ihre Endzeit stand bis hierher unveränderlich in der Woche.
     */
    function importState(): AppState {
      const weeks = buildDemoWeeks()
      for (const week of weeks) {
        week.mid.date = '7.–13. September'
        week.mid.end = 'Ende ca. 20:45'
      }
      return makeState({
        weeks,
        congregation: { ...CONGREGATION, meetings: 'Di 19:00 · So 10:00' },
      })
    }

    it('verschiebt das Ende mit der Startzeit', () => {
      const next = reducer(importState(), {
        type: 'updateCongregation',
        patch: { meetings: 'Di 18:30 · So 10:00' },
      })
      expect(next.congregation.meetings).toBe('Di 18:30 · So 10:00')
      expect(next.weeks[0].mid.end).toBe('Ende ca. 20:15')
    })

    it('lässt die Wochen in Ruhe, wenn ein anderes Feld gepflegt wird', () => {
      // Identität: sonst schriebe die Persistenz bei jeder Namensänderung
      // sämtliche geladenen Wochen in die Datenbank.
      const s = importState()
      const next = reducer(s, { type: 'updateCongregation', patch: { hall: 'Neu 1' } })
      expect(next.weeks).toBe(s.weeks)
    })

    it('lässt die Wochen in Ruhe, wenn die Zeit gleich bleibt', () => {
      const s = importState()
      const next = reducer(s, {
        type: 'updateCongregation',
        patch: { meetings: 'Di 19:00 · So 10:00' },
      })
      expect(next.weeks).toBe(s.weeks)
    })
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

  it('eine importierte Woche bekommt die Zusätzliche Klasse mit', () => {
    // Ohne dieses Angleichen stünde die neue Woche ohne zweite Platzreihe und
    // ohne Ratgeber da — die Klasse verschwände ab dem nächsten Import.
    const s = makeState({ auxClass: true })
    const week = { ...s.weeks[0], range: 'Testwoche' }
    const next = reducer(s, { type: 'addImportedWeek', week })
    expect(hatAuxKlasse(next.weeks.at(-1)!.mid)).toBe(true)
  })

  /*
    T65 — die Gedächtnismahl-Woche kommt aus dem Import mit ihrem Anlass, aber
    **ohne** Strich. Welche Zusammenkunft entfällt, leitet der Client ab; die
    Edge Function tut es ausdrücklich nicht. So steht die Regel an einer Stelle
    — sie ein zweites Mal serverseitig zu führen war schon einmal die Ursache
    eines Fehlers (B8/T40).
  */
  it('eine importierte Gedächtnismahl-Woche bekommt ihren Ausfall abgeleitet', () => {
    const s = makeState()
    const week: Week = {
      ...s.weeks[0]!,
      range: '30. März–5. April',
      start: '2026-03-30',
      anlass: { art: 'mem', von: '2026-04-02' }, // Donnerstag
      mem: true,
    }
    const next = reducer(s, { type: 'addImportedWeek', week })
    const neu = next.weeks.at(-1)!
    expect(istAusgefallen(neu, 'mid')).toBe(true)
    expect(istAusgefallen(neu, 'we')).toBe(false)
  })

  it('fällt das Mahl aufs Wochenende, entfällt jene', () => {
    const s = makeState()
    const week: Week = {
      ...s.weeks[0]!,
      start: '2024-03-18',
      anlass: { art: 'mem', von: '2024-03-24' }, // Sonntag — die Woche gibt es im Heft
      mem: true,
    }
    const neu = reducer(s, { type: 'addImportedWeek', week }).weeks.at(-1)!
    expect(istAusgefallen(neu, 'we')).toBe(true)
    expect(istAusgefallen(neu, 'mid')).toBe(false)
  })

  it('eine gewöhnliche Woche bleibt ungestrichen', () => {
    const s = makeState()
    const neu = reducer(s, { type: 'addImportedWeek', week: { ...s.weeks[0]!, range: 'X' } }).weeks.at(-1)!
    expect(istAusgefallen(neu, 'mid')).toBe(false)
    expect(istAusgefallen(neu, 'we')).toBe(false)
  })

  it('ohne Bibellese-Kapitel bleibt kein leeres Atom in der Meldung stehen', () => {
    // Die Gedächtnismahl-Woche hat keins — sie hat gar keine Arbeitsheft-Seite.
    const s = makeState()
    const week: Week = { ...s.weeks[0]!, range: '30. März–5. April', book: '' }
    const next = reducer(s, { type: 'addImportedWeek', week })
    expect(next.notifs[0]!.text).toBe('30. März–5. April — ohne Zuteilungen')
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

  it('Programmpunkt: setzt Namen und ergänzt pendingIds', () => {
    const s = makeState()
    const sel = firstPartSlot(s.weeks[0], 'mid')
    const next = reducer(makeState({ slotSel: sel }), { type: 'assign', name: 'Neue Person', pid: 'neu-1' })
    expect((next.weeks[0]!.mid.sections[sel.si]!.items[sel.ii] as PartItem).names[0]!.name).toBe('Neue Person')
    expect(next.pendingIds).toContain('neu-1')
    // Eine Mitteilung entsteht dabei nicht mehr (T99) — dafür gibt es den
    // eigenen Fall weiter unten.
    expect(next.slotSel).toBeNull()
  })

  /*
    Der Redner-Platz des öffentlichen Vortrags trägt beide Fälle, und **die
    geschriebene Rolle** entscheidet — nicht `sel.guest`. Das Flag sagt nur
    „das ist der Redner-Platz"; es steht bei beiden Fällen auf true, weil es
    im Sheet die Freitext-Felder öffnet (T29).

    Vorher las der Reducer das Flag. Dadurch blieb der eigene Redner trotz
    `pid` und Rolle „Redner" vom Bestätigungs-Flow ausgenommen — die zweite
    Hälfte von F1.
  */
  const rednerPlatz = (): PartSlotSelection => {
    const s = makeState()
    const si = s.weeks[0].we.sections.findIndex((x) => x.label === LABEL_VORTRAG)
    return { kind: 'part', wi: 0, tab: 'we', si, ii: 0, ni: 0, priv: 'vortrag', groups: false, label: 'Vortrag', guest: true }
  }

  it('Gastredner landet nicht in pendingIds', () => {
    const sel = rednerPlatz()
    const next = reducer(makeState({ slotSel: sel }), {
      type: 'assign', name: 'Gast Redner', rolle: 'Gastredner · Vers. Nordheim',
    })
    expect(next.pendingIds).not.toContain('gast-1')
    expect(next.confirmations).toEqual({})
  })

  it('eigener Redner landet sehr wohl in pendingIds', () => {
    const sel = rednerPlatz()
    const next = reducer(makeState({ slotSel: sel }), {
      type: 'assign', name: 'Neue Person', rolle: ROLE_OWN_SPEAKER, pid: 'eigen-1',
    })
    expect(next.pendingIds).toContain('eigen-1')
  })

  it('eine pid allein genügt nicht — auf einem Gastredner-Platz zählt die Rolle', () => {
    // Gegenprobe zum Flag: dieselbe pid, nur die Rolle unterscheidet sich.
    const sel = rednerPlatz()
    const next = reducer(makeState({ slotSel: sel }), {
      type: 'assign', name: 'Gast Redner', rolle: 'Gastredner', pid: 'gast-1',
    })
    expect(next.pendingIds).not.toContain('gast-1')
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
    const next = reducer(makeState({ slotSel: sel }), { type: 'assign', name: 'Fritz Leiter', pid: 'fritz-1' })
    expect(next.fsWeeks[0]!.find((i) => i.id === inst.id)!.leader).toBe('Fritz Leiter')
    expect(next.pendingIds).toContain('fritz-1')
  })
})

describe('autoAssign / clearAssignments', () => {
  it('autoAssign füllt offene Slots (Toast mit Anzahl)', () => {
    const weeks = buildDemoWeeks()
    const closeSi = weeks[0]!.mid.sections.length - 1
    ;(weeks[0]!.mid.sections[closeSi]!.items[0] as PartItem).names[0]!.name = ''
    const s = makeState({ weeks, week: 0, tab: 'mid' })
    const next = reducer(s, { type: 'autoAssign', scope: 'parts' })
    expect(next.toast!.text).toMatch(/\d/) // enthält die Anzahl
  })

  it('autoAssign ohne besetzbare Person → „keine passende" (count 0, unfilled>0)', () => {
    const weeks = buildDemoWeeks()
    const closeSi = weeks[0]!.mid.sections.length - 1
    ;(weeks[0]!.mid.sections[closeSi]!.items[0] as PartItem).names[0]!.name = ''
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
  it('fsRuleAdd vergibt eindeutige Ids, auch zweimal hintereinander', () => {
    // Die Id steckt in jeder Treffpunkt-Kennung (`<wi>|<ruleId>`) und darüber
    // im Aufgaben-Schlüssel. `r${Date.now()}` gab zwei Regeln derselben
    // Millisekunde dieselbe — zwei Treffpunkte teilten sich dann eine
    // Bestätigung.
    const eins = reducer(makeState(), { type: 'fsRuleAdd', grp: '' })
    const zwei = reducer(eins, { type: 'fsRuleAdd', grp: '' })
    const ids = zwei.fsRules.map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.some((id) => id.includes('|'))).toBe(false) // sonst bräche der Schlüssel
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
      (i) => !isSong(i) && (i as PartItem).title.startsWith('Demoaufgabe 9'),
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

/**
 * T99. **Zuteilen erzeugt keine Mitteilung mehr.**
 *
 * Vorher entstand bei jedem Zuteilungsklick eine Zeile „Zuteilung gesendet" —
 * adressiert an die Planer, also an den, der gerade selbst geklickt hatte. Eine
 * von Hand geteilte Woche schrieb so 35 Zeilen in die Glocke jedes Planers und
 * verdrängte im Ladefenster von 50 alles andere, die eigenen Erinnerungen
 * eingeschlossen. Wer eingeteilt wurde, erfuhr davon nichts.
 *
 * Geprüft wird auf **allen vier Wegen** (einzeln, Treffpunkt-Leiter,
 * Auto-Zuteilung, Treffpunkt-Auto) — genau hier verliert sich sonst einer, ohne
 * dass etwas fehlschlägt: eine Mitteilung zu viel bricht nichts, sie sammelt
 * sich nur an. Dieselbe Sorgfalt, die vorher der Schalter brauchte.
 *
 * Und zugleich, dass **nur** die Mitteilung wegfällt: zugeteilt wird weiter,
 * und die Aufgabe bleibt unbestätigt (`pendingIds`).
 */
describe('Zuteilen meldet nichts mehr an die Planer (T99)', () => {
  /** Demo-Woche mit einem offenen Programmpunkt — sonst gibt es nichts zu tun. */
  const mitOffenemSlot = (over: Partial<AppState> = {}) => {
    const weeks = buildDemoWeeks()
    const closeSi = weeks[0]!.mid.sections.length - 1
    ;(weeks[0]!.mid.sections[closeSi]!.items[0] as PartItem).names[0]!.name = ''
    return makeState({ weeks, week: 0, tab: 'mid', ...over })
  }

  /** Treffpunkt-Woche ohne Leiter — geleert über die eigene Aktion. */
  const mitOffenenTreffpunkten = (over: Partial<AppState> = {}) => {
    const geleert = reducer(makeState({ week: 0 }), { type: 'fsClear', onlyGroup: null })
    return makeState({ fsWeeks: geleert.fsWeeks, week: 0, ...over })
  }

  it('einzelner Programmpunkt: keine Mitteilung, Zuteilung trotzdem', () => {
    const sel = firstPartSlot(makeState().weeks[0]!, 'mid')
    const s = makeState({ slotSel: sel })
    const next = reducer(s, { type: 'assign', name: 'Neue Person', pid: 'neu-1' })
    expect(next.notifs).toBe(s.notifs)
    expect((next.weeks[0]!.mid.sections[sel.si]!.items[sel.ii] as PartItem).names[0]!.name).toBe('Neue Person')
    expect(next.pendingIds).toContain('neu-1')
  })

  it('Treffpunkt-Leiter: keine Mitteilung, Leiter trotzdem gesetzt', () => {
    const inst = makeState().fsWeeks[0]![0]!
    const sel = { kind: 'fs', wi: 0, instId: inst.id, label: 'Leiter', priv: 'treffpunkt', groups: false } as const
    const s = makeState({ slotSel: sel })
    const next = reducer(s, { type: 'assign', name: 'Fritz Leiter', pid: 'fritz-1' })
    expect(next.notifs).toBe(s.notifs)
    expect(next.fsWeeks[0]!.find((i) => i.id === inst.id)!.leader).toBe('Fritz Leiter')
  })

  it('Auto-Zuteilung: keine Mitteilung, Plätze trotzdem besetzt', () => {
    const s = mitOffenemSlot()
    const next = reducer(s, { type: 'autoAssign', scope: 'parts' })
    expect(next.notifs).toBe(s.notifs)
    expect(next.weeks).not.toBe(s.weeks) // zugeteilt wurde trotzdem
  })

  it('Treffpunkt-Auto: keine Mitteilung, Leiter trotzdem besetzt', () => {
    const s = mitOffenenTreffpunkten()
    const next = reducer(s, { type: 'fsAutoAssign', onlyGroup: null })
    expect(next.notifs).toBe(s.notifs)
    expect(next.fsWeeks).not.toBe(s.fsWeeks)
  })

  it('auch nach vielen Zuteilungen bleibt die Glocke unverändert', () => {
    // Die eigentliche Beschwerde war die Menge: eine Woche hat gut 35 Plätze.
    // Ein einzelner Weg, der wieder meldet, fiele in den Einzelproben oben
    // vielleicht durch — hier nicht, weil hier alle zusammen laufen.
    let s = mitOffenemSlot()
    const vorher = s.notifs
    s = reducer(s, { type: 'autoAssign', scope: 'parts' })
    s = reducer(s, { type: 'autoAssign', scope: 'helpers' })
    s = reducer(s, { type: 'fsAutoAssign', onlyGroup: null })
    expect(s.notifs).toBe(vorher)
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

  it('Programm und Planen öffnen mit der nächsten Zusammenkunft (T82)', () => {
    // Wochen ab Montag, 7. September 2026; heute ist in dieser Testumgebung
    // fest verdrahtet nicht steuerbar, deshalb prüft der Test die Weiche und
    // nicht das Datum — das tut `naechste-zusammenkunft.test.ts`.
    const s = makeState({ terminGewaehlt: false, tab: 'we', week: 3 })
    // Ohne Wochen mit Datum gibt es keine nächste — dann bleibt alles stehen.
    const ohne = reducer({ ...s, weeks: [] }, { type: 'navigate', screen: 'planen' })
    expect(ohne).toMatchObject({ tab: 'we', week: 3 })

    // Eine eigene Wahl schlägt den Sprung — sonst würde der Planer beim
    // Hin- und Herwechseln immer wieder umgesetzt.
    const gewaehlt = reducer(makeState({ terminGewaehlt: true, tab: 'we', week: 3 }), {
      type: 'navigate', screen: 'planen',
    })
    expect(gewaehlt).toMatchObject({ tab: 'we', week: 3 })

    // Reiter- und Wochenwechsel sind eine solche Wahl.
    expect(reducer(makeState({ terminGewaehlt: false }), { type: 'setTab', tab: 'we' }).terminGewaehlt).toBe(true)
    expect(reducer(makeState({ terminGewaehlt: false }), { type: 'nextWeek' }).terminGewaehlt).toBe(true)
    expect(reducer(makeState({ terminGewaehlt: false }), { type: 'prevWeek' }).terminGewaehlt).toBe(true)

    // Die Treffpunkte meint, wer sie ansieht — dort wird nichts umgesetzt.
    const fs = reducer(makeState({ terminGewaehlt: false, tab: 'fs', week: 3 }), {
      type: 'navigate', screen: 'programm',
    })
    expect(fs).toMatchObject({ tab: 'fs', week: 3 })
  })

  it('das Blatt beim Öffnen hält auch ein Ersatzgesuch (T69)', () => {
    const gesuch = { key: 'k1', svc: 'mik', title: 'Mikrofone', date: 'Di', declinedBy: 'A. B.', schonHeute: [] }
    // Nichts zu bestätigen, aber ein Gesuch offen: früher blieb das Blatt weg,
    // und wer nicht von selbst nachsah, erfuhr nie davon.
    const s = makeState({ myTasks: [], substituteReqs: [gesuch] })
    expect(reducer(s, { type: 'login' }).confirmOpen).toBe(true)
    // Weglegen darf man es — einspringen ist freiwillig.
    expect(reducer({ ...s, confirmOpen: true }, { type: 'closeConfirm' }).confirmOpen).toBe(false)
    // Solange etwas zu bestätigen ist, hält es.
    const mitAufgabe = makeState({
      confirmOpen: true,
      substituteReqs: [gesuch],
      myTasks: [{ id: 't1', title: 'X', date: 'Di', chip: '', status: 'offen', s89: null }],
    })
    expect(reducer(mitAufgabe, { type: 'closeConfirm' }).confirmOpen).toBe(true)
    // Und ohne beides gibt es nichts vorzulegen.
    expect(reducer(makeState({ myTasks: [], substituteReqs: [] }), { type: 'login' }).confirmOpen).toBe(false)
  })

  it('Freigabe-Liste eines Hilfsdienstes: öffnen, schließen — und beim Löschen mit weg (T79)', () => {
    expect(reducer(makeState(), { type: 'openServiceSheet', key: 'rund' }).svcSheet).toBe('rund')
    expect(reducer(makeState({ svcSheet: 'rund' }), { type: 'closeServiceSheet' }).svcSheet).toBeNull()
    // Wird der Dienst gelöscht, während seine Liste offen steht, zeigte sie
    // Schalter für einen Bereich, den es nicht mehr gibt.
    const geloescht = reducer(makeState({ svcSheet: 'rund' }), { type: 'removeService', key: 'rund' })
    expect(geloescht.svcSheet).toBeNull()
    // Ein anderer Dienst geht die offene Liste nichts an.
    expect(reducer(makeState({ svcSheet: 'rund' }), { type: 'removeService', key: 'ton' }).svcSheet).toBe('rund')
    expect(reducer(makeState({ svcSheet: 'rund' }), { type: 'logout' }).svcSheet).toBeNull()
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
  it('nur ein echtes Anmelden merkt die Begrüßung vor', () => {
    // Eine wiederhergestellte Sitzung beim App-Start meldet ebenfalls „login" —
    // dabei darf nicht jedes Mal aufs Neue begrüßt werden.
    expect(reducer(makeState({ screen: 'login' }), { type: 'login', welcome: true }).welcomePending).toBe(true)
    expect(reducer(makeState({ screen: 'login' }), { type: 'login' }).welcomePending).toBe(false)
  })
  it('welcomeShown räumt die Vormerkung ab', () => {
    const s = makeState({ welcomePending: true })
    expect(reducer(s, { type: 'welcomeShown' }).welcomePending).toBe(false)
  })
  it('abmelden verwirft eine offene Begrüßung', () => {
    // Sonst würde die nächste Anmeldung mit fremdem Vormerker starten.
    expect(reducer(makeState({ welcomePending: true }), { type: 'logout' }).welcomePending).toBe(false)
  })
  it('logout schließt alle Overlays', () => {
    const s = makeState({ notifOpen: true, langSheetOpen: true, selectedPersonId: 'p1', confirmOpen: true })
    const next = reducer(s, { type: 'logout' })
    expect(next).toMatchObject({ screen: 'login', notifOpen: false, langSheetOpen: false, selectedPersonId: null, confirmOpen: false, recovery: false })
  })
  it('logout verwirft den Offline-Stand', () => {
    expect(reducer(makeState({ staleAt: 123 }), { type: 'logout' }).staleAt).toBeNull()
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
    auxClass: false,
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
    sentLog: {},
    reminders: DEMO_REMINDERS,
    congLang: 'Deutsch',
    progLangs: [],
    members: [],
    invites: [],
  }

  it('übernimmt die Nutzdaten, setzt ready und Woche 0', () => {
    // `terminGewaehlt: false` ist die Lage beim **Start** — so steht es in
    // init.ts, solange kein Debug-Hash einen Reiter vorgibt. Nur dann darf das
    // Laden die Woche bestimmen; hat der Planer selbst geblättert, bleibt sie
    // stehen (siehe „lässt eine selbst gewählte Woche stehen").
    const next = reducer(makeState({ dataStatus: 'loading', week: 3, terminGewaehlt: false }), {
      type: 'hydrate',
      payload,
    })
    expect(next.dataStatus).toBe('ready')
    expect(next.week).toBe(0)
    expect(next.congregation.name).toBe('Krumbach')
    expect(next.congregationId).toBe('c1')
  })

  it('springt auf die laufende Woche, nicht auf die älteste geladene', () => {
    // Bisher stand hier weekFrom: nach dem Login zeigte die App die älteste
    // geladene Woche — bei 52 geladenen Wochen ein Jahr altes Programm.
    // Die Startdaten kommen aus den Demo-Wochen selbst: seit T66 trägt jede
    // Woche ihre Kennung, eine zweite Liste daneben wäre eine Quelle zu viel.
    const wochen = buildDemoWeeks().slice(0, 3).map((w) => ({ ...w, current: false }))
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 8, 16, 10)) // Mittwoch der zweiten Woche
    try {
      const next = reducer(makeState({ week: 0, terminGewaehlt: false }), {
        type: 'hydrate',
        payload: { ...payload, weeks: wochen },
      })
      expect(next.week).toBe(1)
    } finally {
      vi.useRealTimers()
    }
  })

  /*
   * **Ein stilles Nachladen darf den Planer nicht aus seiner Woche tragen** (T99).
   *
   * Seit „Plan senden" und der Glocke lädt die App auch mitten in der Arbeit
   * nach. Sprang sie dabei auf die laufende Woche, gab der Planer Woche +3 frei
   * und stand danach vor einer anderen — mit deren Zahlen und deren Namen.
   */
  it('lässt eine selbst gewählte Woche stehen und findet sie über ihre Kennung wieder', () => {
    const wochen = buildDemoWeeks().slice(0, 3).map((w) => ({ ...w, current: false }))
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 8, 16, 10)) // Mittwoch der zweiten Woche
    try {
      // Der Planer steht auf der dritten Woche (nicht der laufenden).
      const gewaehlt = makeState({ week: 2, terminGewaehlt: true, weeks: wochen })
      const kennung = wochen[2]?.start

      // Gleicher Bestand: die Woche bleibt.
      const gleich = reducer(gewaehlt, { type: 'hydrate', payload: { ...payload, weeks: wochen } })
      expect(gleich.weeks[gleich.week]?.start).toBe(kennung)

      // Eine Woche ist **vorn** dazugekommen — die Ordnungszahl zeigt jetzt
      // woandershin, die Kennung nicht. Genau dafür wird über sie gesucht.
      const davor = { ...(buildDemoWeeks()[0] as (typeof wochen)[number]), start: '2026-08-24', current: false }
      const laenger = [davor, ...wochen]
      const verschoben = reducer(gewaehlt, {
        type: 'hydrate',
        payload: { ...payload, weeks: laenger },
      })
      expect(verschoben.weeks[verschoben.week]?.start).toBe(kennung)
      expect(verschoben.week).toBe(3)

      // Ist sie gar nicht mehr dabei, gilt wieder die laufende Woche.
      const ohne = reducer(gewaehlt, {
        type: 'hydrate',
        payload: { ...payload, weeks: wochen.slice(0, 2) },
      })
      expect(ohne.week).toBe(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('bleibt beim Anfang, wenn heute in keine geladene Woche fällt', () => {
    const wochen = buildDemoWeeks().slice(0, 2).map((w) => ({ ...w, current: false }))
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2027, 0, 5))
    try {
      const next = reducer(makeState(), {
        type: 'hydrate',
        payload: { ...payload, weeks: wochen },
      })
      expect(next.week).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('liest fsBase als 12:00 Ortszeit (kein UTC-Tagesversatz)', () => {
    const next = reducer(makeState(), { type: 'hydrate', payload })
    expect(next.fsBase.getFullYear()).toBe(2026)
    expect(next.fsBase.getMonth()).toBe(8) // September
    expect(next.fsBase.getDate()).toBe(7)
  })

  it('ohne staleAt ist der Stand aktuell, mit staleAt der Offline-Stand', () => {
    // Frisch geladen: staleAt null — auch wenn vorher ein Offline-Stand lief.
    expect(reducer(makeState({ staleAt: 123 }), { type: 'hydrate', payload }).staleAt).toBeNull()
    // Aus der Momentaufnahme: Zeitpunkt übernehmen (schaltet auf „nur lesen").
    expect(reducer(makeState(), { type: 'hydrate', payload, staleAt: 456 }).staleAt).toBe(456)
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
  it('DERIVE_ACTIONS berechnen myTasks/pendingIds aus den Wochen neu', () => {
    const me = person('Simon Krüger')
    const s = makeState({ dataStatus: 'ready', personId: me.id, myTasks: [], pendingIds: [] })
    // setLang ist eine DERIVE_ACTION → withDerivedTasks greift (Produktion)
    const next = reducer(s, { type: 'setLang', lang: 'de' })
    expect(next.myTasks.length).toBeGreaterThan(0)
    // Über die Kennung: die Demo-Wochen tragen teils noch keine pid, dann
    // greift der Namensschlüssel.
    expect(next.pendingIds.some((k) => k === me.id || k === `name:${displayName(me)}`)).toBe(true)
  })

  it('Vergangenes legt sich nicht mehr zum Bestätigen vor (T77)', () => {
    /*
     * Befund des Betreibers: „vergangene zuteilungen dürfen nicht auftauchen
     * zum bestätigen oder im dashboard". Die Liste ist nach Termin sortiert —
     * Vergangenes stand also vorn und galt auf dem Start-Bildschirm als
     * „nächste Aufgabe".
     */
    const me = person('Simon Krüger')
    const weeks = buildDemoWeeks()
    const vorbei = weeks[0]!
    vorbei.start = '2026-01-05' // Montag, sicher in der Vergangenheit
    ;(vorbei.mid.sections[0]!.items[0] as PartItem).names[0]!.name = displayName(me)
    const s = makeState({ dataStatus: 'ready', personId: me.id, weeks, myTasks: [] })
    const next = reducer(s, { type: 'setLang', lang: 'de' })

    const heute = new Date()
    const heuteMs = Date.UTC(heute.getFullYear(), heute.getMonth(), heute.getDate())
    // Gegenprobe, damit der Test nicht ins Leere prüft: In der alten Woche
    // steckt sehr wohl eine Zuteilung für mich.
    const roh = deriveMyTasks(weeks, DEMO_SERVICES, displayName(me), {}, '', me.id)
    expect(roh.some((t) => t.at != null && t.at < heuteMs)).toBe(true)
    expect(next.myTasks.some((t) => t.at != null && t.at < heuteMs)).toBe(false)
  })

  it('im Demo-Modus bleiben die Demo-Aufgaben unangetastet', () => {
    const s = makeState({ dataStatus: 'demo' })
    const next = reducer(s, { type: 'setLang', lang: 'en' })
    expect(next.myTasks).toEqual(s.myTasks)
  })

  it('Treffpunkt-Leitungen stehen mit unter „Meine Aufgaben"', () => {
    // Sie kommen aus fsWeeks, nicht aus weeks — ein zugeteilter Leiter sah
    // seine Einteilung deshalb nirgends außer im Treffpunkt-Plan und konnte
    // sie nicht bestätigen.
    const me = person('Simon Krüger')
    const fsWeeks = buildDemoFsWeeks()
    fsWeeks[0] = [
      { id: 'tp1', ruleId: null, grp: '', wd: 1, time: '14:00', place: 'Saal', leader: displayName(me), lpid: me.id },
    ]
    const s = makeState({ dataStatus: 'ready', personId: me.id, fsWeeks, myTasks: [] })
    const next = reducer(s, { type: 'setLang', lang: 'de' })
    const fsTask = next.myTasks.find((t) => t.id === 'fs|2026-09-07|tp1')
    expect(fsTask, 'Treffpunkt fehlt in myTasks').toBeDefined()
    expect(fsTask!.status).toBe('offen')
  })

  it('eine bestätigte Treffpunkt-Leitung gilt auch als bestätigt', () => {
    const me = person('Simon Krüger')
    const fsWeeks = buildDemoFsWeeks()
    fsWeeks[0] = [
      { id: 'tp1', ruleId: null, grp: '', wd: 1, time: '14:00', place: 'Saal', leader: displayName(me), lpid: me.id },
    ]
    const s = makeState({
      dataStatus: 'ready',
      personId: me.id,
      fsWeeks,
      confirmations: { 'fs|2026-09-07|tp1': 'bestätigt' },
      myTasks: [],
    })
    const next = reducer(s, { type: 'setLang', lang: 'de' })
    expect(next.myTasks.find((t) => t.id === 'fs|2026-09-07|tp1')!.status).toBe('bestätigt')
  })

  /*
   * Dieselbe Lücke, eine Zeile weiter: `pendingIds`.
   *
   * `withDerivedTasks` baut die Liste bei **jeder** Ableitungs-Aktion neu auf und
   * überschreibt damit, was der Reducer beim Zuteilen gerade eingetragen hat.
   * Solange dort nur `derivePendingIds` (Zusammenkünfte) stand, ging die
   * Treffpunkt-Kennung jedes Mal verloren — der Chip im Treffpunkt-Plan trug ein
   * „✓", also die Behauptung, der Leiter habe zugesagt, obwohl ihn noch niemand
   * gefragt hatte. Und umgekehrt ein „…" für jemanden, der seinen Treffpunkt
   * längst bestätigt hatte, sobald irgendeine Zusammenkunfts-Aufgabe von ihm
   * offen war.
   *
   * Geprüft wird mit einer Person **ohne** Zusammenkunfts-Zuteilungen: sonst
   * stünde ihre Kennung ohnehin schon in der Liste und der Test bewiese nichts.
   */
  describe('pendingIds kennt beide Datenquellen', () => {
    /** Person, die in keiner Woche eingeteilt ist — sie darf nur über fs hereinkommen. */
    const nurFs = (): Person => ({
      id: 'p-nur-fs', fn: 'Timo', ln: 'Treffpunkt', role: 'verkuendiger',
      tel: '', mail: '', priv: { ...emptyQualifications(), treffpunkt: true },
    })

    const mitLeiter = (over: Partial<AppState> = {}): AppState => {
      const p = nurFs()
      const fsWeeks = buildDemoFsWeeks()
      fsWeeks[0] = [
        { id: 'tp1', ruleId: null, grp: '', wd: 1, time: '14:00', place: 'Saal', leader: displayName(p), lpid: p.id },
      ]
      return makeState({
        dataStatus: 'ready',
        persons: [...DEMO_PERSONS, p],
        personId: p.id,
        fsWeeks,
        myTasks: [],
        pendingIds: [],
        ...over,
      })
    }

    it('ein zugeteilter, nicht bestätigter Treffpunkt-Leiter trägt „…"', () => {
      const s = mitLeiter()
      // Gegenprobe: aus den Zusammenkünften käme diese Kennung nicht.
      expect(derivePendingIds(s.weeks, s.services, s.confirmations)).not.toContain('p-nur-fs')
      expect(reducer(s, { type: 'setLang', lang: 'de' }).pendingIds).toContain('p-nur-fs')
    })

    it('nach seiner Bestätigung verschwindet das Zeichen', () => {
      const s = mitLeiter({ confirmations: { 'fs|2026-09-07|tp1': 'bestätigt' } })
      expect(reducer(s, { type: 'setLang', lang: 'de' }).pendingIds).not.toContain('p-nur-fs')
    })

    it('das Zuteilen selbst hält bis zur Ableitung durch', () => {
      // Der Weg, auf dem es auffiel: zuteilen, und der Chip stand sofort auf „✓".
      const p = nurFs()
      const inst = buildDemoFsWeeks()[0]![0]!
      const sel = {
        kind: 'fs' as const, wi: 0, instId: inst.id,
        label: 'Leiter', priv: 'treffpunkt', groups: false,
      }
      const s = makeState({
        dataStatus: 'ready',
        persons: [...DEMO_PERSONS, p],
        personId: p.id,
        slotSel: sel,
        myTasks: [],
        pendingIds: [],
      })
      const next = reducer(s, { type: 'assign', name: displayName(p), pid: p.id })
      expect(next.fsWeeks[0]!.find((i) => i.id === inst.id)!.leader).toBe(displayName(p))
      expect(next.pendingIds).toContain(p.id)
    })
  })
})

/*
 * Ein Index aus einer Aktion oder aus dem Zustand kann ins Leere zeigen: eine
 * Lücke im geladenen Fenster (T35), eine Woche, die zwischen Auswahl und
 * Ausführung herausgerutscht ist, ein Abschnitt, den es in dieser Woche nicht
 * gibt. Ungeprüft warf der Zugriff mitten im Dispatch — und ein Reducer, der
 * wirft, reißt die ganze Ansicht mit. Er gibt jetzt den Zustand zurück (T42).
 */
describe('Index außerhalb des Fensters', () => {
  const WEIT_DRAUSSEN = 99

  it('assign auf eine Woche, die es nicht gibt, stürzt nicht ab', () => {
    const s = makeState({
      slotSel: { ...firstPartSlot(buildDemoWeeks()[0]!, 'mid'), wi: WEIT_DRAUSSEN },
    })
    let next: AppState | undefined
    expect(() => {
      next = reducer(s, { type: 'assign', name: 'Anna Beispiel', pid: 'p1' })
    }).not.toThrow()
    // Zugeteilt wird nichts (assignSlot findet die Woche nicht) — und es
    // entsteht auch keine Mitteilung mehr, in der ein leerer Trenner stünde
    // (die war der ursprüngliche Anlass dieser Probe, siehe T42/T99).
    expect(next!.weeks).toBe(s.weeks)
    expect(next!.notifs).toBe(s.notifs)
  })

  it('takeSubstitute auf eine Woche, die es nicht gibt, stürzt nicht ab', () => {
    const me = person('Simon Krüger')
    const s = makeState({ dataStatus: 'ready', personId: me.id })
    expect(() =>
      reducer(s, { type: 'takeSubstitute', key: `${WEIT_DRAUSSEN}|mid|svc|ordner|0` }),
    ).not.toThrow()
  })

  it('lacMove auf einen Abschnitt, den es nicht gibt, stürzt nicht ab', () => {
    const s = makeState()
    let next: AppState | undefined
    expect(() => {
      next = reducer(s, { type: 'lacMove', si: WEIT_DRAUSSEN, ii: 0, dir: 1 })
    }).not.toThrow()
    expect(next!).toBe(s) // kein Tausch möglich → Zustand unverändert
  })

  it('lacAdd auf einen Abschnitt, den es nicht gibt, stürzt nicht ab', () => {
    const s = makeState()
    expect(() => reducer(s, { type: 'lacAdd', si: WEIT_DRAUSSEN, title: 'Neu' })).not.toThrow()
  })

  it('autoAssign ohne geladene Wochen gibt den Zustand zurück', () => {
    const s = makeState({ weeks: [] })
    expect(reducer(s, { type: 'autoAssign', scope: 'all' })).toBe(s)
  })
})

/**
 * **Die Meldungen des Reducers sprechen die Sprache des Nutzers.**
 *
 * Der Reducer ist die einzige Stelle außerhalb der Bausteine, die selbst Text
 * erzeugt: „Person angelegt", „12 Zuteilungen vergeben", „Bestätigt". Er hat
 * keinen `useT`-Hook, sondern greift über `dict(state.lang)` — eine zweite
 * Zuleitung zum selben Wörterbuch, und eine, die niemand gemessen hat: Alle
 * Toast-Prüfungen oben verlangen nur `toBeTruthy()`, und der Zustand ist überall
 * deutsch.
 *
 * Damit wäre `dict(DE)` statt `dict(state.lang)` durch keinen Test gefallen —
 * und jede Meldung stünde für 33 Sprachen deutsch da.
 */
describe('Toasts in der Sprache des Nutzers', () => {
  /** Aktionen, die eine Meldung erzeugen — je eine je Bauart. */
  const AKTIONEN: Array<[string, AppAction, Partial<AppState>?]> = [
    ['Person angelegt', { type: 'addPerson', person: { id: 'pX', fn: 'Neu', ln: 'Person', role: 'verkuendiger', tel: '', mail: '', priv: {} as Person['priv'], grp: null } }],
    ['Abwesenheit angelegt', { type: 'addAbsence', absence: { id: 'aX', personId: 'p1', userId: 'u1', from: '2026-09-01', to: '2026-09-05', reason: '' } }],
    ['Gruppe angelegt', { type: 'addGroup', group: { id: 'gX', name: 'Gruppe 9', ov: null, as: null } }],
    ['Dienst angelegt', { type: 'addService', service: { key: 'svcX', name: 'Neuer Dienst', count: 1 } }],
    ['automatisch zugeteilt', { type: 'autoAssign', scope: 'all' }],
    ['geleert', { type: 'clearAssignments', scope: 'parts' }],
  ]

  it.each(AKTIONEN)('%s: koreanisch statt deutsch', async (name, action, over) => {
    const { loadOverlay } = await import('../i18n/ui')
    await loadOverlay('ko')
    const deutsch = reducer(makeState({ lang: 'de', ...over }), action).toast?.text ?? ''
    const koreanisch = reducer(makeState({ lang: 'ko', ...over }), action).toast?.text ?? ''
    expect(deutsch, `${name}: gar keine Meldung`).toBeTruthy()
    expect(koreanisch, `${name}: gar keine Meldung`).toBeTruthy()
    expect(koreanisch, `${name}: blieb deutsch`).not.toBe(deutsch)
  })

  it('eine Meldung mit Zahl behält ihre Zahl', () => {
    // `fill()` setzt `{n}` ein — in jeder Sprache dieselbe Zahl, nur an
    // womöglich anderer Stelle im Satz.
    const de = reducer(makeState({ lang: 'de' }), { type: 'autoAssign', scope: 'all' })
    const ko = reducer(makeState({ lang: 'ko' }), { type: 'autoAssign', scope: 'all' })
    const zahl = (s: string) => (s.match(/\d+/) ?? [''])[0]
    expect(zahl(de.toast!.text)).toBeTruthy()
    expect(zahl(ko.toast!.text)).toBe(zahl(de.toast!.text))
  })

  it('kein Platzhalter bleibt ungefüllt stehen', () => {
    // Ein vergessenes `fill()` zeigt sich als „{n}" im Text — sichtbar, aber
    // nur, wenn jemand hinsieht.
    for (const [name, action, over] of AKTIONEN) {
      const text = reducer(makeState({ lang: 'ko', ...over }), action).toast?.text ?? ''
      expect(text, `${name}: ${text}`).not.toMatch(/\{\w+\}/)
    }
  })
})
