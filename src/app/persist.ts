/**
 * Nebeneffekt-Schicht: schreibt die zu einer Aktion gehörende Änderung nach
 * Supabase (Fire-and-forget über lib/data). Läuft nur im konfigurierten,
 * hydrierten Zustand. Der Reducer bleibt rein; hier werden `prev`/`next`
 * (Zustand vor/nach der Aktion) ausgewertet.
 */

import { changedSlotKeys, partSwapKeyPairs } from '../data/planning'
import { itemNameCount, lacMoveTarget } from '../data/meeting-edit'
import {
  deleteAbsenceRow,
  deleteConfirmationRows,
  swapConfirmationKeys,
  deleteGroupRow,
  deletePersonRow,
  deleteInviteRow,
  deleteMemberRow,
  deleteNotifications,
  deleteServiceRow,
  insertNotifications,
  markNotificationsRead,
  saveAbsence,
  saveConfirmation,
  saveCongregationInfo,
  saveGroupRow,
  saveInvite,
  saveInvitePlanner,
  saveMemberRow,
  savePerson,
  savePersonGroup,
  saveService,
  saveSettings,
  saveWeek,
} from '../lib/data'
import { supabase } from '../lib/supabase'
import type { Person, Week } from '../data/types'
import type { AppAction, AppState } from './context'

/**
 * Debounce für Personen-Edits: jede Feldänderung dispatcht `updatePerson`;
 * statt pro Tastenanschlag zu schreiben, wird der Save je Person gebündelt
 * (Timer wird bei jeder weiteren Änderung neu gestartet) und beim Verlassen
 * des Details sofort nachgeholt (flushPersonSaves).
 */
const PERSON_SAVE_DELAY = 600
const pendingPersonSaves = new Map<string, ReturnType<typeof setTimeout>>()

/** Ausstehenden Save einer Person verwerfen (vor dem Löschen). */
function cancelPersonSave(id: string): void {
  const timer = pendingPersonSaves.get(id)
  if (timer) {
    clearTimeout(timer)
    pendingPersonSaves.delete(id)
  }
}

function schedulePersonSave(congId: string, person: Person): void {
  const timer = pendingPersonSaves.get(person.id)
  if (timer) clearTimeout(timer)
  pendingPersonSaves.set(
    person.id,
    setTimeout(() => {
      pendingPersonSaves.delete(person.id)
      savePerson(congId, person)
    }, PERSON_SAVE_DELAY),
  )
}

function flushPersonSaves(congId: string, state: AppState): void {
  for (const [id, timer] of pendingPersonSaves) {
    clearTimeout(timer)
    pendingPersonSaves.delete(id)
    const person = state.persons.find((p) => p.id === id)
    if (person) savePerson(congId, person)
  }
}

/**
 * Debounce für Wochen-Schreibvorgänge aus einer Personen-Umbenennung: der
 * Rename läuft je Tastenanschlag (updatePerson) — statt jede betroffene Woche
 * pro Anschlag zu schreiben, werden sie gebündelt (neueste Fassung je Index)
 * und nach kurzer Ruhe bzw. beim Verlassen des Details geschrieben.
 */
const pendingWeekSaves = new Map<number, Week>()
let weekSaveTimer: ReturnType<typeof setTimeout> | null = null

function scheduleWeekSaves(congId: string, indices: number[], weeks: Week[]): void {
  for (const i of indices) pendingWeekSaves.set(i, weeks[i])
  if (weekSaveTimer) clearTimeout(weekSaveTimer)
  weekSaveTimer = setTimeout(() => flushWeekSaves(congId), PERSON_SAVE_DELAY)
}

function flushWeekSaves(congId: string): void {
  if (weekSaveTimer) {
    clearTimeout(weekSaveTimer)
    weekSaveTimer = null
  }
  for (const [i, week] of pendingWeekSaves) saveWeek(congId, i, week)
  pendingWeekSaves.clear()
}

