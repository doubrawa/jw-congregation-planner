/*
 * Echtes Kalenderdatum einer Zusammenkunft aus dem ISO-Wochenstart plus dem
 * Wochentag-Versatz der jeweiligen Zusammenkunft. Bewusst dieselbe Logik wie
 * supabase/functions/send-reminders/index.ts (dort für die Erinnerungen), hier
 * für den Countdown-Chip der persönlichen Aufgaben.
 *
 * `week.start` ist der Montag der Woche (nur bei jw.org-importierten Wochen
 * gesetzt); Demo-/Vorlagen-Wochen haben keins → kein Countdown.
 */
import { abweichung, istAusgefallen, MEETING_TABS } from './helpers'
import type { MeetingKey, MeetingTimes, Week } from './types'

/**
 * Wochentag (0 = Sonntag … 6 = Samstag) → Tage nach Montag.
 *
 * Die eine Umrechnung zwischen den beiden Zählungen, die es hier gibt: Ein
 * Wochentag steht überall als Zahl (`FsRule.wd`, `Abweichung.wd`,
 * `MeetingTime.wd`), gerechnet wird ab dem Montag der Woche (`Week.start`).
 *
 * Hier standen stattdessen vier Tabellen und drei reguläre Ausdrücke: Kürzel →
 * Versatz, deutscher Name → Versatz (samt „Sonnabend"), die erste Uhrzeit in
 * einem Text, der erste Wochentag in einem Text. Sie lasen Tag und Uhrzeit aus
 * **Anzeigetexten** zurück — aus der Regelzeit der Versammlung („Di 19:00 · So
 * 10:00") und aus dem `date`-Feld der Zusammenkunft. Beide Quellen tragen
 * inzwischen Werte: die Versammlung vier Spalten, die Woche ihre `Abweichung`.
 */
export function versatzAbMontag(wd: number): number {
  return (wd + 6) % 7
}

/** Die Gegenrichtung: Tage nach Montag → Wochentag (0 = Sonntag … 6 = Samstag). */
export function wdAusVersatz(versatz: number): number {
  return (versatz + 1) % 7
}

/** Datum als lokales ISO („2026-09-08") — nicht über toISOString, das ist UTC. */
export function isoDay(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, '0')
  const t = `${d.getDate()}`.padStart(2, '0')
  return `${d.getFullYear()}-${m}-${t}`
}

/** ISO-Datum → lokaler Mittag (kein Tagesversatz durch Zeitzonen). */
export function fromIso(iso: string): Date {
  // Ein ISO-Datum hat drei Teile; fehlt einer, entsteht ohnehin ein ungültiges
  // Datum — dann lieber ausdrücklich als still verrechnet.
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y ?? NaN, (m ?? 1) - 1, d ?? 1, 12, 0, 0, 0)
}

/**
 * Wochentag-Versatz dieser einen Zusammenkunft: ab Montag gezählt.
 *
 * Zwei Quellen, in dieser Rangfolge:
 *  1. eine **Abweichung** dieser Woche (`week.dev`, T30) — der Planer hat den
 *     Tag ausdrücklich verlegt, etwa weil sich mehrere Versammlungen einen
 *     Saal teilen und eine davon Dienstwoche hat;
 *  2. der Rhythmus der Versammlung (Einstellungen).
 *
 * Dazwischen stand eine dritte: der Wochentag, den das `date`-Feld der
 * Zusammenkunft **anzeigt**. Sie galt Alt-Datensätzen, die das Gedächtnismahl
 * und die Kongresswoche als Text trugen; seit T30 sagt eine `Abweichung`
 * dasselbe als Wert, und importierte Wochen zeigen dort ohnehin nur die
 * Wochenspanne.
 *
 * Diese Regel gehört an EINE Stelle: der Countdown rechnete sie früher nicht
 * mit, Zeitleiste und Abwesenheitsprüfung schon, und dann nannten Erinnerung
 * und Anzeige verschiedene Tage.
 */
export function meetingOffset(week: Week, tab: MeetingKey, zeiten: MeetingTimes): number {
  // `?? `, nicht `||`: der Sonntag ist die 0.
  return versatzAbMontag(abweichung(week, tab)?.wd ?? zeiten[tab].wd)
}

/**
 * Uhrzeit dieser einen Zusammenkunft — Abweichung vor Rhythmus, gleiche
 * Rangfolge wie beim Tag.
 */
export function meetingTime(week: Week, tab: MeetingKey, zeiten: MeetingTimes): string {
  return abweichung(week, tab)?.time ?? zeiten[tab].time
}

