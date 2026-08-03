/**
 * Programm-Fragment-Übersetzer (v3): kanonisch deutsche Programm-Inhalte →
 * Zielsprache. `makeTr(code)` liefert eine Funktion, die S-38-Begriffe,
 * Lieder, Daten, Zeiten, Referenzen und „mit X“-Angaben übersetzt.
 * Unbekanntes bleibt unverändert (Rückfall auf Deutsch).
 *
 * Nahezu 1:1 aus docs/design-handoff/design/i18n.js portiert.
 */

/* eslint-disable */
import type { Lang } from '../data/types'
import { LOCALES } from './langs'
import { D, EXTRA, EXTRA_EN, FRAG, MON, MONA, REF, WD, WDA, type DateDict, type Extra, type RefDict } from './translate-data'

/* ---- Bibelbücher (nachgeladen) ------------------------------------------- */

type BuchTabelle = (lang: string) => { voll: Map<string, string>; kurz: Map<string, string> }

/**
 * Die Buchtabellen liegen in einem eigenen Modul und werden erst geholt, wenn
 * überhaupt übersetzt wird — sie wiegen rund 16 kB gepackt, und wer die App
 * auf Deutsch mit deutscher Versammlungssprache nutzt, braucht sie nie.
 * Bis dahin bleiben Buchnamen deutsch (wie vor der Einführung der Tabellen).
 */
let buchTabelle: BuchTabelle | null = null

/**
 * Tabellen nachladen. Liefert true, wenn dabei tatsächlich geladen wurde — der
 * Aufrufer stößt dann ein Re-Render an, genau wie bei den Sprach-Overlays.
 */
export async function bibelbuecherLaden(): Promise<boolean> {
  if (buchTabelle) return false
  const m = await import('./bible-books')
  buchTabelle = m.buchTabelle
  return true
}

/**
 * Datum mit passendem Jahr finden, damit Intl den richtigen Wochentag zeigt.
 * Gesucht wird nur das Jahr — Tag und Monat stehen fest.
 *
 * 28 Jahre, nicht weniger: Für gewöhnliche Daten genügen sieben, für den
 * 29. Februar aber nicht. Den gibt es nur in Schaltjahren, und in 2024–2040
 * fielen die auf lediglich fünf verschiedene Wochentage — Montag und Samstag
 * fehlten. „Montag, 29. Februar" landete dadurch im Rückfall auf ein Datum,
 * das es gar nicht gibt (29.2.2025), was der Kalender still zum 1. März macht:
 * angezeigt wurde dann ein falscher Tag. Über einen vollen 28-Jahre-Zyklus
 * kommen alle sieben Wochentage vor.
 */
function findDateForWeekday(monthIdx: number, day: number, weekdayIdx: number): Date {
  for (let y = 2024; y < 2024 + 28; y++) {
    const d = new Date(Date.UTC(y, monthIdx, day))
    // Ein Tag, den es in diesem Jahr nicht gibt, rutscht in den Folgemonat:
    // der 29. Februar in jedem Nicht-Schaltjahr, „31. Februar" in jedem.
    // Überspringen, nicht abbrechen — sonst endet die Suche beim 29. Februar
    // schon nach dem ersten Jahr.
    if (d.getUTCMonth() !== monthIdx) continue
    if (((d.getUTCDay() + 6) % 7) === weekdayIdx) return d
  }
  return new Date(Date.UTC(2025, monthIdx, day))
}
function intlWeekdayDate(locale: string, weekdayIdx: number, day: number, monthIdx: number, style: 'long' | 'short'): string {
  const d = findDateForWeekday(monthIdx, day, weekdayIdx)
  return new Intl.DateTimeFormat(locale, { weekday: style, day: 'numeric', month: 'long', timeZone: 'UTC' }).format(d)
}
function intlWeekdayShort(locale: string, weekdayIdx: number): string {
  const d = findDateForWeekday(0, 1, weekdayIdx)
  return new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(d)
}
function intlRange(locale: string, d1: number, mo1: number, d2: number, mo2: number): string {
  const a = new Date(Date.UTC(2025, mo1, d1))
  const b = new Date(Date.UTC(2025, mo2, d2))
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', timeZone: 'UTC' }).formatRange(a, b)
}

