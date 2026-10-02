import type { Notification } from '../data/types'

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
