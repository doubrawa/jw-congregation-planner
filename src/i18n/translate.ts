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
import { D, EXTRA, EXTRA_EN, FRAG, MON, MONA, WD, WDA, type DateDict, type Extra } from './translate-data'

/** Datum mit passendem Jahr finden, damit Intl den richtigen Wochentag zeigt. */
function findDateForWeekday(monthIdx: number, day: number, weekdayIdx: number): Date {
  for (let y = 2024; y < 2041; y++) {
    const d = new Date(Date.UTC(y, monthIdx, day))
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
    [/^Jeremia (.+)$/, m => L.buch(m[1])],
    [/^Jer (.+)$/, m => L.ref(m[1])],
    [/^th Lektion (\d+)$/, m => 'th ' + L.lektion(m[1])],
    [/^(wcg|lff) Kap\. (\d+)$/, m => m[1] + ' ' + L.kap(m[2])],
    [/^lmd Lektion (\d+)$/, m => 'lmd ' + L.lektion(m[1])],
    [/^lmd Anhang A Punkt (\d+)$/, m => 'lmd ' + L.anhang(m[1])],
    [/^Studienartikel (\d+)$/, m => L.artikel(m[1])],
    [/^mit (.+)$/, m => L.mit(m[1])],
    [/^Vers\. (.+)$/, m => L.vers(m[1])],
    [/^Gruppe (\d+)$/, m => L.gruppe(m[1])],
    [/^in (\d+) Tagen$/, m => L.tage(m[1])],
    [/^(\d+) Zuteilungen$/, m => L.zut(m[1])]
  ];
  return buildTranslator(M, rules);
}
