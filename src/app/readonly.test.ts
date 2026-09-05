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

  const ansichten: AppAction['type'][] = [
    // Die Freigabe-Liste ansehen — die Schalter darin sind `updatePerson`.
    'openServiceSheet',
    'closeServiceSheet',
    // Das Blatt beim Öffnen weglegen. Ohne diese Zeile saß der Nutzer fest:
    // Steht allein ein Ersatzgesuch da, ist der Hintergrund-Klick der einzige
    // Weg heraus — kein ✕, kein Escape.
    'closeConfirm',
    // Frisch geholte Glocken-Zeilen anzeigen (NotificationsPanel).
    'setNotifs',
  ]
  it.each(ansichten)('erlaubt %s (schreibt nichts)', (type) => {
    expect(isViewAction(type)).toBe(true)
  })

  it('behandelt Unbekanntes als Schreibzugriff (fail-safe für neue Aktionen)', () => {
    expect(isViewAction('irgendwasNeues' as AppAction['type'])).toBe(false)
  })
})

/**
 * **Die Positivliste gegen die Schreibschicht gehalten.**
 *
 * Die Prüfungen darüber nennen Aktionen einzeln — sie fangen, was jemand
 * hinschreibt, nicht das, was jemand vergisst. Genau daran hing der Befund:
 * Vier Aktionen schrieben nichts und standen trotzdem nicht in der Liste; eine
 * davon sperrte den Nutzer hinter dem Bestätigungs-Blatt ein.
 *
 * Die Regel dahinter lässt sich messen: **Wofür `persist.ts` keinen Fall hat,
 * das schreibt auch nichts** — und darf offline laufen. Die Ausnahmen sind
 * genannt und begründet; wer eine neue Aktion einführt, muss sich hier
 * entscheiden, statt es zu vergessen.
 *
 * Gelesen wird der Quelltext (wie in `edge-parity.test.ts`): Die Aktionsliste
 * ist ein Typ und existiert zur Laufzeit nicht.
 */
describe('Was nichts schreibt, darf offline laufen', () => {
  const roh = (glob: Record<string, unknown>): string => String(Object.values(glob)[0] ?? '')
  const CONTEXT = import.meta.glob('./context.ts', { query: '?raw', import: 'default', eager: true })
  const PERSIST = import.meta.glob('./persist.ts', { query: '?raw', import: 'default', eager: true })

  /** Jede Aktionsart aus der Union in `context.ts`. */
  const alleArten = (): string[] => {
    const arten = [...roh(CONTEXT).matchAll(/\{ type: '([a-zA-Z0-9]+)'/g)].map((m) => m[1]!)
    if (arten.length < 40) throw new Error(`Aktionsliste nicht gefunden (${arten.length}) — Muster nachziehen`)
    return [...new Set(arten)]
  }

  /** Hat `persist.ts` einen Fall für diese Aktion? */
  const schreibt = (art: string): boolean =>
    new RegExp(`case '${art}':`).test(roh(PERSIST))

  /**
   * Aktionen ohne Schreibfall, die trotzdem gesperrt bleiben sollen — mit Grund.
   *
   * `startImport` setzt nur ein Merkzeichen; der Import selbst braucht aber das
   * Netz und endet offline ohnehin im Fehler. Der Hinweis „nur lesen" ist dort
   * die richtige Antwort, nicht ein Ladebalken, der nie fertig wird.
   */
  const ABSICHTLICH_GESPERRT = new Set(['startImport'])

  it('jede Aktion ohne Schreibfall ist eine Ansichts-Aktion', () => {
    const vergessen = alleArten().filter(
      (art) => !schreibt(art) && !isViewAction(art as AppAction['type']) && !ABSICHTLICH_GESPERRT.has(art),
    )
    expect(vergessen, `ohne Schreibfall, aber gesperrt: ${vergessen.join(', ')}`).toEqual([])
  })

  it('und umgekehrt schreibt keine Ansichts-Aktion', () => {
    // Die Gegenrichtung: Stünde etwas in der Liste, das `persist` behandelt,
    // ginge offline eine Änderung sichtbar durch und beim nächsten Laden
    // verloren. `hydrate` und `logout` sind die Ausnahme — sie tauschen den
    // Bestand aus bzw. räumen auf, statt eine Änderung zu schreiben.
    const erlaubt = new Set(['hydrate', 'logout', 'navigate', 'selectPerson'])
    const heikel = alleArten().filter(
      (art) => isViewAction(art as AppAction['type']) && schreibt(art) && !erlaubt.has(art),
    )
    expect(heikel, `Ansichts-Aktion mit Schreibfall: ${heikel.join(', ')}`).toEqual([])
  })
})
