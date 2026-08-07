import { describe, expect, it } from 'vitest'
import { isViewAction } from './readonly'
import type { AppAction } from './context'

describe('isViewAction', () => {
  const views: AppAction['type'][] = [
    'login',
    'logout',
    'hydrate',
    'setDataStatus',
    'navigate',
    'prevWeek',
    'nextWeek',
    'setTab',
    'openSlot',
    'closeSlot',
    'selectPerson',
    'openNotifs',
    'setTheme',
    'setFontScale',
    'setLang',
    'showToast',
    'hideToast',
    // Offline nachschlagen, was ansteht, ist der Sinn des Offline-Stands:
    // ohne diese drei ließ sich die eigene Aufgabe nicht öffnen, und der
    // Start begrüßte mit einem „nur lesend"-Hinweis statt mit dem Namen.
    'openMyTask',
    'closeMyTask',
    'welcomeShown',
  ]
  it.each(views)('erlaubt %s (nur Ansicht)', (type) => {
    expect(isViewAction(type)).toBe(true)
  })

  const writes: AppAction['type'][] = [
    'assign',
    'autoAssign',
    'clearAssignments',
    'addPerson',
    'updatePerson',
    'removePerson',
    'confirmTask',
    'declineTask',
    'addAbsence',
    'removeAbsence',
    'markAllRead',
    'clearNotifs',
    'updateCongregation',
    'fsInstUpdate',
    'fsRuleAdd',
    'addImportedWeek',
    'startImport',
    'changeReminder',
    'setCongLang',
    'addInvite',
    'updateMember',
  ]
  it.each(writes)('blockiert %s (Schreibzugriff)', (type) => {
    expect(isViewAction(type)).toBe(false)
  })

  it('behandelt Unbekanntes als Schreibzugriff (fail-safe für neue Aktionen)', () => {
    expect(isViewAction('irgendwasNeues' as AppAction['type'])).toBe(false)
  })
})
