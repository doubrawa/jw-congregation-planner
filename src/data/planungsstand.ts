/**
 * **Was hat der Planer in den kommenden Wochen noch zu tun?** — die Auskunft
 * hinter der Planungs-Karte des Start-Bildschirms (T95).
 *
 * Bis hierher stand dort eine einzige Zeile, ganz unten: „N offene Zuteilungen ·
 * M Konflikte" der **laufenden** Woche. Die ist in dem Moment, in dem man plant,
 * meist schon fertig. Gearbeitet wird an den nächsten, und zwei Zustände dort sah
 * der Start gar nicht:
 *
 *  - **Nicht besetzbar** (T96): Plätze, für die an dem Tag zu wenige Leute da
 *    sind. Stand bisher nur als Banner im Planen, je Reiter.
 *  - **Plan senden** (T99): eine fertig geplante Woche, von der die
 *    Eingeteilten nichts wissen. Stand bisher nur am Knopf selbst.
 *
 * **Keine Zahl ist hier neu gerechnet.** Jede kommt aus der Funktion, die auch
 * das gleichnamige Banner in Planen speist (`weekConflicts`/`fsWeekConflicts`,
 * `engpaesse`, `countOpenSlots`, `offeneMeldungen`). Eine zweite Zählweise
 * liefe früher oder später auseinander, und dann stünde auf dem Start eine
 * Zahl, die man in Planen nicht wiederfindet.
 *
 * **Zwei Dinge unterscheiden sich doch, mit Absicht:**
 *
 *  1. Gezählt wird je **Woche**, nicht je Reiter — die Karte hat eine Zeile je
 *     Woche. In Planen verteilt sich dieselbe Summe auf die Reiter.
 *  2. **Was vorbei ist, zählt nicht** (T77). Am Donnerstag ist der offene Platz
 *     vom Dienstag keine Aufgabe mehr, sondern eine Zahl, die niemand abarbeiten
 *     kann. Die Banner in Planen zeigen ihn weiter, weil man dort eine Woche als
 *     Ganzes ansieht. **„Plan senden" dagegen lässt Vergangenes selbst weg** —
 *     Knopf, Function und Karte zählen dieselbe Menge (`offeneMeldungen`).
 */

import { engpaesse, offenTrotzAllem } from './bedarf'
import type { AbsenceSet } from './absence'
import { fsTagVorbei, fsWeekConflicts } from './fs'
import { istAusgefallen, MEETING_TABS } from './helpers'
import { istVorbei, kalendertagMs, meetingDateMs, weekEndMs } from './meeting-dates'
import { offeneMeldungen, type OffeneMeldung } from './plan-versand'
import { countOpenSlots, taskKeyWeek, weekConflicts } from './planning'
import type {
  Absence,
  ConfirmationMap,
  FsInstance,
  MeetingKey,
  MeetingTimes,
  MeetingTab,
  Person,
  SentLog,
  Service,
  Week,
} from './types'

/**
 * So viele Wochen schaut die Karte voraus — die laufende Kalenderwoche und drei
 * danach.
 *
 * Weiter nicht, weil eine frisch importierte Woche ohnehin ganz offen ist: Acht
 * geladene Wochen ergäben acht Zeilen „35 offen", und die eine, um die es heute
 * geht, ginge darin unter.
 */
export const WOCHEN_VORAUS = 4

/**
 * Reichen die Programme weniger als so viele Tage voraus, erinnert die Karte an
 * den Import.
 *
 * Der Import holt eine Woche je Knopfdruck und läuft nicht von selbst. Wie weit
 * die Programme reichen, stand bisher nur im Import-Panel — also dort, wo man
 * nur hingeht, wenn man ohnehin importieren will. Drei Wochen lassen Zeit, eine
 * Woche zu planen und zu senden, bevor sie beginnt.
 */
export const VORRAT_TAGE = 21

/** Stand einer Woche, in der etwas zu tun ist. */
export interface Wochenstand {
  /** Index in `weeks`. */
  wi: number
  /** Reiter, auf dem Planen öffnet — dort, wo das Erste zu tun ist (`zielReiter`). */
  tab: MeetingTab
  /** Mögliche Konflikte — Zusammenkünfte und Treffpunkte. */
  konflikte: number
  /**
   * Plätze, die offen bleiben **müssen** (T96), weil an dem Tag zu wenige Leute
   * da sind.
   *
   * **Kein Teil von `offen`.** Gerechnet wird gegen alle Plätze, besetzte
   * eingeschlossen: Melden sich zwei Eingeteilte nachträglich abwesend, ist
   * nichts offen, und trotzdem fehlen Leute. Dann steht der Wert neben den
   * Konflikten, ohne offene Zuteilung — wie das Banner in Planen auch.
   */
  nichtBesetzbar: number
  /** Offene Zuteilungen — Plätze der Zusammenkünfte und Treffpunkte ohne Leiter. */
  offen: number
  /** Zuteilungen, die noch niemandem mitgeteilt sind (T99) — ohne Vergangenes. */
  nichtGesendet: number
}

