import { schluesselTeile, type SchluesselTeile } from '../../supabase/functions/_shared/aufgaben-schluessel.ts'
import { wochenIndex } from '../data/planning'
import { themaVon } from '../data/rechte'
import type { MyTask, Notification, Week } from '../data/types'
import type { AppAction } from './context'

/**
 * **Welche Glocken-Zeilen dieser Nutzer sieht** — eine Stelle für Kopf-Chip,
 * Start-Kachel und Glocke, damit die Zahl „Neu" und die Liste nie
 * auseinanderlaufen.
 *
 * Eine Absage legt die Meldung „Verhinderung gemeldet" in den Zustand, als
 * `local`: Daran erkennt `persist`, dass sie über `notify_planners` an die
 * Admins zu verteilen ist — die Zeile ist der Auslöser, sie muss also bleiben.
 * Ein Admin bekommt sie danach aus der Datenbank selbst wieder. Ein Verkündiger
 * nicht; bei ihm stand sie bis zum 1.10.2026 trotzdem als „Neu" in der eigenen
 * Glocke, ein Text für die Admins, und war nach dem nächsten Laden wieder fort.
 * Seine Rückmeldung ist der Toast („die Admins werden informiert").
 *
 * Verkündiger erzeugen lokal nur diese eine Sorte — der Import, die andere
 * Quelle lokaler Zeilen, ist Admin-Sache. Deshalb genügt `local`.
 */
export function sichtbareMitteilungen(notifs: readonly Notification[], planner: boolean): readonly Notification[] {
  return planner ? notifs : notifs.filter((n) => !n.local)
}

/**
 * Mitteilungen, die ein Planer **als Planer** bekommt — über die Versammlung,
 * nicht über eine eigene Aufgabe. Ein Tipp darauf führt ins Planen.
 *
 * Kanonisch deutsch wie in der Datenbank. Dass jeder dieser Titel noch
 * erzeugt wird, prüft `mitteilungen.test.ts` an `NOTIF_TITLE_KEY`, und die
 * Zuordnung ihrerseits `mitteilungs-titel.test.ts` an den Erzeugern.
 */
export const AN_DIE_PLANER: ReadonlySet<string> = new Set([
  'Verhinderung gemeldet', // eine Absage (Reducer → `notify_planners`)
  'Programm importiert', // der Import einer Woche
  'Unbestätigte Zuteilungen (nicht erreichbar)', // send-reminders
  'Ersatz gefunden', // substitute — geht auch an die Ursprungsperson
])

/** Das Ersatzgesuch (substitute): Sein Ziel ist das Einspringen. */
export const ERSATZ_GESUCHT = 'Ersatz gesucht'

/** Was `mitteilungsZiel` vom Zustand braucht. */
export interface ZielLage {
  readonly planner: boolean
  readonly weeks: readonly Week[]
  readonly myTasks: readonly MyTask[]
}

/**
 * **Wohin ein Tipp auf eine Mitteilung führt: dorthin, wo sie herkommt.**
 *
 * Die Aktionen gehen der Reihe nach hinaus; `navigate` schließt dabei die
 * Glocke. Gefragt wird in dieser Reihenfolge:
 *
 * 1. „Ersatz gesucht" → zum Einspringen auf „Meine Aufgaben", wie der Push.
 * 2. Eine Meldung an die Planer → ins Planen, in die Woche ihrer Aufgabe,
 *    soweit sie eine nennt (die Absage seit dem 4.10.2026). Vor der eigenen
 *    Aufgabe gefragt: Sagt ein Planer selbst ab, sucht er als Planer Ersatz.
 * 3. Die eigene Aufgabe → „Meine Aufgaben" mit ihrem Blatt (bestätigen,
 *    absagen).
 * 4. Eine Aufgabe, die nicht (mehr) die eigene ist → ihre Woche im Programm,
 *    beim Planer im Planen: Eine Zuteilung, die inzwischen jemand anderes hat,
 *    zeigt dort, wer.
 * 5. Ohne Schlüssel → „Meine Aufgaben", wohin auch der Push dieser
 *    Mitteilungen führt (Zuteilung, Entzug, Erinnerung an mehrere Aufgaben).
 */
export function mitteilungsZiel(n: Notification, lage: ZielLage): AppAction[] {
  if (n.title === ERSATZ_GESUCHT) return [{ type: 'navigate', screen: 'aufgaben', abschnitt: 'einspringen' }]
  const teile = n.taskId ? schluesselTeile(n.taskId) : null
  if (lage.planner && AN_DIE_PLANER.has(n.title)) return wocheZeigen('planen', teile, lage.weeks)
  if (n.taskId && lage.myTasks.some((t) => t.id === n.taskId)) {
    return [{ type: 'navigate', screen: 'aufgaben' }, { type: 'openMyTask', id: n.taskId }]
  }
  if (teile) return wocheZeigen(lage.planner ? 'planen' : 'programm', teile, lage.weeks)
  return [{ type: 'navigate', screen: 'aufgaben' }]
}

/**
 * Die Woche eines Schlüssels ansehen. Ist sie nicht geladen oder fehlt der
 * Schlüssel, wenigstens ihr Thema — dort beginnt die Ansicht bei der nächsten
 * Zusammenkunft.
 */
function wocheZeigen(
  screen: 'planen' | 'programm',
  teile: SchluesselTeile | null,
  weeks: readonly Week[],
): AppAction[] {
  if (!teile) return [{ type: 'navigate', screen, thema: 'zusammenkuenfte' }]
  // Das öffentliche Zeugnisgeben zeigt seine Termine ohne Wochenleiste.
  if (teile.art === 'oz') {
    return [{ type: 'navigate', screen, thema: 'predigtdienst' }, { type: 'setFsBereich', bereich: 'zeugnis' }]
  }
  const tab = teile.art === 'fs' ? 'fs' : teile.tab
  const wi = wochenIndex(weeks, teile.woche)
  const hin: AppAction =
    wi < 0 ? { type: 'navigate', screen, thema: themaVon(tab) } : { type: 'navigate', screen, woche: { wi, tab } }
  return teile.art === 'fs' ? [hin, { type: 'setFsBereich', bereich: 'treffpunkte' }] : [hin]
}