/** Gleiche Debounce-Mechanik für die Versammlungs-Stammdaten. */
let congSaveTimer: ReturnType<typeof setTimeout> | null = null

function scheduleCongregationSave(congId: string, info: AppState['congregation']): void {
  if (congSaveTimer) clearTimeout(congSaveTimer)
  congSaveTimer = setTimeout(() => {
    congSaveTimer = null
    saveCongregationInfo(congId, info)
  }, PERSON_SAVE_DELAY)
}

function flushCongregationSave(congId: string, state: AppState): void {
  if (!congSaveTimer) return
  clearTimeout(congSaveTimer)
  congSaveTimer = null
  saveCongregationInfo(congId, state.congregation)
}

export function persist(prev: AppState, next: AppState, action: AppAction): void {
  const congId = next.congregationId
  const userId = next.userId
  if (!supabase || !congId || !userId) return

  switch (action.type) {
    case 'assign': {
      const sel = prev.slotSel
      if (sel) {
        saveWeek(congId, sel.wi, next.weeks[sel.wi])
        // Bestätigungs-Einträge geänderter Slots abräumen (migration-007)
        deleteConfirmationRows(
          congId,
          changedSlotKeys(
            prev.weeks[sel.wi][sel.tab],
            next.weeks[sel.wi][sel.tab],
            prev.services,
            sel.wi,
            sel.tab,
          ),
        )
      }
      break
    }
    case 'autoAssign': {
      const before = prev.weeks[prev.week]?.[prev.tab]
      const after = next.weeks[prev.week]?.[prev.tab]
      if (before && after) {
        // Bestätigungs-Einträge geänderter Slots abräumen (migration-007)
        deleteConfirmationRows(
          congId,
          changedSlotKeys(before, after, prev.services, prev.week, prev.tab),
        )
        saveWeek(congId, prev.week, next.weeks[prev.week])
      }
      break
    }
    case 'lacMove': {
      if (next.weeks === prev.weeks) break // Rand: kein Tausch
      saveWeek(congId, prev.week, next.weeks[prev.week])
      // Bestätigungen der getauschten Positionen in der DB mittauschen
      const items = prev.weeks[prev.week][prev.tab].sections[action.si].items
      const b = lacMoveTarget(items, action.ii, action.dir)
      if (b != null) {
        const count = Math.max(itemNameCount(items[action.ii]), itemNameCount(items[b]))
        void swapConfirmationKeys(
          congId,
          partSwapKeyPairs(prev.week, prev.tab, action.si, action.ii, b, count),
        )
      }
      break
    }
    case 'lacAdjust':
    case 'lacRemove':
    case 'lacAdd':
    case 'talkEdit':
    case 'openingSong':
      saveWeek(congId, prev.week, next.weeks[prev.week])
      break
    case 'finishImport':
    case 'addImportedWeek': {
      const pos = next.weeks.length - 1
      if (pos >= 0) saveWeek(congId, pos, next.weeks[pos])
      break
    }
    case 'mergeWeekAlt':
      saveWeek(congId, action.wi, next.weeks[action.wi])
      break
    case 'addPerson':
      savePerson(congId, action.person)
      break
    case 'updatePerson': {
      // Auto-Speichern mit Debounce: Tipp-Änderungen werden gebündelt
      const p = next.persons.find((x) => x.id === action.id)
      if (p) schedulePersonSave(congId, p)
      // Namensänderung hat Wochen umgeschrieben (renameInWeeks) → betroffene
      // Wochen ebenfalls (gebündelt) speichern; unveränderte behalten ihre Ref.
      const dirty: number[] = []
      for (let i = 0; i < next.weeks.length; i++) {
        if (next.weeks[i] !== prev.weeks[i]) dirty.push(i)
      }
      if (dirty.length > 0) scheduleWeekSaves(congId, dirty, next.weeks)
      // Planer-Recht sofort in gespiegelte Konten und offene Codes schreiben
      if ('planner' in action.patch) {
        for (const m of next.members) {
          if (m.personId === action.id && m.userId !== next.userId) saveMemberRow(m)
        }
        for (const i of next.invites) {
          if (i.personId === action.id) saveInvitePlanner(i.id, i.planner)
        }
      }
      break
    }
    case 'selectPerson':
    case 'navigate':
    case 'logout': {
      // Namenlose (abgebrochene) Person wurde im Reducer entfernt → auch in
      // der DB löschen, ohne dass ein ausstehender Save sie wiederbelebt.
      const sel = prev.selectedPersonId
      if (sel && prev.persons.some((p) => p.id === sel) && !next.persons.some((p) => p.id === sel)) {
        cancelPersonSave(sel)
        deletePersonRow(sel)
      }
      // Ansicht verlassen → ausstehende Debounce-Saves sofort schreiben
      flushPersonSaves(congId, next)
      flushWeekSaves(congId)
      flushCongregationSave(congId, prev)
      break
    }
    case 'removePerson': {
      cancelPersonSave(action.id)
      deletePersonRow(action.id) // groups/invites-FKs räumt die DB (set null)
      for (const m of prev.members) {
        if (m.personId === action.id) saveMemberRow({ ...m, personId: null })
      }
      break
    }
    case 'addAbsence':
      saveAbsence(congId, userId, next.personId, action.absence)
      break
    case 'removeAbsence':
      deleteAbsenceRow(action.id)
      break
    case 'addService': {
      const pos = next.services.length - 1
      if (pos >= 0) saveService(congId, action.service, pos)
      break
    }
    case 'changeServiceCount': {
      const idx = next.services.findIndex((s) => s.key === action.key)
      if (idx >= 0) saveService(congId, next.services[idx], idx)
      break
    }
    case 'removeService':
      deleteServiceRow(congId, action.key)
      break
    case 'addGroup':
      saveGroupRow(congId, action.group)
      break
    case 'updateGroup': {
      const group = next.groups.find((g) => g.id === action.id)
      if (group) saveGroupRow(congId, group)
      break
    }
    case 'removeGroup':
      deleteGroupRow(action.id)
      // Mitglieder der Gruppe haben grp=null bekommen → mitschreiben
      for (const p of next.persons) {
        if (prev.persons.find((q) => q.id === p.id)?.grp === action.id) savePersonGroup(p)
      }
      break
    case 'markAllRead':
      markNotificationsRead(congId, userId)
      break
    case 'clearNotifs':
      deleteNotifications(congId, userId)
      break
    case 'confirmTask':
      saveConfirmation(congId, userId, action.id, 'bestätigt')
      break
    case 'declineTask':
      saveConfirmation(congId, userId, action.id, 'verhindert')
      break
    case 'changeReminder':
    case 'toggleReminderRepeat':
    case 'setCongLang':
    case 'addProgLang':
    case 'removeProgLang':
      saveSettings(congId, {
        reminders: next.reminders,
        congLang: next.congLang,
        progLangs: next.progLangs,
      })
      break
    case 'updateCongregation':
      scheduleCongregationSave(congId, next.congregation)
      break
    case 'updateMember': {
      const member = next.members.find((m) => m.userId === action.userId)
      if (member) saveMemberRow(member)
      break
    }
    case 'removeMember':
      deleteMemberRow(action.userId)
      break
    case 'addInvite':
      saveInvite(congId, action.invite)
      break
    case 'removeInvite':
      deleteInviteRow(action.id)
      break
  }

  // Jede Aktion, die eine Mitteilung vorne anfügt (Zuteilung, Import,
  // Verhinderung), an die Planer der Versammlung schicken — je Empfänger eine
  // eigene Zeile mit eigenem Gelesen-/Lösch-Status. Erinnerungen erzeugt die
  // Edge Function selbst (adressiert an die betroffene Person).
  if (next.notifs.length > prev.notifs.length && next.notifs[0]) {
    const n = next.notifs[0]
    const planners = next.members.filter((m) => m.planner).map((m) => m.userId)
    insertNotifications(congId, planners, n.type, n.title, n.text)
  }
}
