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
import type { MeetingKey, Week } from './types'

/** Wochentags-Kürzel → Tage nach Montag. */
const DAY_OFFSET: Record<string, number> = { Mo: 0, Di: 1, Mi: 2, Do: 3, Fr: 4, Sa: 5, So: 6 }

/**
 * "Di 19:00 · So 10:00" → { mid, we } (Tage nach Montag). Ohne erkennbare
 * Wochentage gilt Dienstag (mid) / Sonntag (we) — wie serverseitig.
 */
export function meetingDayOffsets(meetingTimes: string): Record<MeetingKey, number> {
  // Die Gruppe ist im Ausdruck nicht optional — ein Treffer hat sie immer.
  const found = [...meetingTimes.matchAll(/\b(Mo|Di|Mi|Do|Fr|Sa|So)\b/g)].map((m) => DAY_OFFSET[m[1] ?? ''])
  return { mid: found[0] ?? 1, we: found[1] ?? 6 }
}

/** Erste Uhrzeit in einem Text, auf "HH:MM" normiert. */
function ersteZeit(text: string): string | undefined {
  const m = /\b(\d{1,2})[:.](\d{2})\b/.exec(text)
  return m ? `${(m[1] ?? '').padStart(2, '0')}:${m[2] ?? ''}` : undefined
}

/**
 * "Di 19:00 · So 10:00" → { mid: "19:00", we: "10:00" }. Ohne erkennbare
 * Uhrzeit bleibt der jeweilige Wert leer — der Aufrufer lässt sie dann weg.
 * Die Zusammenkunfts-Zeiten stehen nur hier (in den Einstellungen); die
 * importierten Wochen tragen im `date`-Feld die Wochenspanne, keinen Termin.
 */
export function meetingTimesOf(meetingTimes: string): Record<MeetingKey, string> {
  const found = [...meetingTimes.matchAll(/\b(\d{1,2})[:.](\d{2})\b/g)].map(
    (m) => `${(m[1] ?? '').padStart(2, '0')}:${m[2] ?? ''}`,
  )
  return { mid: found[0] ?? '', we: found[1] ?? '' }
}

/** Ausgeschriebener Wochentag (Wochendaten sind kanonisch deutsch) → Tage nach Montag. */
const WEEKDAY_OFFSET: Record<string, number> = {
  Montag: 0, Dienstag: 1, Mittwoch: 2, Donnerstag: 3,
  Freitag: 4, Samstag: 5, Sonnabend: 5, Sonntag: 6,
}

/**
 * Termin aus dem `date`-Feld einer Zusammenkunft, soweit es einen trägt:
 * "Samstag, 3. Oktober · 19:30 · Königreichssaal" → { offset: 5, zeit: "19:30" }.
 *
 * Wichtig für Wochen, die vom Rhythmus abweichen (Gedächtnismahl, Kongress) —
 * dort steht der echte Termin nur hier. Importierte Wochen tragen dagegen die
 * Wochenspanne ("7.–13. September"): kein Wochentag, keine Zeit → beides
 * `undefined`, und der Aufrufer nimmt die Zeiten aus den Einstellungen.
 */
