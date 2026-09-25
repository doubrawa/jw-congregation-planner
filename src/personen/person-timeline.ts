import type { AppState } from '../app/context'
import { abwesenheitsRaender, abwRang, markiereAbwesenheiten, type AbwRand } from '../components/zeitleiste-gemeinsam'
import { fsLeiterZuteilung, fsTag } from '../data/fs'
import { displayName, gehoertZu } from '../data/helpers'
import { fromIso, kalendertagMs, meetingDate, meetingTime } from '../data/meeting-dates'
import { deriveMyTasks, taskKeyWeek, wochenIndex } from '../data/planning'
import type { Person } from '../data/types'

/**
 * Ein Eintrag der Zeitleiste im Personen-Detail — für beide Arten gleich
 * aufgebaut: echtes Datum plus Uhrzeit. Die Beschriftung bleibt kanonisch
 * deutsch und wird erst bei der Anzeige übersetzt.
 */
export type TimelineEntry = {
  key: string
  /** Kalendertag der Aufgabe — ordnet Zusammenkünfte, Treffpunkte und Abwesenheiten ineinander. */
  datum: Date
  /** "19:00"; leer, wenn die Versammlung keine Zeit hinterlegt hat. */
  zeit: string
  /** Liegt vor dem heutigen Tag. */
  vergangen: boolean
  /**
   * Läuft an dieser Stelle eine Abwesenheit — oberhalb bzw. unterhalb des
   * Punktes? Daraus färbt die Anzeige die Linie **zwischen** Beginn und Ende
   * ein. Getrennt nach oben und unten, weil der Punkt selbst die Grenze ist:
   * Beim Beginn ist nur das Stück darunter drin, beim Ende nur das darüber.
   */
  abwOben?: boolean
  abwUnten?: boolean
} & (
  | {
      kind: 'meeting'
      /** Programmpunkt — Versammlungssprache; leer, wo die Rolle allein trägt. */
      titel: string
      /** Rolle/Dienstname — App-Sprache (siehe `MyTask.rolle`). */
      rolle?: string
    }
  | { kind: 'fs'; ort: string }
  | {
      kind: 'abw'
      /** Id der Abwesenheit — zum Entfernen aus der Zeitleiste heraus. */
      abwId: string
      grund: string
      /**
       * Welches Ende des Zeitraums. `einzel` = ein einziger Tag; dann gibt es
       * nur einen Punkt und keine Strecke.
       */
      rand: AbwRand
    }
)

/** Was die Zeitleiste aus dem Zustand braucht (erleichtert das Testen). */
export type TimelineDaten = Pick<
  AppState,
  'weeks' | 'services' | 'confirmations' | 'congregation' | 'fsWeeks' | 'absences'
>

/**
 * Alle Zuteilungen einer Person in zeitlicher Reihenfolge: Programmpunkte,
 * Ratgeber und Hilfsdienste der Zusammenkünfte (deriveMyTasks — dieselbe
 * Quelle wie „Meine Aufgaben") plus die geleiteten Treffpunkte.
 *
 * Datum und Uhrzeit werden gerechnet: importierte Wochen tragen im `date`-Feld
 * nur die Wochenspanne („7.–13. September"). Der Tag ergibt sich aus dem Montag
 * der Woche plus dem in den Einstellungen festgelegten Wochentag, die Uhrzeit
 * ebenso — außer die Woche nennt einen eigenen Termin (Gedächtnismahl).
 */
