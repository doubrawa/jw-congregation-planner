import { schluesselTeile, type SchluesselTeile } from '../../supabase/functions/_shared/aufgaben-schluessel.ts'
import { wochenIndex } from '../data/planning'
import { themaVon } from '../data/rechte'
import type { MyTask, Notification, SubstituteReq, Week } from '../data/types'
import type { AppAction } from './context'

/**
 * **Welche Mitteilungen dieser Nutzer sieht** — eine Stelle für den Punkt an
 * der Glocke, die Zahl im Menü und die Seite, damit die Zahl „Neu" und die
 * Liste nie auseinanderlaufen.
 *
 * Eine Absage legt die Meldung „Verhinderung gemeldet" in den Zustand, als
 * `local`: Daran erkennt `persist`, dass sie über `notify_planners` an alle zu
 * verteilen ist, die planen (Admin und Planer) — die Zeile ist der Auslöser,
 * sie muss also bleiben. Wer plant, bekommt sie danach aus der Datenbank
 * selbst wieder. Ein Verkündiger nicht; bei ihm stand sie bis zum 1.10.2026
 * trotzdem als „Neu" in der eigenen Glocke, ein Text für die Planenden, und war
 * nach dem nächsten Laden wieder fort. Seine Rückmeldung ist der Toast
 * („wer plant, erfährt es").
 *
 * Verkündiger erzeugen lokal nur diese eine Sorte — „Holen", die andere Quelle
 * lokaler Zeilen, ist Sache derer, die planen. Deshalb genügt `local`.
 */
export function sichtbareMitteilungen(notifs: readonly Notification[], zuteilen: boolean): readonly Notification[] {
  return zuteilen ? notifs : notifs.filter((n) => !n.local)
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

/**
 * Was man mit einer neuen Mitteilung gleich an Ort und Stelle tun kann — und
 * mit welcher Aufgabe (ihr Schlüssel).
 */
export type MitteilungsHandlung = { art: 'bestaetigen' | 'uebernehmen'; id: string } | null

/**
 * **Was eine Mitteilung gleich anbietet** (T121), ohne erst dorthin zu gehen,
 * wo sie herkommt: Eine Zuteilung, die noch auf Zusage wartet, lässt sich
 * bestätigen oder absagen; ein Ersatzgesuch, das noch offen ist, übernehmen.
 * Was inzwischen erledigt ist, bietet nichts mehr an.
 *
 * Eine Absage trägt seit dem 4.10.2026 den Schlüssel der Aufgabe — den eines
 * anderen. Hat der Planer den Platz inzwischen selbst übernommen, ist es
 * seine; an der Meldung über die Absage stünde sonst „Bestätigen".
 */
export function handlungZu(
  n: Notification,
  lage: { myTasks: readonly MyTask[]; substituteReqs: readonly SubstituteReq[] },
): MitteilungsHandlung {
  const id = n.taskId
  if (!id) return null
  if (n.title === ERSATZ_GESUCHT) return lage.substituteReqs.some((r) => r.key === id) ? { art: 'uebernehmen', id } : null
  const offen =
    n.type !== 'verhindert' &&
    lage.myTasks.some((t) => t.id === id && t.status === 'offen')
  return offen ? { art: 'bestaetigen', id } : null
}

/** Was `mitteilungsZiel` vom Zustand braucht. */
export interface ZielLage {
  /** Darf zuteilen — Admin oder Planer (4.10.2026): Beide bekommen die Meldungen an die Planer. */
  readonly zuteilen: boolean
  readonly weeks: readonly Week[]
  readonly myTasks: readonly MyTask[]
}

/**
 * **Wohin ein Tipp auf eine Mitteilung führt: dorthin, wo sie herkommt.**
 *
 * Die Aktionen gehen der Reihe nach hinaus; `navigate` verlässt dabei die
 * Mitteilungen. Gefragt wird in dieser Reihenfolge:
 *
 * 1. „Ersatz gesucht" → zum Einspringen auf „Freie Plätze" (T134), wie der
 *    Push (der nennt noch „Meine Aufgaben"; `deeplink.ts` führt ihn weiter).
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
  if (n.title === ERSATZ_GESUCHT) return [{ type: 'navigate', screen: 'freie', abschnitt: 'einspringen' }]
  const teile = n.taskId ? schluesselTeile(n.taskId) : null
  if (lage.zuteilen && AN_DIE_PLANER.has(n.title)) return wocheZeigen('planen', teile, lage.weeks)
  if (n.taskId && lage.myTasks.some((t) => t.id === n.taskId)) {
    return [{ type: 'navigate', screen: 'aufgaben' }, { type: 'openMyTask', id: n.taskId }]
  }
  if (teile) return wocheZeigen(lage.zuteilen ? 'planen' : 'programm', teile, lage.weeks)
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
  const tab = teile.art === 'fs' ? 'fs' : teile.tab
  const wi = wochenIndex(weeks, teile.woche)
  const hin: AppAction =
    wi < 0 ? { type: 'navigate', screen, thema: themaVon(tab) } : { type: 'navigate', screen, woche: { wi, tab } }
  return teile.art === 'fs' ? [hin, { type: 'setFsBereich', bereich: 'treffpunkte' }] : [hin]
}