export function meetingDateParts(date: string): { offset?: number; zeit?: string } {
  const tag = /\b(Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonnabend|Sonntag)\b/.exec(date)
  return { offset: tag ? WEEKDAY_OFFSET[tag[1] ?? ''] : undefined, zeit: ersteZeit(date) }
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
 * Drei Quellen, in dieser Rangfolge:
 *  1. eine **Abweichung** dieser Woche (`week.dev`, T30) — der Planer hat den
 *     Tag ausdrücklich verlegt, etwa weil sich mehrere Versammlungen einen
 *     Saal teilen und eine davon Dienstwoche hat;
 *  2. ein eigener Termin im `date`-Feld (so tragen Alt-Datensätze das
 *     Gedächtnismahl und die Kongresswoche);
 *  3. der Rhythmus aus den Einstellungen.
 *
 * Diese Regel gehört an EINE Stelle: der Countdown rechnete sie früher nicht
 * mit, Zeitleiste und Abwesenheitsprüfung schon, und dann nannten Erinnerung
 * und Anzeige verschiedene Tage.
 */
export function meetingOffset(week: Week, tab: MeetingKey, meetings: string): number {
  const tag = abweichung(week, tab)?.day
  const verlegt = tag ? WEEKDAY_OFFSET[tag] : undefined
  return verlegt ?? meetingDateParts(week[tab].date).offset ?? meetingDayOffsets(meetings)[tab]
}

/**
 * Uhrzeit dieser einen Zusammenkunft — Abweichung vor eigenem Termin vor
 * Einstellungen, gleiche Rangfolge wie beim Tag. Leer, wenn nirgends eine steht.
 */
export function meetingTime(week: Week, tab: MeetingKey, meetings: string): string {
  return (
    abweichung(week, tab)?.time ??
    meetingDateParts(week[tab].date).zeit ??
    meetingTimesOf(meetings)[tab]
  )
}

/**
 * Kalendertag einer Zusammenkunft. Drei Quellen, in dieser Reihenfolge:
 *  1. ein eigener Termin im `date`-Feld der Woche (Gedächtnismahl, Kongress),
 *  2. das ISO-Startdatum der Woche (jw.org-Import) plus Wochentag-Versatz,
 *  3. der Montag der Woche 0 (`base`) plus `wi` Wochen plus Wochentag-Versatz —
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
  meetings: string,
): Date {
  const montag = week.start ? fromIso(week.start) : new Date(base)
  const tag = new Date(montag)
  tag.setDate(tag.getDate() + (week.start ? 0 : wi * 7) + meetingOffset(week, tab, meetings))
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
export function meetingDateMs(week: Week, tab: MeetingKey, meetings: string): number | null {
  if (!week.start) return null
  const start = Date.parse(week.start)
  if (Number.isNaN(start)) return null
  return start + meetingOffset(week, tab, meetings) * 864e5
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
  return `${WOCHENTAGE[(d.getDay() + 6) % 7]}, ${d.getDate()}. ${MONATE[d.getMonth()]}`
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
 * Rangfolge wie überall: ein eigener Termin im `date`-Feld gilt unverändert
 * (Gedächtnismahl); sonst wird aus Startdatum, Wochentag und Uhrzeit gerechnet.
 * Ohne Startdatum (Demo, Vorlagen) bleibt stehen, was dasteht.
 */
export function meetingDateText(
  week: Week,
  wi: number,
  tab: MeetingKey,
  meetings: string,
): string {
  const roh = week[tab].date
  const kurz = roh.split(' · ').slice(0, 2).join(' · ')
  // Eine Abweichung (T30) schlägt auch den eigenen Termin im `date`-Feld: der
  // Planer hat den Tag ausdrücklich verlegt, das `date`-Feld nennt noch den
  // alten. Ohne diese Zeile stünde in „Meine Aufgaben", im S-89-Formular und im
  // Erinnerungstext weiter der Termin, an dem niemand kommt.
  const abw = abweichung(week, tab)
  const verlegt = Boolean(abw?.day || abw?.time)
  if (!verlegt && meetingDateParts(roh).offset !== undefined) return kurz
  if (!week.start) {
    // Ohne Startdatum (Demo, Vorlagen) lässt sich kein Kalendertag rechnen. Eine
    // verlegte Uhrzeit steht trotzdem fest und gehört dazu.
    if (abw?.time) return `${kurz.split(' · ')[0]} · ${abw.time}`
    return kurz
  }
  const zeit = meetingTime(week, tab, meetings)
  const tagText = deutschesDatum(meetingDate(week, wi, tab, new Date(), meetings))
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

/** Ganze Tage von `a` bis `b` (negativ, wenn `b` früher liegt). */
export function tageZwischen(a: Date, b: Date): number {
  const tag = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())
  return Math.round((tag(b) - tag(a)) / 864e5)
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
  meetings: string,
  heute = new Date(),
): { wi: number; tab: MeetingKey } | null {
  const heuteMs = Date.UTC(heute.getFullYear(), heute.getMonth(), heute.getDate())
  let beste: { wi: number; tab: MeetingKey; ms: number } | null = null
  for (let wi = 0; wi < weeks.length; wi++) {
    const week = weeks[wi]
    if (!week) continue
    for (const tab of MEETING_TABS) {
      if (istAusgefallen(week, tab)) continue
      const ms = meetingDateMs(week, tab, meetings)
      if (ms === null || ms < heuteMs) continue
      if (!beste || ms < beste.ms) beste = { wi, tab, ms }
    }
  }
  return beste ? { wi: beste.wi, tab: beste.tab } : null
}
