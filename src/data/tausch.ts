/**
 * **Tauschen statt absagen** (T153, 29.10.2026) — was die App über einen
 * Tausch weiß.
 *
 * Wer einen Hilfsdienst hat und an dem Tag nicht kann, fragt jemanden, der
 * denselben Dienst an einem anderen Tag hat. Sagt der zu, ändern sich beide
 * Plätze auf einmal, beide gelten als zugesagt, und der Planer bekommt
 * Bescheid — ohne zuzustimmen (Betreiber, 29.10.2026: wie die freien Plätze,
 * T142, „aufgaben weist der planer zu").
 *
 * Wen man fragen kann, rechnet der Server (Edge Function `tauschen`,
 * `regeln.ts`): Nur er weiß, wer ein Konto hat und also antworten kann. Hier
 * steht, wann die App „Tauschen" überhaupt anbietet, welche Anfragen gelten,
 * und wie die Wochen nach dem Tausch aussehen — dieselbe Änderung, die die
 * Function geschrieben hat.
 */

import { schluesselTeile } from '../../supabase/functions/_shared/aufgaben-schluessel.ts'
import { angebotsBereich } from '../../supabase/functions/_shared/freie-plaetze.ts'
import { displayName } from './helpers'
import { istVorbei, meetingDateMs, meetingDateText } from './meeting-dates'
import { gesendeteWochen, platzAuswahl } from './offene-plaetze'
import { assignSlot } from './planning'
import type { MeetingTimes, MyTask, Person, SentLog, Service, Week } from './types'

/** Eine offene Anfrage — nur die beiden, um die es geht, bekommen sie (RLS). */
export interface TauschAnfrage {
  id: string
  /** Die Person, die fragt. */
  von: string
  /** Die Person, die gefragt ist. */
  an: string
  /** Der Platz, den der Fragende abgibt (`task_key`). */
  gibtAb: string
  /** Der Platz, den er dafür übernimmt — bis jetzt der des Gefragten. */
  nimmt: string
  /** Der frühere der beiden Tage („JJJJ-MM-TT"); danach verfällt sie. */
  bis: string
}

/** Was `tauschbar` vom Bestand der App braucht. */
interface TauschBasis {
  services: readonly Service[]
  sentLog: SentLog
  weeks: readonly Week[]
}

/**
 * **Bietet die App „Tauschen" an dieser Aufgabe an?** Ein Hilfsdienst, den
 * keine Gruppe übernimmt, auf dem die eigene Kennung steht, in einer Woche,
 * deren Plan hinausging, und noch nicht vorbei. Ob es jemanden gibt, mit dem
 * es geht, sagt erst der Server.
 */
export function tauschbar(task: MyTask, ich: string | null, { services, sentLog, weeks }: TauschBasis, heute = new Date()): boolean {
  const teile = schluesselTeile(task.id)
  if (teile?.art !== 'helper') return false
  const svc = services.find((s) => s.key === teile.svc)
  if (!svc || !angebotsBereich(svc)) return false
  // Id vor Name, wie der Server (`not-yours`): Einen Platz, der nur den Namen
  // trägt, tauscht er nicht — das Blatt meldete sonst „mit niemandem möglich",
  // obwohl es an etwas anderem liegt (Review 30.10.2026).
  if (!ich || inhaber(weeks, task.id) !== ich) return false
  return gesendeteWochen(sentLog).has(teile.woche) && !istVorbei(task.at, heute)
}

/** Ein Platz, wie die App ihn beschriftet: der Dienst und sein Termin (wie `MyTask.date`/`at`). */
export interface PlatzTermin {
  dienst: string
  date: string
  at: number | null
}

/** Dienst und Termin eines Hilfsdienst-Platzes — `null`, wenn seine Woche nicht geladen ist. */
export function platzTermin(
  weeks: readonly Week[],
  services: readonly Service[],
  zeiten: MeetingTimes,
  key: string,
): PlatzTermin | null {
  const teile = schluesselTeile(key)
  if (teile?.art !== 'helper') return null
  const week = weeks.find((w) => w.start === teile.woche)
  if (!week) return null
  return {
    dienst: services.find((s) => s.key === teile.svc)?.name ?? teile.svc,
    date: meetingDateText(week, teile.tab, zeiten),
    at: meetingDateMs(week, teile.tab, zeiten),
  }
}

/** Wer einen Hilfsdienst-Platz hat — seine Kennung, sonst `undefined` (auch ohne geladene Woche). */
function inhaber(weeks: readonly Week[], key: string): string | undefined {
  const teile = schluesselTeile(key)
  if (teile?.art !== 'helper') return undefined
  return weeks.find((w) => w.start === teile.woche)?.[teile.tab].helpers[teile.svc]?.[teile.pos]?.pid
}

/**
 * **Gilt die Anfrage noch?** Ihr früherer Tag ist nicht vorbei, und beide
 * Plätze haben noch die, um die es geht. Hat der Planer inzwischen umgeteilt,
 * ist sie erledigt — der Server räumt sie beim nächsten Schritt dazu ab; hier
 * steht sie schon nicht mehr als Karte da, die nur noch scheitern könnte.
 */
const gilt = (a: TauschAnfrage, heute: string, weeks: readonly Week[]): boolean =>
  a.bis >= heute && inhaber(weeks, a.gibtAb) === a.von && inhaber(weeks, a.nimmt) === a.an

/** Die offenen Anfragen an diese Person, die noch gelten — die früheste zuerst. */
export function anfragenAn(
  anfragen: readonly TauschAnfrage[],
  personId: string | null,
  heute: string,
  weeks: readonly Week[],
): TauschAnfrage[] {
  if (!personId) return []
  return anfragen.filter((a) => a.an === personId && gilt(a, heute, weeks)).sort((x, y) => x.bis.localeCompare(y.bis))
}

/** Die eigene offene Anfrage zu einem Platz — je Platz gibt es höchstens eine. */
export function anfrageZu(
  anfragen: readonly TauschAnfrage[],
  gibtAb: string,
  heute: string,
  weeks: readonly Week[],
): TauschAnfrage | undefined {
  return anfragen.find((a) => a.gibtAb === gibtAb && gilt(a, heute, weeks))
}

/**
 * **Die Wochen nach dem Tausch**: auf `gibtAb` steht der Gefragte, auf `nimmt`
 * der Fragende — wie die Function sie geschrieben hat (`tauschAnwenden`). Fehlt
 * eine Person oder ein Platz im geladenen Bestand, bleibt alles, wie es ist;
 * das nächste Laden bringt den Stand.
 */
export function tauschLokal(weeks: Week[], services: Service[], persons: readonly Person[], anfrage: TauschAnfrage): Week[] {
  const von = persons.find((p) => p.id === anfrage.von)
  const an = persons.find((p) => p.id === anfrage.an)
  const abgegeben = platzAuswahl(weeks, services, anfrage.gibtAb)
  const genommen = platzAuswahl(weeks, services, anfrage.nimmt)
  if (!von || !an || !abgegeben || !genommen) return weeks
  const eins = assignSlot(weeks, abgegeben, displayName(an), undefined, an.id)
  return assignSlot(eins, genommen, displayName(von), undefined, von.id)
}