export interface Planungsstand {
  /** Nur Wochen, in denen etwas zu tun ist — in Kalenderfolge. */
  wochen: Wochenstand[]
  /** Reichen die Programme nicht mehr weit genug? Auch, wenn gar keine da sind. */
  vorratKnapp: boolean
  /**
   * Welche Tage die Karte angesehen hat: vom Montag der ersten bis zum Sonntag
   * der letzten Woche, als Kalendertage (`kalendertagMs`).
   *
   * Damit sagt die eingeklappte Karte, **wofür** „Alles zugeteilt" gilt. Ohne
   * diesen Zeitraum behauptete sie mehr, als gerechnet wurde: Vier fertige
   * Wochen und dahinter vier leere lasen sich wie „nichts mehr zu tun". `null`,
   * wenn keine Woche ansteht oder eine davon kein Datum trägt.
   */
  zeitraum: { vonMs: number; bisMs: number } | null
}

/** Woraus gerechnet wird — die Teile des Zustands, ohne ihn selbst zu kennen. */
export interface PlanungsQuellen {
  weeks: Week[]
  fsWeeks: FsInstance[][]
  persons: Person[]
  services: Service[]
  absences: readonly Absence[]
  /** Abwesenheiten je Zusammenkunft (`useAbwesend`). */
  abwesend: AbsenceSet
  confirmations: ConfirmationMap
  sentLog: SentLog
  /** Regeltermine der Versammlung (Wochentag + Uhrzeit je Zusammenkunft). */
  zeiten: MeetingTimes
  /** Ende der spätesten geladenen Woche (`loadedUntilMs`). */
  geladenBisMs: number | null
  /**
   * Kann gerade gesendet werden? Offline nicht — dann blendet Planen den Knopf
   * aus (`PlanSendenPanel`), und die Karte verweist nicht auf einen Knopf, den
   * es dort nicht gibt.
   */
  sendenMoeglich: boolean
}

export function planungsstand(q: PlanungsQuellen, heute = new Date()): Planungsstand {
  const angesehen = horizont(q.weeks, heute)
  const wochen: Wochenstand[] = []
  for (const wi of angesehen) {
    const stand = wochenstand(q, wi, heute)
    if (stand.konflikte + stand.nichtBesetzbar + stand.offen + stand.nichtGesendet > 0) {
      wochen.push(stand)
    }
  }
  return {
    wochen,
    vorratKnapp: vorratKnapp(q.weeks, q.geladenBisMs, heute),
    zeitraum: zeitraum(q.weeks, angesehen),
  }
}

/**
 * Welche Wochen die Karte ansieht — ab der Kalenderwoche, deren Sonntag noch
 * nicht vorbei ist.
 *
 * Nicht ab der nächsten **Zusammenkunft**: Die überspringt Wochen, in denen
 * alles entfällt (Kongress, T30) — deren Treffpunkte finden aber statt, und ein
 * fehlender Leiter am Mittwoch bliebe unsichtbar. Was in der laufenden Woche
 * schon vorbei ist, fällt ohnehin einzeln heraus (`wochenstand`).
 *
 * Begrenzt zweifach: auf `WOCHEN_VORAUS` Zeilen **und** auf ebenso viele
 * Kalenderwochen. Der Bestand hat Lücken (T66 — eine fehlende Woche verschiebt
 * nichts); ohne die zweite Grenze reichten „vier Wochen" über eine Lücke hinweg
 * bis in den übernächsten Monat.
 */
function horizont(weeks: readonly Week[], heute: Date): number[] {
  const heuteMs = kalendertagMs(heute)
  const ab = weeks.findIndex((w) => {
    const sonntag = weekEndMs(w.start)
    return sonntag !== null && sonntag >= heuteMs
  })
  // Liegt keine Woche vor uns, ist alles vorbei: nichts mehr zu planen. Es
  // bleibt der Hinweis auf den Import.
  if (ab === -1) return []

  const grenzeMs = heuteMs + WOCHEN_VORAUS * 7 * 864e5
  const out: number[] = []
  for (let wi = ab; wi < weeks.length && out.length < WOCHEN_VORAUS; wi++) {
    const start = weeks[wi]?.start
    if (start && Date.parse(start) >= grenzeMs) break
    out.push(wi)
  }
  return out
}

