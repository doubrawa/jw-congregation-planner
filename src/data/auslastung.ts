/**
 * **Auslastung: wer war in letzter Zeit wie oft dran?**
 *
 * Die Zahl hinter jedem Namen im Zuteilungs-Blatt („2 Aufgaben in 5 Wochen"),
 * die Mini-Quadrate daneben und die Reihenfolge, in der die Auto-Zuteilung
 * wählt — alles dasselbe Fenster, alles hier.
 *
 * **Warum nicht mehr in `helpers.ts`:** Dort stand ein Vermerk, dieses Modul
 * dürfe `aux-class.ts` nicht importieren, weil `partWorkload` sonst einen Zyklus
 * baue — und deshalb standen der Platz-Durchlauf und seine Nachbarn in der
 * untersten Schicht, wo sie fachlich nicht hingehören. Der Zyklus verschwindet,
 * sobald die Auslastung eine Schicht höher wohnt: Sie darf dann aus `plaetze.ts`
 * lesen, und `helpers.ts` muss von ihr nichts wissen.
 */

import { gehoertZu, istAusgefallen, MEETING_TABS } from './helpers'
import { allePlaetze } from './plaetze'
import type { Person, Service, Week } from './types'

const WOCHE_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Auslastung nur aus **Programmpunkten** (Aufgaben) über die gegebenen Wochen.
 *
 * Der Gesprächspartner eines Schülerteils zählt als eigene Aufgabe — er hat
 * einen eigenen Platz (`schulungPartner`) und wird darüber mitgezählt. Er stand
 * einmal als Beschriftung („mit A. Hoffmann") in der Rolle des Schülers, und
 * die Auslastung suchte den Namen darin; das war die eine Stelle, an der die
 * Zuordnung zwangsläufig über den Namen ging.
 *
 * Beide Räume zählen: ein Schülerteil in der Zusätzlichen Klasse (`item.aux`)
 * ist dieselbe Aufgabe wie im Hauptsaal, und der Ratgeber der Klasse ist
 * ebenfalls eingeteilt. Wurden sie nicht mitgezählt, galt genau die Hälfte
 * aller Schulungsaufgaben als „frei" — wer in der Klasse dran war, stand in der
 * Strichliste weiter bei null und wurde gleich wieder gewählt.
 *
 * Beides aber nur, **solange die Klasse besteht**: beim Abschalten bleiben die
 * Namen absichtlich stehen, damit ein Wiedereinschalten sie wiederfindet.
 */
export function partWorkload(weeks: Week[], person: Person): number {
  let count = 0
  for (const week of weeks) {
    for (const tab of MEETING_TABS) {
      // Eine entfallene Zusammenkunft zählt nicht (T30). Die Zuteilungen
      // bleiben stehen, damit die Planung beim Zurücknehmen wieder da ist —
      // aber wer nicht drankommt, ist auch nicht ausgelastet. Sonst gälte er
      // wochenlang als beschäftigt und die Auto-Zuteilung überginge ihn.
      if (istAusgefallen(week, tab)) continue
      const meeting = week[tab]
      // Beide Räume **und** der Ratgeber in einem Durchlauf (ohne `services`:
      // die Hilfsdienste zählt `helperWorkload`). Dass die Klasse nur zählt,
      // solange sie besteht, entscheidet der Durchlauf — beim Abschalten
      // bleiben die Namen bewusst stehen (damit ein Wiedereinschalten sie hat),
      // und ohne diese Grenze schleppte die Auto-Zuteilung eine Last mit, die
      // es gar nicht mehr gibt.
      for (const platz of allePlaetze(meeting)) {
        if (gehoertZu(platz.slot, person)) count++
      }
    }
  }
  return count
}

/**
 * Auslastung nur aus **Hilfsdiensten** über die gegebenen Wochen.
 *
 * Gezählt wird nur bis zur eingestellten Platzzahl (`svc.count`) — genau wie
 * `deriveMyTasks` Aufgaben ableitet. Reduziert der Planer die Plätze, bleiben
 * die Namen dahinter in den Wochendaten stehen; sie verschwanden dann aus
 * „Meine Aufgaben", zählten hier aber weiter als Last. Ohne `services` (nicht
 * jeder Aufrufer hat sie) zählt wie bisher alles.
 */
export function helperWorkload(weeks: Week[], person: Person, services?: Service[]): number {
  const grenze = services ? new Map(services.map((s) => [s.key, s.count])) : null
  let count = 0
  for (const week of weeks) {
    for (const tab of MEETING_TABS) {
      if (istAusgefallen(week, tab)) continue // entfällt → kein Hilfsdienst (T30)
      const meeting = week[tab]
      for (const [key, assigned] of Object.entries(meeting.helpers)) {
        const bis = grenze ? (grenze.get(key) ?? 0) : assigned.length
        for (let pos = 0; pos < Math.min(bis, assigned.length); pos++) {
          if (gehoertZu(assigned[pos], person)) count++
        }
      }
    }
  }
  return count
}

/** Gesamt-Auslastung (Programmpunkte + Hilfsdienste) über die gegebenen Wochen. */
export function workloadOf(weeks: Week[], person: Person, services?: Service[]): number {
  return partWorkload(weeks, person) + helperWorkload(weeks, person, services)
}

/** Belegungsart einer Person in EINER Woche (für die Mini-Quadrate). */
export type WeekLoad = 'void' | 'none' | 'task' | 'helper'

/**
 * Radius des Auslastungs-Fensters: so viele Wochen vor und nach der geplanten
 * zählen mit.
 *
 * Einzige Quelle dieser Zahl — für die **Anzeige** (Mini-Quadrate und „… in 5
 * Wochen" im Zuteilungs-Sheet) und für die **Entscheidung** der automatischen
 * Zuteilung. Das waren lange zwei verschiedene Zahlen: gezeigt wurden 5 Wochen,
 * sortiert wurde nach 7. Der Planer las also unter dem Namen eine Zahl, nach der
 * gar nicht sortiert worden war. Gemessen macht die Weite keinen Unterschied
 * mehr (30 Schwestern über ein Jahr: 10–11 Aufgaben bei ±2 wie bei ±3, ein
 * 4er-Ton-Pool jeweils exakt 26/26/26/26), seit die Wartezeit die Fairness
 * trägt — also gilt die Zahl, die man auch sieht.
 *
 * Sie stand früher dreifach da: als Literal beim Ausschneiden der Wochen, als
 * Literal beim Aufruf und ausgeschrieben in 34 Übersetzungen („… in 5 Wochen").
 * Beim letzten Wechsel von 4 auf 5 blieben drei Sprachen bei der alten Zahl
 * stehen; deshalb wird sie in den Text eingesetzt statt hineingeschrieben.
 */
export const LOAD_RADIUS = 2

/** Wie viele Wochen das Auslastungs-Fenster umfasst (aktuelle + beide Seiten). */
export const LOAD_WEEKS = LOAD_RADIUS * 2 + 1


/**
 * Abstand zweier Wochen in **Wochen** — nicht in Einträgen.
 *
 * `LOAD_RADIUS = 2` hieß bisher „±2 Einträge". Das ist dasselbe, solange die
 * Wochen lückenlos aufeinanderfolgen. Fehlt eine (Kongress, Urlaub, eine
 * Woche, die nie importiert wurde), rechnet die Fairness-Logik über einen
 * anderen Zeitraum als den, den das Sheet daneben behauptet („2 Aufgaben in
 * 5 Wochen").
 *
 * Grundlage ist `week.start`, das ISO-Datum aus dem jw.org-Import. Fehlt es
 * bei einer der beiden — Demo-Daten, Platzhalter, von Hand angelegte Wochen —,
 * bleibt es beim Indexabstand: die alte Näherung ist besser als gar keine
 * Ordnung.
 */
export function wochenAbstand(a: Week | undefined, b: Week | undefined, ia: number, ib: number): number {
  const ta = a?.start ? Date.parse(a.start) : NaN
  const tb = b?.start ? Date.parse(b.start) : NaN
  if (Number.isNaN(ta) || Number.isNaN(tb)) return Math.abs(ia - ib)
  return Math.round(Math.abs(ta - tb) / WOCHE_MS)
}

/**
 * Die Woche, die `versatz` Wochen von `weeks[wi]` entfernt liegt — nach Datum,
 * nicht nach Index. Ohne Datum (Demo, Platzhalter) der schlichte Nachbar.
 */
function wocheBeiVersatz(weeks: Week[], wi: number, versatz: number): Week | undefined {
  const hier = weeks[wi]
  if (!hier?.start) return weeks[wi + versatz]
  const ziel = new Date(Date.parse(hier.start) + versatz * WOCHE_MS).toISOString().slice(0, 10)
  return weeks.find((w) => w?.start === ziel)
}

/**
 * Die Wochen des Auslastungs-Fensters um `wi` — **nach Datum**, nicht nach
 * Position (T36), und damit genau die, die `loadWindow` als Quadrate zeigt.
 *
 * Es gab die Rechnung zweimal: die Quadrate liefen über `wocheBeiVersatz`, die
 * Zahl daneben („2 Aufgaben in 5 Wochen") und die Auto-Zuteilung schnitten mit
 * `slice` nach Position. Solange die Wochen lückenlos folgen, ist das
 * dasselbe; fehlt eine — eine nie importierte Woche —, beschreiben Quadrat und
 * Zahl verschiedene Zeiträume, und sortiert wird nach einem dritten. Genau
 * diese Verwechslung hat T36 an anderer Stelle schon einmal behoben.
 *
 * Fehlende Wochen fallen weg; das Fenster ist dann kleiner als `LOAD_WEEKS`.
 * Das ist die richtige Auskunft: eine Woche, die es nicht gibt, trägt nichts
 * bei — weder Last noch Gelegenheit.
 */
export function lastFenster(weeks: Week[], wi: number, radius = LOAD_RADIUS): Week[] {
  const out: Week[] = []
  for (let versatz = -radius; versatz <= radius; versatz++) {
    const week = wocheBeiVersatz(weeks, wi, versatz)
    if (week) out.push(week)
  }
  return out
}

/**
 * Belegung je Woche im ±`radius`-Fenster um `wi` (Standard LOAD_RADIUS).
 * `void` = keine solche Woche geladen, `none` = frei, `task` = Programmpunkt
 * (Aufgabe), `helper` = nur Hilfsdienst (Aufgabe hat Vorrang, falls beides in
 * derselben Woche).
 *
 * `services` gehört hierher, obwohl die Quadrate nur eine Farbe zeigen: die
 * Zahl daneben („2 Aufgaben in 5 Wochen") kommt aus `workloadOf` und zählt
 * Hilfsdienste nur bis `svc.count`. Ohne dieselbe Grenze zeigte dieselbe Zeile
 * „frei" und daneben ein belegtes Quadrat — die Platzzahl war reduziert, der
 * Name stand aber noch dahinter in den Wochendaten.
 */
export function loadWindow(
  weeks: Week[],
  person: Person,
  wi: number,
  services?: Service[],
  radius = LOAD_RADIUS,
): WeekLoad[] {
  const out: WeekLoad[] = []
  // Nach Datum, nicht nach Index (T36): fehlt eine Woche, zeigen die Quadrate
  // sonst eine, die drei Wochen zurückliegt, als „vor zwei Wochen".
  for (let versatz = -radius; versatz <= radius; versatz++) {
    const week = wocheBeiVersatz(weeks, wi, versatz)
    if (!week) out.push('void')
    else if (partWorkload([week], person) > 0) out.push('task')
    else if (helperWorkload([week], person, services) > 0) out.push('helper')
    else out.push('none')
  }
  return out
}

/**
 * Kleiner, stabiler String-Hash für faire, deterministische Tie-Breaks.
 *
 * Die Nachmischung (Avalanche) ist entscheidend, nicht Zierrat: `h*31 + zeichen`
 * allein schreibt die zuletzt angehängten Zeichen nur in die niedrigsten Stellen.
 * Der Schlüssel „Name|Woche|Zusammenkunft" ergab damit Werte, die sich von Woche
 * zu Woche um 0,02 % des Wertebereichs unterschieden, während der Name die hohen
 * Bits bestimmte — die Reihenfolge bei Gleichstand war also in JEDER Woche
 * dieselbe feste Rangliste nach Namen. Wer darin hinten stand, kam nie dran,
 * solange irgendjemand anders dieselbe (meist: null) Last hatte. Der Mixer sorgt
 * dafür, dass jedes Eingabe-Bit alle Ausgabe-Bits erreicht, die Reihenfolge also
 * pro Woche wirklich wechselt.
 *
 * Steht hier und nicht in `planning.ts`, weil die Treffpunkt-Zuteilung
 * (`fs.ts`) dieselbe Fairness braucht und lange eine eigene, ungemischte Kopie
 * mitschleppte — also genau den Fehler, den dieser Kommentar beschreibt.
 */
export function tieHash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0
  h ^= h >>> 16
  h = Math.imul(h, 0x7feb352d)
  h ^= h >>> 15
  h = Math.imul(h, 0x846ca68b)
  h ^= h >>> 16
  return h >>> 0
}
