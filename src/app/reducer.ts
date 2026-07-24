/**
 * Reiner App-Reducer — portiert die State-Übergänge der Prototyp-Logikklasse
 * (docs/design-handoff). Keine Nebeneffekte: Persistenz übernimmt persist.ts,
 * den Startzustand liefert init.ts, den Provider stellt store.tsx.
 */

import { buildImportWeek, CURRENT_PERSON_ID } from '../data/demo'
import { fsAddInst, fsRemoveInst, fsSetLeader, fsUpdateInst, regenFsWeeks } from '../data/fs'
import { displayName, overseerGroup } from '../data/helpers'
import { renameInWeeks } from '../lib/data'
import { localizedWeeks } from '../data/localize'
import {
  assignSlot,
  autoAssignMeeting,
  clearAssignments,
  changedSlotKeys,
  deriveMyTasks,
  derivePendingNames,
  swapPartConfirmations,
} from '../data/planning'
import {
  editTalkTheme,
  itemNameCount,
  lacAdd,
  lacAdjust,
  lacMove,
  lacMoveTarget,
  lacRemove,
  setOpeningSong,
} from '../data/meeting-edit'
import { dict, type Dict } from '../i18n/ui'
import { fill } from '../i18n/useT'
import { APP_TO_JW, congAppCode } from '../i18n/langs'
import type {
  ConfirmationMap,
  FsRule,
  MeetingKey,
  MeetingTab,
  Notification,
  NotificationType,
  Person,
  Screen,
} from '../data/types'
import type { AppAction, AppState } from './context'

/** Nächster Toast (id erzwingt Timer-/Animations-Neustart bei gleichem Text). */
function nextToast(state: AppState, text: string): AppState['toast'] {
  return { id: (state.toast?.id ?? 0) + 1, text }
}

/**
 * View-Tab auf eine echte Zusammenkunft eingrenzen. Der fs-Tab („Treffpunkte")
 * hat keine Meeting-Daten; die Meeting-Aktionen werden dort nie ausgelöst
 * (Navigation setzt den Tab beim Verlassen des Programms zurück).
 */
const mtab = (tab: MeetingTab): MeetingKey => (tab === 'fs' ? 'mid' : tab)

/** Toast aus einem übersetzten UI-Schlüssel (Reducer kennt state.lang). */
function toastKey(
  state: AppState,
  key: keyof Dict,
  params?: Record<string, string | number>,
): AppState['toast'] {
  return nextToast(state, fill(dict(state.lang)[key], params ?? {}))
}

function makeNotif(
  type: NotificationType,
  title: string,
  text: string,
  taskId?: string,
): Notification {
  return { id: crypto.randomUUID(), type, title, text, time: 'gerade eben', read: false, taskId }
}

/** Neue Mitteilung vorne anfügen. */
function pushNotif(
  notifs: Notification[],
  type: NotificationType,
  title: string,
  text: string,
): Notification[] {
  return [makeNotif(type, title, text), ...notifs]
}

/**
 * Beim Anlegen abgebrochene Personen (komplett ohne Namen) werden beim
 * Verlassen des Details automatisch wieder entfernt — sonst blieben durch das
 * Auto-Speichern leere Einträge in der Liste stehen.
 */
export function isNameless(p: Person): boolean {
  return !`${p.fn}${p.ln}${p.dn ?? ''}`.trim()
}

function dropNamelessSelected(state: AppState): AppState {
  const sel = state.selectedPersonId
  if (!sel) return state
  const person = state.persons.find((p) => p.id === sel)
  if (!person || !isNameless(person)) return state
  return { ...state, persons: state.persons.filter((p) => p.id !== sel) }
}

/** Bestätigungs-Status der angegebenen Slots aus der Map entfernen. */
function dropConfirmations(map: ConfirmationMap, keys: string[]): ConfirmationMap {
  if (keys.length === 0 || keys.every((k) => !(k in map))) return map
  const next = { ...map }
  for (const k of keys) delete next[k]
  return next
}