function wochenstand(q: PlanungsQuellen, wi: number, heute: Date): Wochenstand {
  const week = q.weeks[wi]
  if (!week) return { wi, tab: 'mid', konflikte: 0, nichtBesetzbar: 0, offen: 0, nichtGesendet: 0 }
  const kennung = week.start

  // Zusammenkünfte, die noch anstehen: nicht entfallen (T30), nicht vorbei (T77).
  const tabs = MEETING_TABS.filter(
    (tab) => !istAusgefallen(week, tab) && !istVorbei(meetingDateMs(week, tab, q.zeiten), heute),
  )
  // Einmal je Woche gerechnet und nach Zusammenkunft verteilt — jeder Aufruf
  // baut die Personen-Tabellen neu auf.
  const alleKonflikte = weekConflicts(q.weeks, wi, q.persons, q.services, undefined, q.abwesend)
  const jeTab = tabs.map((tab) => ({
    tab,
    konflikte: alleKonflikte.filter((c) => c.tab === tab).length,
    nichtBesetzbar: offenTrotzAllem(engpaesse(week[tab], q.services, q.persons, q.abwesend, wi, tab)),
    offen: countOpenSlots(week[tab], q.services),
  }))

  // Treffpunkte haben ihren eigenen Wochentag — vorbei ist jeder für sich.
  const fsAnstehend = (wd: number): boolean => !fsTagVorbei(kennung, wd, heute)
  const fsKonflikte = fsWeekConflicts(q.fsWeeks, wi, q.persons, q.absences, kennung).filter(
    (c) => c.wd === undefined || fsAnstehend(c.wd),
  ).length
  const fsOffen = (q.fsWeeks[wi] ?? []).filter((inst) => !inst.leader && fsAnstehend(inst.wd)).length

  // Vergangenes lässt die Vorschau selbst weg — dieselbe Menge wie am Knopf.
  const ungesendet = q.sendenMoeglich
    ? offeneMeldungen(week, q.fsWeeks[wi], q.services, q.confirmations, q.sentLog, q.zeiten, heute)
    : []

  const summe = (feld: 'konflikte' | 'nichtBesetzbar' | 'offen'): number =>
    jeTab.reduce((n, s) => n + s[feld], 0)

  return {
    wi,
    tab: zielReiter(jeTab, fsKonflikte + fsOffen > 0, ungesendet),
    konflikte: summe('konflikte') + fsKonflikte,
    nichtBesetzbar: summe('nichtBesetzbar'),
    offen: summe('offen') + fsOffen,
    nichtGesendet: ungesendet.length,
  }
}

/**
 * **Wo Planen für diese Zeile öffnet** — dort, wo das Erste zu tun ist.
 *
 * In der Reihenfolge der Chips: erst eine anstehende Zusammenkunft mit
 * Konflikten, Engpass oder offenen Plätzen, dann die Treffpunkte mit denselben
 * Sorgen, zuletzt der Versand. Beim Versand zählt, **wessen** Plätze noch nicht
 * gemeldet sind: Ist es nur ein Treffpunkt-Leiter, öffnet der Reiter der
 * Treffpunkte — dort steht er, und das Senden-Panel gleich darunter. Die
 * Wochenmitte zeigte ihn gar nicht und das Panel erst am Ende einer langen
 * Seite.
 */
function zielReiter(
  jeTab: ReadonlyArray<{ tab: MeetingKey; konflikte: number; nichtBesetzbar: number; offen: number }>,
  treffpunkteZuTun: boolean,
  ungesendet: readonly OffeneMeldung[],
): MeetingTab {
  const mitSorgen = jeTab.find((s) => s.konflikte + s.nichtBesetzbar + s.offen > 0)
  if (mitSorgen) return mitSorgen.tab
  if (treffpunkteZuTun) return 'fs'
  const zuSenden = jeTab.find((s) => ungesendet.some((m) => taskKeyWeek(m.key)?.tab === s.tab))
  if (zuSenden) return zuSenden.tab
  // Übrig sind nur Treffpunkte — oder Wochen ohne Datum, deren Schlüssel keine
  // Zusammenkunft erkennen lassen; dann die erste anstehende.
  return ungesendet.some((m) => !m.key.startsWith('fs|')) ? (jeTab[0]?.tab ?? 'mid') : 'fs'
}

/**
 * Programme reichen weniger als `VORRAT_TAGE` voraus — oder es sind gar keine
 * geladen.
 *
 * Ohne Kalenderdaten (`geladenBisMs` null bei vorhandenen Wochen: Demo,
 * Vorlagen) lässt sich nichts sagen, und es wird auch nichts behauptet.
 */
function vorratKnapp(weeks: readonly Week[], geladenBisMs: number | null, heute: Date): boolean {
  if (weeks.length === 0) return true
  if (geladenBisMs === null) return false
  return geladenBisMs - kalendertagMs(heute) < VORRAT_TAGE * 864e5
}

/** Montag der ersten bis Sonntag der letzten angesehenen Woche — oder null. */
function zeitraum(weeks: readonly Week[], angesehen: readonly number[]): Planungsstand['zeitraum'] {
  const erste = angesehen[0]
  const letzte = angesehen[angesehen.length - 1]
  if (erste === undefined || letzte === undefined) return null
  const von = weeks[erste]?.start
  const bisMs = weekEndMs(weeks[letzte]?.start)
  if (!von || bisMs === null || angesehen.some((wi) => !weeks[wi]?.start)) return null
  const vonMs = Date.parse(von)
  return Number.isNaN(vonMs) ? null : { vonMs, bisMs }
}