type Rule = [RegExp, (m: RegExpMatchArray) => string]

/**
 * Verweise auf Studienstoff, Gruppen und Versammlungen — für beide Pfade
 * (Datums-Wörterbuch und Intl) dieselben Regeln aus derselben Tabelle.
 *
 * Fehlt eine Vorlage, entfällt die Regel und der deutsche Verweis bleibt
 * stehen: In den Arbeitsheften von zh/ja/ko/ar/he/fa/ur stehen die
 * Publikationskürzel gar nicht, dort gibt es nichts zu übersetzen.
 */
function verweisRegeln(code: string): Rule[] {
  const ref: RefDict | undefined = REF[code]
  if (!ref) return []
  const regeln: Rule[] = []
  // „th Lektion 5" — das Kürzel selbst ist sprachunabhängig und bleibt vorn.
  if (ref.th) regeln.push([/^th Lektion (\d+)$/, (m) => 'th ' + ref.th!(m[1])])
  if (ref.lekP) {
    regeln.push([
      /^(lmd|lff) Lektion (\d+) Punkt (\d+)$/,
      (m) => `${m[1]} ` + ref.lekP!(m[2], m[3]),
    ])
  }
  // Ältere Arbeitshefte nennen die Lektion ohne Punktnummer.
  if (ref.lek) regeln.push([/^(lmd|lff) Lektion (\d+)$/, (m) => `${m[1]} ` + ref.lek!(m[2])])
  if (ref.kap) regeln.push([/^(wcg|lff|lmd|bt|cf|ia) Kap\. (\d+)$/, (m) => `${m[1]} ` + ref.kap!(m[2])])
  if (ref.gruppe) regeln.push([/^Gruppe (\d+)$/, (m) => ref.gruppe!(m[1])])
  if (ref.vers) regeln.push([/^Vers\. (.+)$/, (m) => ref.vers!(m[1])])
  return regeln
}

/**
 * Regeln für Bibelbücher und -stellen: „Jeremia 32–33" → „Jeremiah 32–33",
 * „Jer 32:6-18" → „Jer 32:6-18" in der Zielsprache. Kapitel und Verse bleiben
 * unangetastet, übersetzt wird nur der Buchname bzw. sein Kürzel.
 *
 * Der Ausdruck wird aus den tatsächlichen Buchnamen gebaut statt als
 * `^(.+) (\d.*)$`: ein solcher Fänger würde auch „Lied 5" oder „Studienartikel
 * 3" schlucken und — schlimmer — Segmente mit „ — " am rekursiven Aufteilen in
 * buildTranslator vorbeiführen. Längste zuerst, damit „1. Johannes" nicht an
 * einem kürzeren Namen hängen bleibt.
 */
function buchRegeln(code: string): Rule[] {
  if (!buchTabelle) return [] // noch nicht nachgeladen
  const { voll, kurz } = buchTabelle(code)
  if (voll.size === 0) return [] // Sprache nicht auf jw.org geführt → deutsch lassen
  const namen = [...voll.keys(), ...kurz.keys()].sort((a, b) => b.length - a.length)
  const muster = namen.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
  return [
    [
      new RegExp(`^(${muster}) (.+)$`),
      (m) => `${voll.get(m[1]) ?? kurz.get(m[1]) ?? m[1]} ${m[2]}`,
    ],
  ]
}

/**
 * Baut aus einem Wörterbuch (exakte Treffer) + Regex-Regeln eine Übersetzer-
 * Funktion. Ganze Strings mit exaktem Treffer werden direkt ersetzt; sonst wird
 * an „ · “ (und rekursiv an „ — “) in Segmente geteilt und je Segment ein
 * exakter Treffer bzw. die erste passende Regel angewandt, Unbekanntes bleibt.
 */
function buildTranslator(M: Record<string, string>, rules: Rule[]): (s: string) => string {
  const one = (f: string): string => {
    if (M[f] != null) return M[f]
    for (const [re, fn] of rules) { const m = f.match(re); if (m) return fn(m) }
    if (f.includes(' — ')) return f.split(' — ').map(one).join(' — ')
    return f
  }
  return (s: string): string => {
    if (s == null || s === '') return s
    if (M[s] != null) return M[s]
    return s.split(' · ').map(one).join(' · ')
  }
}

