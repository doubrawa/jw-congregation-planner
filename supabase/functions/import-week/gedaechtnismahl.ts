// =============================================================================
// Die Woche des Gedächtnismahls — die eine Woche, die das Arbeitsheft auslässt
// =============================================================================
// Im Arbeitsheft steht **nur die Zusammenkunft unter der Woche**. Fällt das
// Gedächtnismahl auf einen Werktag, entfällt genau diese — also gibt es für die
// Woche nichts zu drucken, und die Seite fehlt vollständig. `discoverWeeks()`
// sammelt nur `Zusammenkunft-…`-Seiten und sprang deshalb über sie hinweg: Die
// Woche existierte in der App gar nicht, obwohl ihre **Zusammenkunft am
// Wochenende ganz normal stattfindet** — öffentlicher Vortrag und
// Wachtturm-Studium wollen geplant werden.
//
// NACHGEMESSEN, und das Ergebnis hat den Zuschnitt geändert:
//
//   | Ausgabe          | Gedächtnismahl        | Wochenseiten | Lücke  |
//   | ---------------- | --------------------- | ------------ | ------ |
//   | März/April 2024  | Sonntag, 24. März     | 9            | keine  |
//   | März/April 2026  | Donnerstag, 2. April  | 8            | eine   |
//
// Die Lücke gibt es also **nicht in jedem Jahr**, sondern genau dann, wenn das
// Mahl von Montag bis Freitag fällt. Deshalb wird hier nichts geraten: Das
// Datum steht ausgeschrieben auf der Bibelleseprogramm-Seite, die es in beiden
// Jahren gibt, und erst daraus ergibt sich, ob eine Woche fehlt.
// =============================================================================

import { type ImportedWeek, weekendTemplate } from './parse.ts'
import { cleanText, MONTHS } from './study.ts'

/**
 * Deutsche Monatsnamen zum **Schreiben**. `MONTHS` löst sie auf, diese Liste
 * setzt sie — die andere Richtung, für den Wochenkopf der erzeugten Woche.
 *
 * Deutsch ist hier richtig und keine Nachlässigkeit: Die Wochenend-Vorlage
 * (`weekendTemplate`) ist ebenfalls durchweg deutsch, und die App übersetzt
 * beim Anzeigen (`makeTr` in src/i18n). Etwas anderes wäre auch nicht zu
 * messen — für diese Woche gibt es keine jw.org-Seite, aus der sich ein
 * lokalisierter Kopf holen ließe.
 */
const MONATSNAMEN = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
]

const WOCHENTAGE = 'MONTAG|DIENSTAG|MITTWOCH|DONNERSTAG|FREITAG|SAMSTAG|SONNTAG'

/**
 * Ist das die Bibelleseprogramm-Seite der Ausgabe?
 *
 * Im Pfad steckt ein **weiches Trennzeichen** (U+00AD) in
 * „Bibellese­programm" — je nach Herkunft wörtlich oder als `%C2%AD`. Deshalb
 * wird erst dekodiert und bereinigt und dann verglichen; ein Vergleich auf dem
 * rohen Pfad ginge leer aus, obwohl er richtig aussieht.
 */
export function istLeseprogramm(pfad: string): boolean {
  let klar = pfad
  try {
    klar = decodeURIComponent(pfad)
  } catch {
    // Kaputte Prozent-Folge: dann eben roh vergleichen.
  }
  return /Bibelleseprogramm/i.test(klar.replace(/­/g, ''))
}

/**
 * Datum des Gedächtnismahls von der Bibelleseprogramm-Seite — ISO, oder `null`.
 *
 * Gemessen an der Ausgabe März/April 2026: Die Seite listet die Tage um den
 * 14. Nisan als Überschriften („MITTWOCH, 1. APRIL", „DONNERSTAG, 2. APRIL"),
 * und genau einer davon trägt unmittelbar dahinter „GEDÄCHTNISMAHL". Ein
 * Treffer, nicht mehrere — der Seitentitel („Bibelleseprogramm für das
 * Gedächtnismahl 2026") trägt kein Datum vor sich und fällt deshalb heraus.
 */