/**
 * Kalendertag einer Zusammenkunft. Zwei Quellen, in dieser Reihenfolge:
 *  1. das ISO-Startdatum der Woche (jw.org-Import) plus Wochentag-Versatz,
 *  2. der Montag der Woche 0 (`base`) plus `wi` Wochen plus Wochentag-Versatz —
 *     für Demo- und Vorlagenwochen, die kein Startdatum tragen.
 *
 * Einzige Stelle, an der aus „Woche + Zusammenkunft" ein Datum wird —
 * Zeitleiste, Abwesenheiten, Countdown und Anzeige leiten alle hierher ab.
 */
export function meetingDate(
  week: Week,
  wi: number,
  tab: MeetingKey,
  base: Date,
  zeiten: MeetingTimes,
): Date {
  const montag = week.start ? fromIso(week.start) : new Date(base)
  const tag = new Date(montag)
  tag.setDate(tag.getDate() + (week.start ? 0 : wi * 7) + meetingOffset(week, tab, zeiten))
  return tag
}

/**
 * UTC-Zeitstempel (ms) des Zusammenkunftstags oder null, wenn die Woche kein
 * ISO-Startdatum hat. Auf Mitternacht UTC normalisiert — der Countdown zählt
 * ganze Kalendertage, keine Uhrzeiten.
 *
 * Ohne Startdatum bewusst null statt einer Schätzung aus `base`: Demo- und
 * Vorlagenwochen liegen nirgends im Kalender, ein Countdown darauf wäre erfunden.
 */
export function meetingDateMs(week: Week, tab: MeetingKey, zeiten: MeetingTimes): number | null {
  if (!week.start) return null
  const start = Date.parse(week.start)
  if (Number.isNaN(start)) return null
  return start + meetingOffset(week, tab, zeiten) * 864e5
}

/**
 * Kanonisch deutsche Namen — das Format, in dem Programmdaten gespeichert
 * werden; übersetzt wird erst bei der Anzeige (i18n/translate.ts).
 */
const WOCHENTAGE = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag']
const MONATE = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
]

/** „Dienstag, 8. September" — die Schreibweise der Wochendaten. */
export function deutschesDatum(d: Date): string {
  return `${WOCHENTAGE[versatzAbMontag(d.getDay())]}, ${d.getDate()}. ${MONATE[d.getMonth()]}`
}

/**
 * Termin einer Zusammenkunft als Text, kanonisch deutsch:
 * „Dienstag, 8. September · 19:00".
 *
 * Importierte Wochen tragen im `date`-Feld nur die **Wochenspanne**
 * („7.–13. September") — die Überschrift der jw.org-Seite nennt weder Jahr
 * noch Wochentag noch Uhrzeit. Genau das stand bis hierher in „Meine
 * Aufgaben", im S-89-Formular und im Erinnerungstext: eine Woche statt eines
 * Termins.
 *
 * Gerechnet wird aus Startdatum, Wochentag und Uhrzeit. Ohne Startdatum (Demo,
 * Vorlagen) bleibt stehen, was dasteht — dort gibt es keinen Kalendertag.
 */
export function meetingDateText(
  week: Week,
  wi: number,
  tab: MeetingKey,
  zeiten: MeetingTimes,
): string {
  const roh = week[tab].date
  const kurz = roh.split(' · ').slice(0, 2).join(' · ')
  const abw = abweichung(week, tab)
  if (!week.start) {
    // Ohne Startdatum (Demo, Vorlagen) lässt sich kein Kalendertag rechnen. Eine
    // verlegte Uhrzeit steht trotzdem fest und gehört dazu.
    if (abw?.time) return `${kurz.split(' · ')[0]} · ${abw.time}`
    return kurz
  }
  const zeit = meetingTime(week, tab, zeiten)
  const tagText = deutschesDatum(meetingDate(week, wi, tab, new Date(), zeiten))
  return zeit ? `${tagText} · ${zeit}` : tagText
}

/**
 * UTC-Zeitstempel des letzten Tages (Sonntag) einer Woche. Bewusst kein
 * Zusammenkunftstag: gefragt ist das Ende der Kalenderwoche.
 */
export function weekEndMs(weekStartISO: string | undefined): number | null {
  if (!weekStartISO) return null
  const start = Date.parse(weekStartISO)
  return Number.isNaN(start) ? null : start + 6 * 864e5
}

/**
 * **Der örtliche Kalendertag als Zahl** — UTC-Mitternacht des Tages, den `d`
 * hier gerade zeigt.
 *
 * Die eine Kodierung, in der die App Tage vergleicht: `meetingDateMs` legt einen
 * Termin darauf, `MyTask.at` trägt sie, `istVorbei` misst daran. Sie stand in
 * fünf Abschriften da (Countdown, Datumswähler, Treffpunkt-Aufgaben, „vorbei",
 * „nächste Zusammenkunft"), und zweimal lag eine davon schon daneben — in UTC
 * statt aus den örtlichen Bestandteilen, eine Stunde nach Mitternacht einen Tag
 * zu früh. Eine Stelle, damit „heute" überall am selben Moment umspringt.
 */
