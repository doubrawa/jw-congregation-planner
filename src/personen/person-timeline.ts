import type { AppState } from '../app/context'
import { displayName } from '../data/helpers'
import { meetingDate, meetingTime, tageZwischen } from '../data/meeting-dates'
import { deriveMyTasks, taskKeyWeek, wochenIndex } from '../data/planning'
import type { Person } from '../data/types'

/**
 * Ein Eintrag der Zeitleiste im Personen-Detail — für beide Arten gleich
 * aufgebaut: echtes Datum plus Uhrzeit. Die Beschriftung bleibt kanonisch
 * deutsch und wird erst bei der Anzeige übersetzt.
 */
export type TimelineEntry = {
  key: string
  /**
   * Tage seit dem Montag der Woche 0. Ordnet Zusammenkünfte und Treffpunkte
   * ineinander — auch bei Demo-/Vorlagenwochen, die kein echtes Datum tragen.
   */
  tag: number
  /** Kalendertag der Aufgabe. */
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
      rand: 'start' | 'ende' | 'einzel'
    }
)

/** Was die Zeitleiste aus dem Zustand braucht (erleichtert das Testen). */
export type TimelineDaten = Pick<
  AppState,
  'weeks' | 'services' | 'confirmations' | 'congregation' | 'fsWeeks' | 'fsBase' | 'absences'
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
  // Vergangen wird am echten Kalendertag entschieden, nicht am `current`-Flag
  // der Woche — das wird nicht nachgeführt und veraltet (siehe fsBaseFromWeeks).
  const grenze = new Date(heute)
  grenze.setHours(0, 0, 0, 0)
  /** Kalendertag zu „Tage nach dem Montag der Woche 0". */
  const datumVon = (tag: number) => {
    const d = new Date(state.fsBase)
    d.setDate(d.getDate() + tag)
    return d
  }
  const entries: TimelineEntry[] = []

  const tasks = deriveMyTasks(
    state.weeks,
    state.services,
    name,
    state.confirmations,
    state.congregation.meetings,
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
    const datum = meetingDate(week, wi, pos.tab, state.fsBase, state.congregation.meetings)
    entries.push({
      kind: 'meeting',
      key: task.id,
      // Sortierschlüssel bleibt „Tage seit dem Montag der Woche 0", damit sich
      // Zusammenkünfte und Treffpunkte ineinander einordnen.
      tag: tageZwischen(state.fsBase, datum),
      datum,
      zeit: meetingTime(week, pos.tab, state.congregation.meetings),
      vergangen: datum < grenze,
      // Beide Hälften getrennt weiterreichen: die Anzeige übersetzt den Titel
      // in die Sprache der Versammlung, die Rolle in die des Lesers.
      titel: task.title,
      ...(task.rolle ? { rolle: task.rolle } : {}),
    })
  }

  // Über die Person-Id, mit Rückfall auf den Namen für Altdaten — dieselbe
  // Rangfolge wie bei den Zusammenkunfts-Aufgaben. Vorher trug ein Treffpunkt
  // nur den Namen; Namensgleiche sahen dadurch gegenseitig ihre Leitungen.
  state.fsWeeks.forEach((week, wi) => {
    for (const inst of week) {
      // Freitext (Kreisaufseher) fällt hier heraus: Er gehört keiner Person,
      // und der Namensweg träfe einen Gleichnamigen — dieselbe Regel wie in
      // `fsLeiterZuteilung`, nur mit eigener Rangfolge.
      if (!inst.leader || inst.lext) continue
      if (!(inst.lpid ? inst.lpid === person.id : inst.leader === name)) continue
      const tag = wi * 7 + ((inst.wd + 6) % 7) // wd: 0=So … 6=Sa → Tage nach Montag
      const datum = datumVon(tag)
      entries.push({
        kind: 'fs',
        key: `fs|${wi}|${inst.id}`,
        tag,
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
  const tagVon = (iso: string): Date => new Date(`${iso}T12:00:00`)
  for (const abw of state.absences) {
    if (abw.personId !== person.id) continue
    const raender: Array<'start' | 'ende' | 'einzel'> =
      abw.from === abw.to ? ['einzel'] : ['start', 'ende']
    for (const rand of raender) {
      const datum = tagVon(rand === 'ende' ? abw.to : abw.from)
      entries.push({
        kind: 'abw',
        key: `abw|${abw.id}|${rand}`,
        tag: tageZwischen(state.fsBase, datum),
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
  const rang = (e: TimelineEntry): number =>
    e.kind === 'abw' ? (e.rand === 'ende' ? 1 : -1) : 0
  entries.sort((a, b) => a.tag - b.tag || rang(a) - rang(b))
  return markiereAbwesenheiten(entries)
}

/**
 * Färbt die Strecken zwischen Beginn und Ende: Jeder Eintrag bekommt gesagt, ob
 * ober- bzw. unterhalb seines Punktes gerade eine Abwesenheit läuft.
 *
 * Ein Durchlauf mit Zähler statt eines Vergleichs je Paar — so tragen auch
 * **überlappende** Zeiträume (zwei offene gleichzeitig) durchgehend, statt sich
 * gegenseitig wieder auszuschalten. Verändert die Einträge an Ort und Stelle;
 * sie sind in dieser Funktion gerade erst entstanden.
 */
function markiereAbwesenheiten(entries: TimelineEntry[]): TimelineEntry[] {
  let offen = 0
  for (const e of entries) {
    const vorher = offen
    if (e.kind === 'abw') {
      if (e.rand === 'start') offen++
      else if (e.rand === 'ende') offen--
    }
    e.abwOben = vorher > 0
    e.abwUnten = offen > 0
  }
  return entries
}
