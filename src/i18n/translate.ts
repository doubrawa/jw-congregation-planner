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
 * Pflicht-Fanggruppe eines Treffers.
 *
 * Alle Gruppen der Regeln hier sind Pflichtgruppen — einen Treffer ohne sie
 * kann es nicht geben, sie stehen weder in einer Alternative noch hinter `?`.
 * TypeScript sieht das nicht und hält jede für `string | undefined`. Vierzigmal
 * `?? ''` danebenzuschreiben würde die Stellen, an denen wirklich etwas fehlen
 * kann — die Tabellen-Nachschläge unten —, unter Rauschen begraben. Deshalb
 * steht die Annahme einmal hier, mit Namen.
 */
const g = (m: RegExpMatchArray, i: number): string => m[i] ?? ''

/**
 * Der Notausgang aller Datumsregeln: `null` heißt „diese Regel entfällt", und
 * der Aufrufer lässt den deutschen Text stehen.
 *
 * Warum es ihn gibt: die Regeln schlagen Wochentage und Monate in Tabellen
 * nach, und keine dieser Tabellen darf still ins Leere greifen. Ein `undefined`
 * blieb im Hand-Pfad als „Tue, undefined 8" stehen und wurde im Intl-Pfad zum
 * `Invalid Date`, an dem `Intl.format()` einen `RangeError` wirft — ohne Error
 * Boundary der Totalausfall der App. Das war T1. Ein sichtbar deutsch
 * gebliebenes Datum ist allemal besser.
 */
type Ausweichend = (m: RegExpMatchArray, ...werte: number[]) => string | null

/** Aus einer ausweichenden Funktion eine Regel machen. */
function ausweichen(re: RegExp, fn: (m: RegExpMatchArray) => string | null): Rule {
  return [re, (m) => fn(m) ?? g(m, 0)]
}

/**
 * Monatsname → Index, in **beiden** Tabellen nachgeschlagen.
 *
 * Die Regeln fangen den Monat als `[A-Za-zäöü]+`; welche Form ankommt, hängt
 * von der Quelle ab: der Programmkopf schreibt „8. September", die
 * Erinnerungstexte „8. Sep". Wer nur eine Tabelle befragt, bekommt für die
 * andere Form `undefined` — genau daran starb T1.
 */
const monatIndex = (name: string): number | undefined => MON[name] ?? MONA[name]

/*
 * ---- Wochenspannen: drei Formen, und die dritte fehlte -----------------------
 *
 * Der Programmkopf einer Woche ist eine Spanne. Innerhalb eines Monats zieht
 * jw.org sie zusammen („23.–29. März"); über den Monatswechsel schreibt es beide
 * Monate **aus** und setzt den Halbgeviertstrich **ohne** Leerzeichen:
 * „27. April–3. Mai" (nachgemessen an der Ausgabe März/April 2026).
 *
 * Genau diese Form kannte der Übersetzer nicht. Er kannte die abgekürzte mit
 * Leerzeichen — „28. Sep – 4. Okt" —, und die kommt nur in den Demo- und
 * Vorlagenwochen dieser App vor. Folge: **jede Woche über einen Monatswechsel
 * trug in allen 33 Sprachen ihre deutsche Kopfzeile**, also rund jede vierte.
 *
 * Die Formen stehen hier zusammen, weil beide Übersetzer-Pfade (Wörterbuch und
 * Intl) dieselben brauchen — laufen sie auseinander, übersetzt eine Sprache,
 * was die andere stehen lässt.
 */

/** „23.–29. März" — innerhalb eines Monats. */
const SPANNE_MONAT = /^(\d+)\.–(\d+)\. ([A-Za-zäöü]+)$/
/** „28. Sep – 4. Okt" — Monatswechsel, abgekürzt (Demo- und Vorlagenwochen). */
const SPANNE_KURZ = /^(\d+)\. ([A-Za-zäöü]{3}) – (\d+)\. ([A-Za-zäöü]{3})$/
/** „27. April–3. Mai" — Monatswechsel, ausgeschrieben. Die Form von jw.org. */
const SPANNE_LANG = /^(\d+)\. ([A-Za-zäöü]+) ?– ?(\d+)\. ([A-Za-zäöü]+)$/

/**
 * Regel „Wochentag, Tag. Monat" — Gruppe 1 Wochentag, 2 Tag, 3 Monat.
 * Beide Nachschläge passieren **vor** dem Formatieren; fehlt einer, entfällt
 * die Regel. Vorher war nur der Monat geprüft: ein Wochentag, den die Tabelle
 * nicht kennt (weil Ausdruck und Tabelle auseinanderlaufen — die Ursache von
 * T1), ging ungeprüft als `undefined` in `Intl`.
 */
function tagDatumRegel(re: RegExp, wdTabelle: Record<string, number>, fn: Ausweichend): Rule {
  return ausweichen(re, (m) => {
    const wd = wdTabelle[g(m, 1)]
    const mon = monatIndex(g(m, 3))
    return wd === undefined || mon === undefined ? null : fn(m, wd, mon)
  })
}

