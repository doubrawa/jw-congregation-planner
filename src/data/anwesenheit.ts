/**
 * **Die Anwesenden einer Zusammenkunft** (T152, 29.10.2026).
 *
 * Der Saalordner zählt, wer im Saal sitzt, der Zoom-Ordner, wer zugeschaltet
 * ist. Beide Zahlen stehen je Zusammenkunft in der Tabelle `anwesenheit`;
 * zusammen sind sie „Anwesend". Die Auswertung rechnet daraus je Monat die
 * Zahl der Zusammenkünfte und den Durchschnitt, getrennt nach der Zusammenkunft
 * unter der Woche und der am Wochenende — so, wie die Versammlung sie Monat für
 * Monat weitergibt.
 *
 * **Wer einträgt:** wer in dieser Zusammenkunft als Saalordner oder Zoom-Ordner
 * eingeteilt ist (`ANWESENHEIT_DIENSTE`), dazu Admin und Planer. Dieselbe Regel
 * prüft die Datenbank (`darf_anwesenheit` in schema.sql; `anwesenheit.test.ts`
 * hält beide Listen gleich).
 *
 * **Ab wann:** ab dem Beginn der Zusammenkunft. Gezählt wird während sie
 * läuft — vorher gibt es nichts einzutragen.
 */

import { gehoertZuKennung, istAusgefallen, MEETING_TABS } from './helpers'
import { fromIso, isoDay, meetingDate, meetingTime, versatzAbMontag } from './meeting-dates'
import type { MeetingKey, MeetingTimes, Week } from './types'
import { monatsErster } from './weitere-plaene'

/** Die Hilfsdienste, deren Eingeteilte die Anwesenden zählen — im Saal und zugeschaltet. */
export const ANWESENHEIT_DIENSTE = ['saal', 'zoom'] as const

/** Die Anwesenden einer Zusammenkunft; `null` heißt: noch nicht eingetragen. */
export interface Anwesenheit {
  /** Montag der Woche (ISO) — wie `Week.start`. */
  woche: string
  tab: MeetingKey
  /** Im Saal gezählt. */
  saal: number | null
  /** Per Video zugeschaltet. */
  video: number | null
  /** Wer zuletzt eingetragen hat; `null`, wenn die Person gelöscht wurde. */
  pid: string | null
}

/**
 * Die beiden Zahlen einer Zusammenkunft. Jede trägt ein anderer ein — den Saal
 * der Saalordner, das Video der Zoom-Ordner —, deshalb geht beim Speichern nur
 * die hinaus, die sich geändert hat (`anwesenheitSpeichern` in persist.ts).
 */
export const ANWESENDE_FELDER = ['saal', 'video'] as const
export type AnwesendFeld = (typeof ANWESENDE_FELDER)[number]

/** Höchstens so viele Anwesende je Feld — die Datenbank prüft dieselbe Grenze. */
export const ANWESENDE_HOECHSTENS = 9999

/** Die Zeile einer Zusammenkunft — oder `undefined`, wenn noch nichts eingetragen ist. */
export function anwesenheitDer(liste: readonly Anwesenheit[], woche: string, tab: MeetingKey): Anwesenheit | undefined {
  return liste.find((a) => a.woche === woche && a.tab === tab)
}

/** Alle Anwesenden zusammen — `null`, solange keine der beiden Zahlen eingetragen ist. */
export function anwesendGesamt(a: Pick<Anwesenheit, 'saal' | 'video'> | undefined): number | null {
  if (!a || (a.saal === null && a.video === null)) return null
  return (a.saal ?? 0) + (a.video ?? 0)
}

/**
 * **Darf diese Person die Anwesenden eintragen?** Wer zuteilt (Admin, Planer)
 * immer; sonst, wer in dieser Zusammenkunft als Saalordner oder Zoom-Ordner
 * eingeteilt ist — über die Id, beim Altbestand über den Namen (`gehoertZu`).
 */
