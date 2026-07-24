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
import type { MeetingKey, MeetingTab, Person, Week } from '../data/types'
import type { AppAction, AppState } from './context'

/** View-Tab auf eine echte Zusammenkunft eingrenzen (fs hat keine Meeting-Daten). */
const mtab = (tab: MeetingTab): MeetingKey => (tab === 'fs' ? 'mid' : tab)

/**
 * Auto-Speichern mit Debounce: Tipp-Änderungen (Personen-Felder, Umbenennung
 * betroffener Wochen, Versammlungs-Stammdaten) dispatchen je Tastenanschlag.
 * Statt pro Anschlag zu schreiben, sammelt ein Writer die neueste Fassung je
 * Schlüssel und schreibt sie gebündelt nach kurzer Ruhe — bzw. sofort beim
 * Verlassen der Ansicht (`flush`) oder gar nicht (`cancel`, vor dem Löschen).
 */
const SAVE_DELAY = 600

interface DebouncedWriter<K, V> {
  schedule: (key: K, value: V) => void
  cancel: (key: K) => void
  flush: () => void
}

function createDebouncedWriter<K, V>(
  delayMs: number,
  write: (key: K, value: V) => void,
): DebouncedWriter<K, V> {
  const pending = new Map<K, V>()
  let timer: ReturnType<typeof setTimeout> | null = null
  const flush = (): void => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    for (const [key, value] of pending) write(key, value)
    pending.clear()
  }
  return {
    schedule(key, value) {
      pending.set(key, value)
      if (timer) clearTimeout(timer)
      timer = setTimeout(flush, delayMs)
    },
    cancel(key) {
      pending.delete(key)
    },
    flush,
  }
}

// congId ist über die Sitzung stabil, wird aber je Save mitgeführt, damit der
// Writer keine implizite Abhängigkeit auf App-State hat.
const personSaves = createDebouncedWriter<string, { congId: string; person: Person }>(
  SAVE_DELAY,
  (_id, { congId, person }) => savePerson(congId, person),
)
const weekSaves = createDebouncedWriter<number, { congId: string; week: Week }>(
  SAVE_DELAY,
  (position, { congId, week }) => saveWeek(congId, position, week),
)
const congSaves = createDebouncedWriter<'info', { congId: string; info: AppState['congregation'] }>(
  SAVE_DELAY,
  (_key, { congId, info }) => saveCongregationInfo(congId, info),
)

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
      const before = prev.weeks[prev.week]?.[mtab(prev.tab)]
      const after = next.weeks[prev.week]?.[mtab(prev.tab)]
      if (before && after) {
        // Bestätigungs-Einträge geänderter Slots abräumen (migration-007)
        deleteConfirmationRows(
          congId,
          changedSlotKeys(before, after, prev.services, prev.week, mtab(prev.tab)),
        )
        saveWeek(congId, prev.week, next.weeks[prev.week])
      }
      break
    }
    case 'clearAssignments': {
      const before = prev.weeks[prev.week]?.[mtab(prev.tab)]
      const after = next.weeks[prev.week]?.[mtab(prev.tab)]
      if (before && after && next.weeks !== prev.weeks) {
        deleteConfirmationRows(
          congId,
          changedSlotKeys(before, after, prev.services, prev.week, mtab(prev.tab)),
        )
        saveWeek(congId, prev.week, next.weeks[prev.week])
      }
      break
    }
    case 'lacMove': {
      if (next.weeks === prev.weeks) break // Rand: kein Tausch
      saveWeek(congId, prev.week, next.weeks[prev.week])
      // Bestätigungen der getauschten Positionen in der DB mittauschen
      const items = prev.weeks[prev.week][mtab(prev.tab)].sections[action.si].items
      const b = lacMoveTarget(items, action.ii, action.dir)
      if (b != null) {
        const count = Math.max(itemNameCount(items[action.ii]), itemNameCount(items[b]))
        void swapConfirmationKeys(
          congId,
          partSwapKeyPairs(prev.week, mtab(prev.tab), action.si, action.ii, b, count),
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
      if (p) personSaves.schedule(p.id, { congId, person: p })
      // Namensänderung hat Wochen umgeschrieben (renameInWeeks) → betroffene
      // Wochen ebenfalls (gebündelt) speichern; unveränderte behalten ihre Ref.
      for (let i = 0; i < next.weeks.length; i++) {
        if (next.weeks[i] !== prev.weeks[i]) weekSaves.schedule(i, { congId, week: next.weeks[i] })
      }
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
        personSaves.cancel(sel)
        deletePersonRow(sel)
      }
      // Ansicht verlassen → ausstehende Debounce-Saves sofort schreiben
      personSaves.flush()
      weekSaves.flush()
      congSaves.flush()
      break
    }
    case 'removePerson': {
      personSaves.cancel(action.id)
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
      congSaves.schedule('info', { congId, info: next.congregation })
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