/** Regel „Wochentag Uhrzeit" — Gruppe 1 Wochentag, 2 Uhrzeit. */
function tagZeitRegel(re: RegExp, wdTabelle: Record<string, number>, fn: Ausweichend): Rule {
  return ausweichen(re, (m) => {
    const wd = wdTabelle[g(m, 1)]
    return wd === undefined ? null : fn(m, wd)
  })
}

/**
 * Regel mit einem oder zwei Monatsnamen (Wochenspanne). `monatsGruppen` nennt
 * die Fanggruppen; bei nur einer gilt sie für beide Enden — „4.–10. August".
 */
function monatsRegel(re: RegExp, monatsGruppen: number[], fn: Ausweichend): Rule {
  return ausweichen(re, (m) => {
    const monate: number[] = []
    for (const gruppe of monatsGruppen) {
      const idx = monatIndex(g(m, gruppe))
      if (idx === undefined) return null
      monate.push(idx)
    }
    const mon1 = monate[0]
    if (mon1 === undefined) return null
    return fn(m, mon1, monate[1] ?? mon1)
  })
}

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
  // Je Publikation eine eigene Regel: das Kürzel gehört zur Vorlage, weil
  // Ostasien und die RTL-Sprachen es mitübersetzen („th" → 教励, „wcg" → 勇).
  const eins = (re: RegExp, fn: ((n: string) => string) | undefined) => {
    if (fn) regeln.push([re, (m) => fn(g(m, 1))])
  }
  const zwei = (re: RegExp, fn: ((n: string, p: string) => string) | undefined) => {
    if (fn) regeln.push([re, (m) => fn(g(m, 1), g(m, 2))])
  }
  eins(/^th Lektion (\d+)$/, ref.thLek)
  zwei(/^lmd Lektion (\d+) Punkt (\d+)$/, ref.lmdLekP)
  zwei(/^lff Lektion (\d+) Punkt (\d+)$/, ref.lffLekP)
  eins(/^lmd Lektion (\d+)$/, ref.lmdLek) // ältere Arbeitshefte: ohne Punktnummer
  eins(/^lff Lektion (\d+)$/, ref.lffLek)
  eins(/^wcg Kap\. (\d+)$/, ref.wcgKap)
  eins(/^lmd Anhang A Punkt (\d+)$/, ref.lmdAnh)
  eins(/^Gruppe (\d+)$/, ref.gruppe)
  eins(/^Vers\. (.+)$/, ref.vers)
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
      (m) => {
        const buch = g(m, 1)
        return `${voll.get(buch) ?? kurz.get(buch) ?? buch} ${g(m, 2)}`
      },
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
    const treffer = M[f]
    if (treffer != null) return treffer
    for (const [re, fn] of rules) { const m = f.match(re); if (m) return fn(m) }
    if (f.includes(' — ')) return f.split(' — ').map(one).join(' — ')
    return f
  }
  return (s: string): string => {
    if (s == null || s === '') return s
    return M[s] ?? s.split(' · ').map(one).join(' · ')
  }
}

function makeTrIntl(code: Lang): (s: string) => string {
  const locale = LOCALES[code] ?? code
  const M: Record<string, string> = FRAG[code] ?? FRAG.en ?? {}
  const ex: Extra = EXTRA[code] ?? EXTRA_EN
  const rules: Rule[] = [
    [/^Lied (\d+)$/, m => ex.song(g(m, 1))],
    [/^(\d+) Min\.$/, m => ex.min(g(m, 1))],
    [/^Ende ca\. (.+)$/, m => ex.ende(g(m, 1))],
    [/^ca\. (.+)$/, m => ex.ca(g(m, 1))],
    tagDatumRegel(/^(Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag), (\d+)\. ([A-Za-zäöü]+)$/, WD, (m, wd, mon) => intlWeekdayDate(locale, wd, +g(m, 2), mon, 'long')),
    tagDatumRegel(/^(Mo|Di|Mi|Do|Fr|Sa|So), (\d+)\. ([A-Za-zäöü]+)$/, WDA, (m, wd, mon) => intlWeekdayDate(locale, wd, +g(m, 2), mon, 'short')),
    tagZeitRegel(/^(Mo|Di|Mi|Do|Fr|Sa|So) (\d+:\d+)$/, WDA, (m, wd) => `${intlWeekdayShort(locale, wd)} ${g(m, 2)}`),
    monatsRegel(SPANNE_MONAT, [3], (m, mon) => intlRange(locale, +g(m, 1), mon, +g(m, 2), mon)),
    // Kurz vor Lang: die abgekürzte Form passt auch auf die lange Regel.
    // `intlRange` schreibt ohnehin immer aus, hier unterscheiden sie sich also
    // nur im Muster.
    monatsRegel(SPANNE_KURZ, [2, 4], (m, mon1, mon2) => intlRange(locale, +g(m, 1), mon1, +g(m, 3), mon2)),
    monatsRegel(SPANNE_LANG, [2, 4], (m, mon1, mon2) => intlRange(locale, +g(m, 1), mon1, +g(m, 3), mon2)),
    [/^mit (.+)$/, m => ex.mit(g(m, 1))],
    [/^in (\d+) Tagen$/, m => ex.tage(g(m, 1))],
    [/^(\d+) Zuteilungen$/, m => ex.zut(g(m, 1))],
    /*
     * FEHLT HIER: „Studienartikel 28" — der Verweis in der Meta-Zeile des
     * Wachtturm-Studiums. Die Regel gibt es nur im Wörterbuch-Pfad
     * (`makeTr`, also en/es/fr); über Intl laufen die übrigen ~30 Sprachen,
     * und dort bleibt der Verweis deutsch stehen. Dieselbe Sorte Lücke, die
     * der Kommentar bei REF beschreibt („deshalb blieb ‚Gruppe 2‘ in 30
     * Sprachen deutsch").
     *
     * Nicht mit einem englischen Rückfall geschlossen, und das mit Absicht:
     * `translate-data.test.ts` leitet die Pflichtfelder aus `EXTRA_EN` ab und
     * verlangt sie von JEDER Sprache — ein optionales Feld unterläuft genau
     * die Vollständigkeit, die dort erzwungen wird. Die Wortlaute gehören an
     * jw.org gemessen (wie die REF-Tabelle), nicht geraten.
     */
    ...verweisRegeln(code),
    ...buchRegeln(code),
  ]
  return buildTranslator(M, rules)
}