export function gedaechtnismahlDatum(html: string, jahr: number): string | null {
  const text = cleanText(html)
  const m = new RegExp(`(?:${WOCHENTAGE}),\\s*(\\d{1,2})\\.\\s*([A-ZÄÖÜ]+)\\s+GEDÄCHTNISMAHL`).exec(text)
  if (!m) return null
  const tag = Number(m[1])
  const monat = MONTHS[(m[2] ?? '').toLowerCase()]
  if (!monat || !tag) return null
  return iso(Date.UTC(jahr, monat - 1, tag))
}

/**
 * Jahreszahl aus dem Seitenpfad („…-Gedächtnismahl-2026") — sonst `null`.
 *
 * Sie steht dort ausdrücklich und ist damit die verlässlichere Quelle als die
 * Ausgabe drumherum: „März/April" trägt das Jahr zwar auch, aber der Bezug
 * wäre eine Annahme statt einer Angabe.
 */
export function leseprogrammJahr(pfad: string): number | null {
  const m = /-(\d{4})\/?$/.exec(pfad)
  return m?.[1] ? Number(m[1]) : null
}

/** Montag der Woche, in die `datum` fällt — die Kennung dieser Woche (T66). */
export function montagDerWoche(datum: string): string {
  const d = new Date(`${datum}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return ''
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
  return iso(d.getTime())
}

/**
 * Wochenkopf in der Form, die jw.org selbst schreibt — nachgemessen an der
 * Ausgabe März/April 2026: innerhalb eines Monats „23.-29. März" (der Parser
 * macht daraus „23.–29. März"), über den Monatswechsel „27. April–3. Mai".
 */
export function wochenSpanne(montagISO: string): string {
  const mo = new Date(`${montagISO}T00:00:00Z`)
  if (Number.isNaN(mo.getTime())) return ''
  const so = new Date(mo.getTime() + 6 * 864e5)
  const m1 = MONATSNAMEN[mo.getUTCMonth()]
  const m2 = MONATSNAMEN[so.getUTCMonth()]
  if (!m1 || !m2) return ''
  return m1 === m2
    ? `${mo.getUTCDate()}.–${so.getUTCDate()}. ${m1}`
    : `${mo.getUTCDate()}. ${m1}–${so.getUTCDate()}. ${m2}`
}

/**
 * Die Woche, für die es keine Arbeitsheft-Seite gibt.
 *
 * **Die Zusammenkunft unter der Woche bleibt leer** — nicht als Notbehelf,
 * sondern weil es sie nicht gibt: Der Herausgeber druckt für diese Woche kein
 * Programm. Gestrichen wird sie nicht hier, sondern im Client aus dem Datum
 * des Anlasses (`setAnlassTermin` → `memAusfall`). Diese Regel steht damit an
 * **einer** Stelle; sie ein zweites Mal in eine Edge Function zu schreiben war
 * schon einmal die Ursache eines Fehlers (B8/T40).
 *
 * Das Wochenende bekommt dieselbe Vorlage wie jede importierte Woche — es
 * findet ganz normal statt, und der Wachtturm-Studienartikel wird vom Aufrufer
 * genauso eingetragen wie sonst.
 */
export function gedaechtnismahlWoche(montagISO: string, memISO: string): MemWoche {
  const range = wochenSpanne(montagISO)
  return {
    range,
    book: '', // kein Bibellese-Kapitel: es gibt keine Wochenseite
    current: false,
    mid: { date: range, end: '', sections: [], helpers: {} },
    we: weekendTemplate(range),
    start: montagISO,
    anlass: { art: 'mem', von: memISO },
    mem: true,
  }
}

/** Eine erzeugte Gedächtnismahl-Woche: Woche plus Kennung und Anlass. */
export type MemWoche = ImportedWeek & {
  start: string
  anlass: { art: 'mem'; von: string }
  mem: true
}

/** UTC-Millisekunden → ISO-Tag. */
function iso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}