export function darfAnwesenheit(
  week: Week,
  tab: MeetingKey,
  ich: { id: string; name: string } | null,
  zuteilen: boolean,
): boolean {
  if (zuteilen) return true
  if (!ich) return false
  const helfer = week[tab].helpers
  return ANWESENHEIT_DIENSTE.some((dienst) => (helfer[dienst] ?? []).some((platz) => gehoertZuKennung(platz, ich.id, ich.name)))
}

/** Beginn einer Zusammenkunft als Zeitpunkt — Tag und Uhrzeit, Abweichungen der Woche eingerechnet. */
export function beginnVon(week: Week, tab: MeetingKey, zeiten: MeetingTimes): Date {
  const tag = meetingDate(week, tab, zeiten)
  const [stunde = 0, minute = 0] = meetingTime(week, tab, zeiten).split(':').map(Number)
  tag.setHours(stunde, minute, 0, 0)
  return tag
}

/** Hat die Zusammenkunft begonnen — und findet sie überhaupt statt? Erst dann gibt es etwas zu zählen. */
export function zaehltSchon(week: Week, tab: MeetingKey, zeiten: MeetingTimes, jetzt: Date): boolean {
  return !istAusgefallen(week, tab) && beginnVon(week, tab, zeiten).getTime() <= jetzt.getTime()
}

/**
 * **Was der Zähler heute einträgt** — die Zusammenkünfte dieses Tages, die
 * begonnen haben und in denen die Person als Saalordner oder Zoom-Ordner
 * steht. Für die Karte auf dem Start; am nächsten Tag ist sie fort, nachtragen
 * können dann Admin und Planer im Programm.
 */
export function heuteZuZaehlen(
  weeks: readonly Week[],
  zeiten: MeetingTimes,
  ich: { id: string; name: string } | null,
  jetzt: Date,
): Array<{ week: Week; tab: MeetingKey }> {
  if (!ich) return []
  const heute = isoDay(jetzt)
  const out: Array<{ week: Week; tab: MeetingKey }> = []
  for (const week of weeks) {
    for (const tab of MEETING_TABS) {
      if (isoDay(meetingDate(week, tab, zeiten)) !== heute) continue
      if (!zaehltSchon(week, tab, zeiten, jetzt) || !darfAnwesenheit(week, tab, ich, false)) continue
      out.push({ week, tab })
    }
  }
  return out
}

/** Die Zahlen einer Zusammenkunftsart in einem Monat. */
export interface AnwesenheitImMonat {
  /** Zusammenkünfte mit eingetragener Zahl. */
  anzahl: number
  /** Alle Anwesenden dieser Zusammenkünfte zusammen. */
  summe: number
  /** Durchschnitt je Zusammenkunft, ganz gerundet — `null` ohne eine einzige Zahl. */
  schnitt: number | null
  /**
   * Zusammenkünfte, die stattfanden, aber keine Zahl haben — seit der ersten
   * mit Zahl (`anwesenheitJeMonat`): ihr Tag und ihre Woche (beide ISO).
   */
  fehlt: Array<{ tag: string; woche: string }>
}

/** Ein Monat der Übersicht: `monat` als „JJJJ-MM-01", je Zusammenkunftsart die Zahlen. */
export interface AnwesenheitMonat {
  monat: string
  je: Record<MeetingKey, AnwesenheitImMonat>
}

/** Tag der Zusammenkunft einer Zeile — mit ihrer Woche, wo die geladen ist, sonst nach dem Rhythmus. */
function tagDer(a: Anwesenheit, wochen: ReadonlyMap<string, Week>, zeiten: MeetingTimes): string {
  const week = wochen.get(a.woche)
  if (week) return isoDay(meetingDate(week, a.tab, zeiten))
  const tag = fromIso(a.woche)
  tag.setDate(tag.getDate() + versatzAbMontag(zeiten[a.tab].wd))
  return isoDay(tag)
}

const leer = (): AnwesenheitImMonat => ({ anzahl: 0, summe: 0, schnitt: null, fehlt: [] })