export function makeTr(code: Lang): (s: string) => string {
  if (!code || code === 'de') return s => s
  const L: DateDict | undefined = D[code]
  if (!L) return makeTrIntl(code) // Zusatz-Sprachen: Intl-Datum + FRAG/EXTRA
  const M: Record<string, string> = FRAG[code] ?? {}
  // Wochentags- und Monatsnamen der Sprache: der Index kommt aus WD/MON und
  // liegt damit im Bereich — solange die Liste vollständig gepflegt ist. Ist
  // sie es nicht, entfällt die Regel, statt „undefined" ins Programm zu
  // schreiben. Derselbe Notausgang wie beim unbekannten Monat (T1).
  const rules: Rule[] = [
    [/^Lied (\d+)$/, m => L.song(g(m, 1))],
    [/^(\d+) Min\.$/, m => L.min(g(m, 1))],
    [/^Ende ca\. (.+)$/, m => L.ende(g(m, 1))],
    [/^ca\. (.+)$/, m => L.ca(g(m, 1))],
    tagDatumRegel(/^(Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag), (\d+)\. ([A-Za-zäöü]+)$/, WD, (m, wd, mon) => {
      const tag = L.wd[wd], monat = L.mon[mon]
      return tag && monat ? L.date(tag, g(m, 2), monat) : null
    }),
    tagDatumRegel(/^(Mo|Di|Mi|Do|Fr|Sa|So), (\d+)\. ([A-Za-zäöü]+)$/, WDA, (m, wd, mon) => {
      const tag = L.wda[wd], monat = L.mon[mon]
      return tag && monat ? L.date(tag, g(m, 2), monat) : null
    }),
    tagZeitRegel(/^(Mo|Di|Mi|Do|Fr|Sa|So) (\d+:\d+)$/, WDA, (m, wd) => {
      const tag = L.wda[wd]
      return tag ? `${tag} ${g(m, 2)}` : null
    }),
    monatsRegel(SPANNE_MONAT, [3], (m, mon) => {
      const monat = L.mon[mon]
      return monat ? L.range1(g(m, 1), g(m, 2), monat) : null
    }),
    // Kurz vor Lang, und jede mit ihrer eigenen Namensliste: geschrieben wird
    // zurück, was hereinkam — abgekürzt bleibt abgekürzt.
    monatsRegel(SPANNE_KURZ, [2, 4], (m, mon1, mon2) => {
      const a = L.mona[mon1], b = L.mona[mon2]
      return a && b ? L.range2(g(m, 1), a, g(m, 3), b) : null
    }),
    monatsRegel(SPANNE_LANG, [2, 4], (m, mon1, mon2) => {
      const a = L.mon[mon1], b = L.mon[mon2]
      return a && b ? L.range2(g(m, 1), a, g(m, 3), b) : null
    }),
    ...verweisRegeln(code),
    ...buchRegeln(code),
    [/^Studienartikel (\d+)$/, m => L.artikel(g(m, 1))],
    [/^mit (.+)$/, m => L.mit(g(m, 1))],
    [/^in (\d+) Tagen$/, m => L.tage(g(m, 1))],
    [/^(\d+) Zuteilungen$/, m => L.zut(g(m, 1))],
  ]
  return buildTranslator(M, rules)
}
