/**
 * Nebeneffekt-Schicht: schreibt die zu einer Aktion gehörende Änderung nach
 * Supabase (Fire-and-forget über lib/data). Läuft nur im konfigurierten,
 * hydrierten Zustand. Der Reducer bleibt rein; hier werden `prev`/`next`
 * (Zustand vor/nach der Aktion) ausgewertet.
 */

import { changedSlotKeys } from '../data/planning'
import {
  deleteAbsenceRow,
  deleteConfirmationRows,
  deleteGroupRow,
  deletePersonRow,
  deleteInviteRow,
  deleteMemberRow,
  deleteNotifications,
  deleteServiceRow,
  insertNotification,
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
import type { Person } from '../data/types'
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
    case 'lacAdjust':
    case 'lacRemove':
    case 'lacMove':
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
      markNotificationsRead(congId)
      break
    case 'clearNotifs':
      deleteNotifications(congId)
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

  // Jede Aktion, die eine Mitteilung vorne anfügt, in die DB spiegeln
  // (user_id null = an alle Mitglieder der Versammlung).
  if (next.notifs.length > prev.notifs.length && next.notifs[0]) {
    const n = next.notifs[0]
    insertNotification(congId, null, n.type, n.title, n.text)
  }
}