function makeTrIntl(code: Lang): (s: string) => string {
  const locale = LOCALES[code] ?? code
  const M: Record<string, string> = FRAG[code] ?? FRAG.en
  const ex: Extra = EXTRA[code] ?? EXTRA_EN
  const rules: Rule[] = [
    [/^Lied (\d+)$/, m => ex.song(m[1])],
    [/^(\d+) Min\.$/, m => ex.min(m[1])],
    [/^Ende ca\. (.+)$/, m => ex.ende(m[1])],
    [/^ca\. (.+)$/, m => ex.ca(m[1])],
    [/^(Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag), (\d+)\. ([A-Za-zäöü]+)$/, m => intlWeekdayDate(locale, WD[m[1]], +m[2], MON[m[3]], 'long')],
    [/^(Mo|Di|Mi|Do|Fr|Sa|So), (\d+)\. ([A-Za-zäöü]+)$/, m => intlWeekdayDate(locale, WDA[m[1]], +m[2], MON[m[3]], 'short')],
    [/^(Mo|Di|Mi|Do|Fr|Sa|So) (\d+:\d+)$/, m => intlWeekdayShort(locale, WDA[m[1]]) + ' ' + m[2]],
    [/^(\d+)\.–(\d+)\. ([A-Za-zäöü]+)$/, m => intlRange(locale, +m[1], MON[m[3]], +m[2], MON[m[3]])],
    [/^(\d+)\. ([A-Za-zäöü]{3}) – (\d+)\. ([A-Za-zäöü]{3})$/, m => intlRange(locale, +m[1], MONA[m[2]], +m[3], MONA[m[4]])],
    [/^mit (.+)$/, m => ex.mit(m[1])],
    [/^in (\d+) Tagen$/, m => ex.tage(m[1])],
    [/^(\d+) Zuteilungen$/, m => ex.zut(m[1])],
    ...verweisRegeln(code),
    ...buchRegeln(code),
  ]
  return buildTranslator(M, rules)
}

export function makeTr(code: Lang): (s: string) => string {
  if (!code || code === 'de') return s => s
  if (!D[code]) return makeTrIntl(code) // Zusatz-Sprachen: Intl-Datum + FRAG/EXTRA
  const M: Record<string, string> = FRAG[code] ?? {}, L: DateDict = D[code];
  const rules: Rule[] = [
    [/^Lied (\d+)$/, m => L.song(m[1])],
    [/^(\d+) Min\.$/, m => L.min(m[1])],
    [/^Ende ca\. (.+)$/, m => L.ende(m[1])],
    [/^ca\. (.+)$/, m => L.ca(m[1])],
    [/^(Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag), (\d+)\. ([A-Za-zäöü]+)$/, m => L.date(L.wd[WD[m[1]]], m[2], L.mon[MON[m[3]]])],
    [/^(Mo|Di|Mi|Do|Fr|Sa|So), (\d+)\. ([A-Za-zäöü]+)$/, m => L.date(L.wda[WDA[m[1]]], m[2], L.mon[MON[m[3]]])],
    [/^(Mo|Di|Mi|Do|Fr|Sa|So) (\d+:\d+)$/, m => L.wda[WDA[m[1]]] + ' ' + m[2]],
    [/^(\d+)\.\u2013(\d+)\. ([A-Za-zäöü]+)$/, m => L.range1(m[1], m[2], L.mon[MON[m[3]]])],
    [/^(\d+)\. ([A-Za-zäöü]{3}) \u2013 (\d+)\. ([A-Za-zäöü]{3})$/, m => L.range2(m[1], L.mona[MONA[m[2]]], m[3], L.mona[MONA[m[4]]])],
    ...verweisRegeln(code),
    ...buchRegeln(code),
    [/^lmd Anhang A Punkt (\d+)$/, m => 'lmd ' + L.anhang(m[1])],
    [/^Studienartikel (\d+)$/, m => L.artikel(m[1])],
    [/^mit (.+)$/, m => L.mit(m[1])],
    [/^in (\d+) Tagen$/, m => L.tage(m[1])],
    [/^(\d+) Zuteilungen$/, m => L.zut(m[1])]
  ];
  return buildTranslator(M, rules);
}