export function personTimeline(
  person: Person,
  state: TimelineDaten,
  heute = new Date(),
): TimelineEntry[] {
  const name = displayName(person)
  // Vergangen wird am echten Kalendertag entschieden.
  const grenze = new Date(heute)
  grenze.setHours(0, 0, 0, 0)
  const entries: TimelineEntry[] = []

  const tasks = deriveMyTasks(
    state.weeks,
    state.services,
    name,
    state.confirmations,
    state.congregation.times,
    person.id,
  )
  for (const task of tasks) {
    const pos = taskKeyWeek(task.id)
    const wi = pos ? wochenIndex(state.weeks, pos.woche) : -1
    const week = wi >= 0 ? state.weeks[wi] : undefined
    if (!pos || !week) continue
    // Tag und Uhrzeit kommen aus meeting-dates.ts — derselben Quelle wie
    // Countdown, Erinnerung und Abwesenheitsprüfung. Die Zeitleiste hatte
    // dafür eine eigene Rechnung, was bei abweichenden Terminen auseinanderlief.
    const datum = meetingDate(week, pos.tab, state.congregation.times)
    entries.push({
      kind: 'meeting',
      key: task.id,
      datum,
      zeit: meetingTime(week, pos.tab, state.congregation.times),
      vergangen: datum < grenze,
      // Beide Hälften getrennt weiterreichen: die Anzeige übersetzt den Titel
      // in die Sprache der Versammlung, die Rolle in die des Lesers.
      titel: task.title,
      ...(task.rolle ? { rolle: task.rolle } : {}),
    })
  }

  // Wem ein Treffpunkt gehört, sagt `gehoertZu` — Id vor Name, Freitext
  // (Kreisaufseher) niemandem: dieselbe Regel wie bei den
  // Zusammenkunfts-Aufgaben und in `deriveMyFsTasks`.
  state.fsWeeks.forEach((week, wi) => {
    for (const inst of week) {
      if (!gehoertZu(fsLeiterZuteilung(inst), person)) continue
      /*
       * **Der Tag kommt aus dem Montag DIESER Woche** (T101). Seit T66 stehen
       * die Wochen nach Datum nebeneinander, ohne Platzhalter: Fehlt eine im
       * geladenen Bestand, nannte die alte Rechnung `fsBase + wi·7` ab dort
       * jeden Treffpunkt sieben Tage zu früh — und zwar nur hier, denn der
       * Zusammenkunfts-Zweig oben rechnet längst über `meetingDate`. Dieselbe
       * Leiste zeigte damit zwei Termine derselben Woche eine Woche auseinander.
       */
      const datum = fsTag(state.weeks[wi]?.start ?? '', inst.wd)
      if (!datum) continue
      entries.push({
        kind: 'fs',
        key: `fs|${wi}|${inst.id}`,
        datum,
        zeit: inst.time,
        vergangen: datum < grenze,
        ort: inst.place,
      })
    }
  })

  /*
   * Abwesenheiten — die Gegenrichtung zu den Zuteilungen: wann jemand NICHT da
   * ist. Sie stehen als eigene Punkte in derselben Leiste, statt darunter als
   * zweite Liste; erst dadurch sieht man, dass eine Zuteilung mitten in einen
   * Zeitraum fällt.
   *
   * Ein Zeitraum gibt **zwei** Punkte (Beginn und Ende), ein einzelner Tag
   * einen. Das Ende-Datum gehört noch dazu (`istAbwesendAm` prüft
   * `von <= tag <= bis`), deshalb trägt auch der letzte Punkt „abwesend".
   *
   * Anders als Zuteilungen sind Abwesenheiten **nicht** an die geladenen Wochen
   * gebunden — eine im übernächsten Monat gehört hierher, auch wenn so weit
   * noch kein Programm reicht.
   */
  for (const abw of state.absences) {
    if (abw.personId !== person.id) continue
    for (const rand of abwesenheitsRaender(abw.from, abw.to)) {
      const datum = fromIso(rand === 'ende' ? abw.to : abw.from)
      entries.push({
        kind: 'abw',
        key: `abw|${abw.id}|${rand}`,
        datum,
        zeit: '',
        vergangen: datum < grenze,
        abwId: abw.id,
        grund: abw.reason,
        rand,
      })
    }
  }

  /*
   * Stabil sortiert: bei gleichem Tag bleibt die Programmreihenfolge erhalten.
   * Die Ränder einer Abwesenheit fassen den Tag ein — der Beginn steht vor den
   * Zuteilungen dieses Tages, das Ende dahinter. Sonst liefe die Färbung an
   * einer Zuteilung vorbei, die sehr wohl in den Zeitraum fällt.
   */
  const randVon = (e: TimelineEntry): AbwRand | null => (e.kind === 'abw' ? e.rand : null)
  entries.sort(
    (a, b) => kalendertagMs(a.datum) - kalendertagMs(b.datum) || abwRang(randVon(a)) - abwRang(randVon(b)),
  )
  return markiereAbwesenheiten(entries, randVon)
}