/**
 * **Die Anwesenheit je Monat** — die Monate von `vonMonat` bis `bisMonat`
 * („JJJJ-MM-01"), der jüngste zuerst. Gezählt wird nach dem **Tag** der
 * Zusammenkunft, nicht nach dem Montag ihrer Woche: Eine Woche über den
 * Monatswechsel gibt ihren Sonntag dem neuen Monat.
 *
 * `fehlt` nennt die Zusammenkünfte, die stattfanden (Woche geladen, nicht
 * ausgefallen, Tag vorbei), aber keine Zahl haben — dort fehlt sie im
 * Durchschnitt, und der Planer kann sie nachtragen.
 *
 * **Fehlen kann eine Zahl erst ab der ersten Zusammenkunft mit Zahl**
 * (Betreiber, 31.10.2026) — gesucht über alles Geladene, nicht nur über den
 * Zeitraum: Vorher hat niemand gezählt. Nach einem Neuaufbau (ein Jahr Wochen,
 * keine Anwesenden) stünde sonst jede Zusammenkunft des Jahres unter „Ohne
 * Zahl". Ohne eine einzige Zahl fehlt nichts.
 */
export function anwesenheitJeMonat(
  liste: readonly Anwesenheit[],
  weeks: readonly Week[],
  zeiten: MeetingTimes,
  vonMonat: string,
  bisMonat: string,
  heute: Date,
): AnwesenheitMonat[] {
  const wochen = new Map(weeks.map((w) => [w.start, w]))
  const monate = new Map<string, AnwesenheitMonat>()
  const monat = (tag: string): AnwesenheitMonat | undefined => {
    const key = monatsErster(tag)
    if (key < vonMonat || key > bisMonat) return undefined
    let m = monate.get(key)
    if (!m) {
      m = { monat: key, je: { mid: leer(), we: leer() } }
      monate.set(key, m)
    }
    return m
  }

  const mitZahl = new Set<string>()
  /** Der Tag der ersten Zusammenkunft mit Zahl — ab ihm kann eine fehlen (siehe oben). */
  let ab: string | null = null
  for (const a of liste) {
    const gesamt = anwesendGesamt(a)
    if (gesamt === null) continue
    const tag = tagDer(a, wochen, zeiten)
    if (ab === null || tag < ab) ab = tag
    const m = monat(tag)
    if (!m) continue
    m.je[a.tab].anzahl++
    m.je[a.tab].summe += gesamt
    mitZahl.add(`${a.woche}|${a.tab}`)
  }

  const heuteIso = isoDay(heute)
  for (const week of weeks) {
    for (const tab of MEETING_TABS) {
      if (istAusgefallen(week, tab) || mitZahl.has(`${week.start}|${tab}`)) continue
      const tag = isoDay(meetingDate(week, tab, zeiten))
      if (tag >= heuteIso || ab === null || tag < ab) continue
      monat(tag)?.je[tab].fehlt.push({ tag, woche: week.start })
    }
  }

  for (const m of monate.values()) {
    for (const tab of MEETING_TABS) {
      const z = m.je[tab]
      z.schnitt = z.anzahl > 0 ? Math.round(z.summe / z.anzahl) : null
      z.fehlt.sort((a, b) => a.tag.localeCompare(b.tag))
    }
  }
  return [...monate.values()].sort((a, b) => b.monat.localeCompare(a.monat))
}

/**
 * Arabisch-indische (ab U+0660) und persische Ziffern (ab U+06F0) als 0–9 — so
 * tippen die Ziffernblöcke der Tastaturen in ar und fa, und `\d` kennt nur
 * 0–9 (Review 30.10.2026).
 */
function westlicheZiffern(text: string): string {
  return [...text]
    .map((z) => {
      const c = z.charCodeAt(0)
      return (c >= 0x660 && c <= 0x669) || (c >= 0x6f0 && c <= 0x6f9) ? String(c & 0xf) : z
    })
    .join('')
}

/** Eine Zahl aus einem Eingabefeld: leer heißt „nicht eingetragen", sonst nur Ziffern bis zur Grenze. */
export function anwesendeAusEingabe(text: string): number | null | 'ungueltig' {
  const roh = westlicheZiffern(text.trim())
  if (roh === '') return null
  if (!/^\d{1,4}$/.test(roh)) return 'ungueltig'
  const n = Number(roh)
  return n <= ANWESENDE_HOECHSTENS ? n : 'ungueltig'
}