export function kalendertagMs(d: Date): number {
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())
}

/** Ganze Tage von `a` bis `b` (negativ, wenn `b` früher liegt). */
export function tageZwischen(a: Date, b: Date): number {
  return Math.round((kalendertagMs(b) - kalendertagMs(a)) / 864e5)
}

/**
 * Index der Woche, in die `heute` fällt — oder −1.
 *
 * `week.current` kommt aus den Demo-Daten und wird nie nachgeführt: nach dem
 * Login stand die Anwendung deshalb auf der ältesten geladenen Woche, das
 * Dashboard meldete dauerhaft „0 Konflikte" und der Chip „AKTUELLE WOCHE"
 * erschien nie. Maßgeblich ist das Startdatum; nur wo keine Woche eines hat
 * (Demo, Vorlagen), zählt weiterhin das Flag.
 */
export function currentWeekIndex(weeks: readonly Week[], heute = new Date()): number {
  const mitStart = weeks.findIndex((w) => w.start)
  if (mitStart === -1) return weeks.findIndex((w) => w.current)
  for (let i = 0; i < weeks.length; i++) {
    const iso = weeks[i]?.start
    if (!iso) continue
    const abstand = tageZwischen(fromIso(iso), heute)
    if (abstand >= 0 && abstand < 7) return i
  }
  return -1
}

/**
 * Ist dieser Termin vorbei? **Tagesgenau** — vorbei ist er ab dem Tag danach
 * (T77).
 *
 * Dieselbe Körnung wie bei `naechsteZusammenkunft` und aus demselben Grund: Die
 * Anfangszeit steht in den Einstellungen, aber wann eine Zusammenkunft *zu Ende*
 * ist, weiß niemand. Eine Aufgabe, die um 20:47 aus der Liste fällt, wäre
 * geraten — am Tag danach ist sie unstrittig vorbei.
 *
 * `at` fehlt bei Wochen ohne Startdatum (Demo, Vorlagen): Die liegen nirgends im
 * Kalender, also ist dort nichts vorbei.
 */
export function istVorbei(at: number | null | undefined, heute = new Date()): boolean {
  if (at == null) return false
  return at < kalendertagMs(heute)
}

/**
 * Die **nächste** Zusammenkunft: Woche und Reiter — oder `null`, wenn keine zu
 * finden ist (keine Woche trägt ein Startdatum, alle Termine liegen zurück,
 * oder alles fällt aus).
 *
 * „Nächste" heißt: der früheste Termin, der **heute oder später** liegt. Der
 * laufende Tag zählt mit — wer am Sonntagvormittag hereinschaut, will den
 * Sonntag sehen und nicht schon die kommende Woche. Genauer als auf den Tag
 * wird bewusst nicht gerechnet: Die Anfangszeit steht zwar in den
 * Einstellungen, wann eine Zusammenkunft *vorbei* ist, weiß aber niemand — ein
 * Umspringen um 20:47 wäre geraten.
 *
 * Was hier zusammenkommt und einzeln nicht reicht:
 *  - **Woche und Reiter gehören zusammen.** Am Sonntagabend ist die nächste
 *    Zusammenkunft die der Folgewoche; der Reiter allein spränge dann auf einen
 *    Termin, der schon vorbei ist.
 *  - **Entfallenes ist nichts, was ansteht** (T30): Kongresswochen und die
 *    Woche des Gedächtnismahls werden übersprungen.
 *  - **Der Wochentag steht nicht fest.** Er kommt je Versammlung aus den
 *    Einstellungen und kann in einer einzelnen Woche abweichen — `meetingDateMs`
 *    kennt beide Quellen; hier wird nichts geraten.
 *
 * Gesucht wird über **alle** Wochen und in jeder über beide Zusammenkünfte, nicht
 * die erste passende genommen: In der Woche des Gedächtnismahls liegt der
 * Sondertermin auch mal vor dem der Wochenmitte.
 */
export function naechsteZusammenkunft(
  weeks: readonly Week[],
  zeiten: MeetingTimes,
  heute = new Date(),
): { wi: number; tab: MeetingKey } | null {
  const heuteMs = kalendertagMs(heute)
  let beste: { wi: number; tab: MeetingKey; ms: number } | null = null
  for (let wi = 0; wi < weeks.length; wi++) {
    const week = weeks[wi]
    if (!week) continue
    for (const tab of MEETING_TABS) {
      if (istAusgefallen(week, tab)) continue
      const ms = meetingDateMs(week, tab, zeiten)
      if (ms === null || ms < heuteMs) continue
      if (!beste || ms < beste.ms) beste = { wi, tab, ms }
    }
  }
  return beste ? { wi: beste.wi, tab: beste.tab } : null
}