/** Anzeigename des eingeloggten Nutzers (für pendingNames-Pflege). */
function currentUserName(state: AppState): string {
  const id = state.personId ?? CURRENT_PERSON_ID
  const me = state.persons.find((p) => p.id === id)
  return me ? displayName(me) : ''
}

/**
 * Produktionsmodus: myTasks/pendingNames aus Wochen + Bestätigungen ableiten
 * (im Demo-Modus bleiben die Demo-Daten unangetastet). `openConfirm` öffnet
 * nach der Hydration das Bestätigungs-Modal, falls offene Aufgaben existieren.
 */
function withDerivedTasks(state: AppState, openConfirm: boolean): AppState {
  if (state.dataStatus === 'demo') return state
  const me = state.persons.find((p) => p.id === state.personId)
  // Aufgaben-Titel in der Programmsprache des Nutzers ableiten (Sprachvariante
  // der Wochen, falls vorhanden) — Slot-Pfade/Namen sind variantenunabhängig.
  const jwCode = state.lang !== congAppCode(state.congLang) ? APP_TO_JW[state.lang] : undefined
  const weeks = localizedWeeks(state.weeks, jwCode)
  const myTasks = me
    ? deriveMyTasks(weeks, state.services, displayName(me), state.confirmations)
    : []
  return {
    ...state,
    myTasks,
    pendingNames: derivePendingNames(weeks, state.services, state.confirmations),
    confirmOpen: (openConfirm || state.confirmOpen) && myTasks.some((t) => t.status === 'offen'),
  }
}

/** Aktionen, nach denen die Aufgaben-Ableitung neu berechnet werden muss. */
const DERIVE_ACTIONS: ReadonlySet<AppAction['type']> = new Set<AppAction['type']>([
  'hydrate',
  'assign',
  'autoAssign',
  'clearAssignments',
  'finishImport',
  'addImportedWeek',
  'mergeWeekAlt',
  'updatePerson',
  'lacAdjust',
  'lacRemove',
  'lacMove',
  'lacAdd',
  'talkEdit',
  'openingSong',
  'addService',
  'removeService',
  'changeServiceCount',
  'confirmTask',
  'declineTask',
  // Sprachwechsel ändert die Programmsprache der abgeleiteten Aufgaben-Titel
  'setLang',
  'setCongLang',
])

export function reducer(state: AppState, action: AppAction): AppState {
  const next = baseReducer(state, action)
  return DERIVE_ACTIONS.has(action.type)
    ? withDerivedTasks(next, action.type === 'hydrate')
    : next
}

function baseReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'login':
      return {
        ...state,
        screen: 'start',
        confirmOpen: state.myTasks.some((t) => t.status === 'offen'),
      }
    case 'logout':
      return {
        ...state,
        screen: 'login',
        notifOpen: false,
        slotSel: null,
        selectedPersonId: null,
        langSheetOpen: false,
        s89: null,
        confirmOpen: false,
        recovery: false,
      }
    case 'navigate': {
      // Rechteprüfung: Nicht-Planer landen im Programm. Gruppenaufseher dürfen
      // zusätzlich Planen + Einstellungen (dort nur ihre Treffpunkte), aber nicht
      // Personen.
      const plannerOnly: Screen[] = ['planen', 'personen', 'einstellungen']
      const fsOverseer =
        !state.planner && overseerGroup(state.groups, state.personId ?? CURRENT_PERSON_ID) !== null
      const blocked =
        !state.planner &&
        plannerOnly.includes(action.screen) &&
        !(fsOverseer && action.screen !== 'personen')
      const screen = blocked ? 'programm' : action.screen
      // Der fs-Tab („Treffpunkte") gibt es nur in Programm/Planen — beim Wechsel
      // in andere Ansichten auf die Zusammenkunft unter der Woche zurücksetzen.
      const fsOk = screen === 'programm' || screen === 'planen'
      const tab: MeetingTab = state.tab === 'fs' && !fsOk ? 'mid' : state.tab
      return {
        ...dropNamelessSelected(state),
        screen,
        tab,
        notifOpen: false,
        slotSel: null,
        selectedPersonId: null,
        langSheetOpen: false,
      }
    }
    case 'prevWeek':
      return { ...state, week: Math.max(0, state.week - 1) }
    case 'nextWeek':
      return { ...state, week: Math.min(state.weeks.length - 1, state.week + 1) }
    case 'setTab':
      return { ...state, tab: action.tab }
    case 'setTheme':
      return { ...state, theme: action.theme }
    case 'openNotifs':
      return { ...state, notifOpen: true }
    case 'closeNotifs':
      return { ...state, notifOpen: false }
    case 'markAllRead':
      return { ...state, notifs: state.notifs.map((n) => ({ ...n, read: true })) }
    case 'clearNotifs':
      return { ...state, notifs: [] }
    case 'openSlot':
      return { ...state, slotSel: action.sel }
    case 'closeSlot':
      return { ...state, slotSel: null }
    case 'addAbsence':
      return {
        ...state,
        absences: [...state.absences, action.absence],
        toast: toastKey(state, 'toastAbwAdd'),
      }
    case 'removeAbsence':
      return {
        ...state,
        absences: state.absences.filter((a) => a.id !== action.id),
        toast: toastKey(state, 'toastAbwDel'),
      }
    case 'selectPerson':
      return { ...dropNamelessSelected(state), selectedPersonId: action.id }
    case 'removePerson': {
      // Person löschen: Referenzen lösen (Gruppenleitung, Konto, offene
      // Codes); Namen in bereits geplanten Wochen bleiben als Text stehen.
      return {
        ...state,
        persons: state.persons.filter((p) => p.id !== action.id),
        groups: state.groups.map((g) => ({
          ...g,
          ov: g.ov === action.id ? null : g.ov,
          as: g.as === action.id ? null : g.as,
        })),
        members: state.members.map((m) =>
          m.personId === action.id ? { ...m, personId: null } : m,
        ),
        invites: state.invites.map((i) =>
          i.personId === action.id ? { ...i, personId: null } : i,
        ),
        selectedPersonId: null,
        toast: toastKey(state, 'toastPersonDel'),
      }
    }
    case 'addPerson':
      return {
        ...state,
        persons: [...state.persons, action.person],
        selectedPersonId: action.person.id,
        toast: toastKey(state, 'toastPersonNeu'),
      }
    case 'updatePerson': {
      const oldPerson = state.persons.find((p) => p.id === action.id)
      const next = {
        ...state,
        persons: state.persons.map((p) => (p.id === action.id ? { ...p, ...action.patch } : p)),
      }
      // Namensänderung in bereits geplanten Wochen (und pendingNames)
      // nachziehen — der Anzeigename ist der in den Wochen gespeicherte Text.
      if (oldPerson && ('fn' in action.patch || 'ln' in action.patch || 'dn' in action.patch)) {
        const oldName = displayName(oldPerson)
        const newName = displayName({ ...oldPerson, ...action.patch })
        if (oldName !== newName) {
          next.weeks = renameInWeeks(state.weeks, oldName, newName)
          next.pendingNames = state.pendingNames.map((n) => (n === oldName ? newName : n))
        }
      }
      // Planer-Recht in verknüpfte Konten und offene Einladungscodes spiegeln
      // (members.planner = Quelle der Rechteprüfung); das eigene Konto ist per
      // UI-Sperre ausgenommen.
      if ('planner' in action.patch) {
        const on = Boolean(action.patch.planner)
        next.members = state.members.map((m) =>
          m.personId === action.id && m.userId !== state.userId ? { ...m, planner: on } : m,
        )
        next.invites = state.invites.map((i) =>
          i.personId === action.id ? { ...i, planner: on } : i,
        )
      }
      return next
    }
    case 'changeServiceCount':
      return {
        ...state,
        services: state.services.map((s) =>
          s.key === action.key
            ? { ...s, count: Math.min(6, Math.max(1, s.count + action.delta)) }
            : s,
        ),
      }
    case 'removeService':
      return {
        ...state,
        services: state.services.filter((s) => s.key !== action.key),
        toast: toastKey(state, 'toastDienstDel'),
      }
    case 'addService':
      return {
        ...state,
        services: [...state.services, action.service],
        toast: toastKey(state, 'toastDienstAdd'),
      }
    case 'addGroup':
      return {
        ...state,
        groups: [...state.groups, action.group],
        toast: toastKey(state, 'toastGruppeNeu'),
      }
    case 'removeGroup':
      return {
        ...state,
        groups: state.groups.filter((g) => g.id !== action.id),
        // Mitglieder der gelöschten Gruppe verlieren ihre Zuordnung
        persons: state.persons.map((p) => (p.grp === action.id ? { ...p, grp: null } : p)),
        toast: toastKey(state, 'toastGruppeDel'),
      }
    case 'updateGroup':
      return {
        ...state,
        groups: state.groups.map((g) => (g.id === action.id ? { ...g, ...action.patch } : g)),
      }
    case 'updateCongregation':
      return { ...state, congregation: { ...state.congregation, ...action.patch } }
    case 'updateMember':
      return {
        ...state,
        members: state.members.map((m) =>
          m.userId === action.userId ? { ...m, ...action.patch } : m,
        ),
      }
    case 'removeMember':
      return {
        ...state,
        members: state.members.filter((m) => m.userId !== action.userId),
        toast: toastKey(state, 'toastMitgliedEntfernt'),
      }
    case 'addInvite':
      return {
        ...state,
        invites: [...state.invites, action.invite],
        toast: toastKey(state, 'toastEinladungErstellt'),
      }
    case 'removeInvite':
      return {
        ...state,
        invites: state.invites.filter((i) => i.id !== action.id),
        toast: toastKey(state, 'toastEinladungGeloescht'),
      }
    case 'setRecovery':
      return { ...state, recovery: action.on }
    case 'startImport':
      return state.importing || state.imported ? state : { ...state, importing: true }
    case 'finishImport': {
      if (state.imported) return state
      const week = buildImportWeek()
      return {
        ...state,
        weeks: [...state.weeks, week],
        importing: false,
        imported: true,
        notifs: pushNotif(
          state.notifs,
          'import',
          'Programm importiert',
          `${week.range} · ${week.book} — ohne Zuteilungen`,
        ),
        toast: toastKey(state, 'toastImportiert'),
      }
    }
    case 'addImportedWeek': {
      const week = action.week
      return {
        ...state,
        weeks: [...state.weeks, week],
        importing: false,
        notifs: pushNotif(
          state.notifs,
          'import',
          'Programm importiert',
          `${week.range} · ${week.book} — ohne Zuteilungen`,
        ),
        toast: toastKey(state, 'toastImportiert'),
      }
    }
    case 'mergeWeekAlt':
      // Nachgeladene Sprachvarianten in die bestehende Woche mischen
      return {
        ...state,
        weeks: state.weeks.map((w, i) =>
          i === action.wi ? { ...w, alt: { ...w.alt, ...action.alt } } : w,
        ),
      }
    case 'stopImport':
      return { ...state, importing: false }
    case 'assign': {
      // Zuteilen bzw. Entfernen ("") + Mitteilung (Prototyp: assignTo)
      const sel = state.slotSel
      if (!sel) return state
      // Treffpunkt-Leiter: eigene Datenquelle (fsWeeks), kein Bestätigungs-Slot.
      if (sel.kind === 'fs') {
        const fsWeeks = fsSetLeader(state.fsWeeks, sel.wi, sel.instId, action.name)
        const notifs = action.name
          ? pushNotif(
              state.notifs,
              'gesendet',
              'Zuteilung gesendet',
              `${action.name} — ${dict(state.lang).fsShort} · ${state.weeks[sel.wi].range}`,
            )
          : state.notifs
        const pendingNames =
          action.name && !state.pendingNames.includes(action.name)
            ? [...state.pendingNames, action.name]
            : state.pendingNames
        return {
          ...state,
          fsWeeks,
          notifs,
          pendingNames,
          slotSel: null,
          toast: action.name ? toastKey(state, 'toastZugeteilt') : toastKey(state, 'toastEntfernt'),
        }
      }
      const weeks = assignSlot(state.weeks, sel, action.name, action.rolle)
      const notifs = action.name
        ? pushNotif(
            state.notifs,
            'gesendet',
            'Zuteilung gesendet',
            `${action.name} — ${sel.label} · ${state.weeks[sel.wi].range}`,
          )
        : state.notifs
      // Externe Redner (Gastredner/Kreisaufseher) haben keinen Bestätigungs-Flow
      const isGuest = sel.kind === 'part' && sel.guest
      const pendingNames =
        action.name && !isGuest && !state.pendingNames.includes(action.name)
          ? [...state.pendingNames, action.name]
          : state.pendingNames
      return {
        ...state,
        weeks,
        notifs,
        pendingNames,
        // Geänderte Slots: alten Bestätigungs-Status abräumen (sonst erbt die
        // neue Person ein fremdes „bestätigt“/„verhindert“)
        confirmations: dropConfirmations(
          state.confirmations,
          changedSlotKeys(state.weeks[sel.wi][sel.tab], weeks[sel.wi][sel.tab], state.services, sel.wi, sel.tab),
        ),
        slotSel: null,
        toast: action.name ? toastKey(state, 'toastZugeteilt') : toastKey(state, 'toastEntfernt'),
      }
    }
    case 'autoAssign': {
      if (!state.weeks[state.week]) return state // keine Wochen geladen
      const { weeks, count, newly, unfilled } = autoAssignMeeting(
        state.weeks,
        state.week,
        mtab(state.tab),
        state.persons,
        state.services,
        state.groups,
        action.scope,
      )
      if (count === 0) {
        // Offen gebliebene, aber nicht besetzbare Slots (keine passende/freie
        // Person) klar von „nichts offen“ unterscheiden.
        const key = unfilled > 0 ? 'toastKeinePassende' : 'toastKeineOffen'
        return { ...state, toast: toastKey(state, key) }
      }
      const pending = new Set(state.pendingNames)
      for (const n of newly) pending.add(n)
      const notifs = pushNotif(
        state.notifs,
        'gesendet',
        'Zuteilungen gesendet',
        `${count} Zuteilungen · ${state.weeks[state.week].range}`,
      )
      return {
        ...state,
        weeks,
        notifs,
        pendingNames: [...pending],
        confirmations: dropConfirmations(
          state.confirmations,
          changedSlotKeys(
            state.weeks[state.week][mtab(state.tab)],
            weeks[state.week][mtab(state.tab)],
            state.services,
            state.week,
            mtab(state.tab),
          ),
        ),
        toast: toastKey(state, 'toastAutoN', { n: count }),
      }
    }
    case 'clearAssignments': {
      if (!state.weeks[state.week]) return state // keine Wochen geladen
      const { weeks, count } = clearAssignments(state.weeks, state.week, mtab(state.tab), action.scope)
      if (count === 0) return { ...state, toast: toastKey(state, 'toastGeleertN', { n: 0 }) }
      return {
        ...state,
        weeks,
        confirmations: dropConfirmations(
          state.confirmations,
          changedSlotKeys(
            state.weeks[state.week][mtab(state.tab)],
            weeks[state.week][mtab(state.tab)],
            state.services,
            state.week,
            mtab(state.tab),
          ),
        ),
        toast: toastKey(state, 'toastGeleertN', { n: count }),
      }
    }
    case 'fsInstUpdate':
      return { ...state, fsWeeks: fsUpdateInst(state.fsWeeks, action.wi, action.id, action.patch) }
    case 'fsInstRemove':
      return {
        ...state,
        fsWeeks: fsRemoveInst(state.fsWeeks, action.wi, action.id),
        toast: toastKey(state, 'toastFsDel'),
      }
    case 'fsInstAdd':
      return {
        ...state,
        fsWeeks: fsAddInst(state.fsWeeks, state.week, action.inst),
        toast: toastKey(state, 'toastFsAdd'),
      }
    case 'fsRuleAdd': {
      const rule: FsRule = {
        id: `r${Date.now()}`,
        grp: action.grp,
        wd: 6,
        time: '09:30',
        place: '',
        monthly: 0,
        skipCong: action.grp !== '',
      }
      const fsRules = [...state.fsRules, rule]
      return {
        ...state,
        fsRules,
        fsWeeks: regenFsWeeks(state.fsBase, state.fsWeeks, fsRules),
        toast: toastKey(state, 'toastFsRuleAdd'),
      }
    }
    case 'fsRuleUpdate': {
      const fsRules = state.fsRules.map((r) => (r.id === action.id ? { ...r, ...action.patch } : r))
      return { ...state, fsRules, fsWeeks: regenFsWeeks(state.fsBase, state.fsWeeks, fsRules) }
    }
    case 'fsRuleRemove': {
      const fsRules = state.fsRules.filter((r) => r.id !== action.id)
      return {
        ...state,
        fsRules,
        fsWeeks: regenFsWeeks(state.fsBase, state.fsWeeks, fsRules),
        toast: toastKey(state, 'toastFsRuleDel'),
      }
    }
    case 'confirmTask': {
      // Produktionsmodus: Status in die ConfirmationMap — myTasks/pending-
      // Names/confirmOpen folgen aus der Ableitung (withDerivedTasks).
      if (state.dataStatus !== 'demo') {
        return {
          ...state,
          confirmations: { ...state.confirmations, [action.id]: 'bestätigt' },
          toast: toastKey(state, 'toastBestaetigt'),
        }
      }
      const myTasks = state.myTasks.map((t) =>
        t.id === action.id ? { ...t, status: 'bestätigt' as const } : t,
      )
      const stillOpen = myTasks.some((t) => t.status === 'offen')
      const myName = currentUserName(state)
      const pendingNames = stillOpen
        ? state.pendingNames
        : state.pendingNames.filter((n) => n !== myName)
      return {
        ...state,
        myTasks,
        pendingNames,
        confirmOpen: state.confirmOpen && stillOpen,
        toast: toastKey(state, 'toastBestaetigt'),
      }
    }
    case 'declineTask': {
      const task = state.myTasks.find((t) => t.id === action.id)
      const notif = makeNotif(
        'verhindert',
        'Verhinderung gemeldet',
        `${task?.title ?? ''} — ${currentUserName(state)}`,
      )
      if (state.dataStatus !== 'demo') {
        return {
          ...state,
          confirmations: { ...state.confirmations, [action.id]: 'verhindert' },
          notifs: [notif, ...state.notifs],
          toast: toastKey(state, 'toastVerhindert'),
        }
      }
      const myTasks = state.myTasks.map((t) =>
        t.id === action.id ? { ...t, status: 'verhindert' as const } : t,
      )
      const stillOpen = myTasks.some((t) => t.status === 'offen')
      return {
        ...state,
        myTasks,
        confirmOpen: state.confirmOpen && stillOpen,
        notifs: [notif, ...state.notifs],
        toast: toastKey(state, 'toastVerhindert'),
      }
    }
    case 'openS89':
      return { ...state, s89: action.payload }
    case 'closeS89':
      return { ...state, s89: null }
    case 'lacAdjust':
      return {
        ...state,
        weeks: lacAdjust(state.weeks, state.week, mtab(state.tab), action.si, action.ii, action.delta),
      }
    case 'lacRemove':
      return {
        ...state,
        weeks: lacRemove(state.weeks, state.week, mtab(state.tab), action.si, action.ii),
        toast: toastKey(state, 'toastLacDel'),
      }
    case 'lacMove': {
      const weeks = lacMove(state.weeks, state.week, mtab(state.tab), action.si, action.ii, action.dir)
      if (weeks === state.weeks) return state // Rand: kein Tausch
      // Bestätigungen der beiden getauschten Positionen mitnehmen (task_keys
      // sind positionsbasiert) — sonst erbt der Nachbar den fremden Status.
      const items = state.weeks[state.week][mtab(state.tab)].sections[action.si].items
      const b = lacMoveTarget(items, action.ii, action.dir)
      const confirmations =
        b == null
          ? state.confirmations
          : swapPartConfirmations(
              state.confirmations,
              state.week,
              mtab(state.tab),
              action.si,
              action.ii,
              b,
              Math.max(itemNameCount(items[action.ii]), itemNameCount(items[b])),
            )
      return { ...state, weeks, confirmations }
    }
    case 'lacAdd':
      return {
        ...state,
        weeks: lacAdd(state.weeks, state.week, mtab(state.tab), action.si, action.title),
        toast: toastKey(state, 'toastLacAdd'),
      }
    case 'talkEdit':
      return {
        ...state,
        weeks: editTalkTheme(state.weeks, state.week, action.si, action.ii, action.title),
      }
    case 'openingSong':
      return {
        ...state,
        weeks: setOpeningSong(state.weeks, state.week, action.song),
      }
    case 'changeReminder': {
      const bounds = action.key === 'first' ? { min: 1, max: 21 } : { min: 0, max: 7 }
      const value = Math.max(bounds.min, Math.min(bounds.max, state.reminders[action.key] + action.delta))
      return { ...state, reminders: { ...state.reminders, [action.key]: value } }
    }
    case 'toggleReminderRepeat':
      return { ...state, reminders: { ...state.reminders, repeat: !state.reminders.repeat } }
    case 'setLang':
      return { ...state, lang: action.lang }
    case 'openLangSheet':
      return { ...state, langSheetOpen: true, langSheetFor: action.mode ?? 'cong', slotSel: null }
    case 'closeLangSheet':
      return { ...state, langSheetOpen: false, langSearch: '' }
    case 'setLangSearch':
      return { ...state, langSearch: action.text }
    case 'setCongLang':
      return { ...state, congLang: action.name, langSheetOpen: false, langSearch: '' }
    case 'addProgLang': {
      // Versammlungssprache selbst und Duplikate ergeben keine Variante
      const skip = action.name === state.congLang || state.progLangs.includes(action.name)
      return {
        ...state,
        progLangs: skip ? state.progLangs : [...state.progLangs, action.name],
        langSheetOpen: false,
        langSearch: '',
        toast: skip ? state.toast : toastKey(state, 'toastProgLangAdd'),
      }
    }
    case 'removeProgLang':
      return {
        ...state,
        progLangs: state.progLangs.filter((n) => n !== action.name),
        toast: toastKey(state, 'toastProgLangDel'),
      }
    case 'hydrate': {
      const p = action.payload
      return {
        ...state,
        congregation: p.congregation,
        congregationId: p.congregationId,
        userId: p.userId,
        personId: p.personId,
        planner: p.planner,
        dataStatus: 'ready',
        dataEmpty: p.empty,
        persons: p.persons,
        services: p.services,
        groups: p.groups,
        weeks: p.weeks,
        fsRules: p.fsRules,
        fsWeeks: p.fsWeeks,
        // ISO-Datum als 12:00 Ortszeit lesen (nicht UTC-Mitternacht) — sonst
        // rutscht die Basis in westlichen Zeitzonen auf den Vortag.
        fsBase: p.fsBase ? new Date(`${p.fsBase}T12:00:00`) : state.fsBase,
        absences: p.absences,
        notifs: p.notifications,
        confirmations: p.confirmations,
        reminders: p.reminders,
        congLang: p.congLang,
        progLangs: p.progLangs,
        members: p.members,
        invites: p.invites,
        week: 0,
      }
    }
    case 'setDataStatus':
      return { ...state, dataStatus: action.status, userId: action.userId ?? state.userId }
    case 'showToast':
      return { ...state, toast: nextToast(state, action.text) }
    case 'hideToast':
      return { ...state, toast: null }
  }
}
