import { fromIso, kalendertagMs } from '../data/meeting-dates'
import type { Absence, MyTask } from '../data/types'

/**
 * Wie weit die Leiste auf dem Start-Bildschirm nach vorn sieht — heute
 * mitgezählt.
 *
 * Zwei Wochen, weil der Start sagen soll, was **ansteht**, und nicht, was
 * irgendwann geplant ist: Der Programm-Vorrat reicht oft Monate, und eine Liste
 * von zwanzig Aufgaben ist keine Auskunft mehr. Die ganze Liste steht unter
 * „Meine Aufgaben", die ganze Geschichte einer Person im Personen-Detail.
 */
export const DASH_TAGE = 14

/**
 * Eine Zeile der Start-Leiste. Zuteilungen kommen als ganze `MyTask` durch —
 * beschriftet wird erst bei der Anzeige (`aufgabenLabel`), und Zustand und
 * S-89-Formular hängen ohnehin daran.
 */
export type DashZeile = {
  key: string
  /**
   * Der Kalendertag als UTC-Mitternacht (`MyTask.at`) — Reihenfolge und
   * Fenstergrenze hängen daran. `null` bei Demo- und Vorlagenaufgaben, die
   * nirgends im Kalender liegen.
   */
  at: number | null
  /** Läuft ober- bzw. unterhalb dieser Zeile eine Abwesenheit? */
  abwOben?: boolean
  abwUnten?: boolean
} & (
  | { kind: 'task'; task: MyTask }
  | {
      kind: 'abw'
      grund: string
      /** Kalendertag zum Anzeigen (örtlicher Mittag, wie `fromIso`). */
      datum: Date
      /** Welches Ende des Zeitraums — `einzel` = ein einziger Tag. */
      rand: 'start' | 'ende' | 'einzel'
    }
)

/**
 * Die eigenen Aufgaben der nächsten zwei Wochen, mit den eigenen Abwesenheiten
 * darin — die Leiste des Start-Bildschirms.
 *
 * **Die Quelle ist `state.myTasks`**, nicht die Ableitung aus dem
 * Personen-Detail (`personTimeline`). Sie ist die Liste, die „Meine Aufgaben",
 * das Aufgaben-Blatt und die Bestätigung schon lesen: Zusammenkünfte **und**
 * Treffpunkt-Leitungen, Vergangenes bereits heraus, nach Termin sortiert — und
 * sie trägt je Aufgabe den Stand der Zusage und das S-89-Formular, ohne die der
 * Start nichts anzubieten hätte. Zwei Bildschirme, die „meine Aufgaben" aus
 * verschiedenen Rechnungen nähmen, sind früher oder später uneinig.
 *
 * Die **Abwesenheiten** gehören dazu wie im Personen-Detail: Sie sind die
 * Gegenrichtung und erklären eine leere Strecke. Ihre Ränder werden über die
 * **ganze** Liste eingefärbt und erst danach auf das Fenster beschnitten —
 * sonst verlöre ein Zeitraum, der vor heute beginnt, sein Band.
 *
 * Ist in den zwei Wochen nichts, steht die **nächste** Aufgabe dahinter da.
 * „Keine anstehende Aufgabe" wäre sonst schlicht falsch, sobald eine in drei
 * Wochen liegt — und genau das ist der Normalfall in einer gut geplanten
 * Versammlung.
 */
export function dashTimeline(
  myTasks: readonly MyTask[],
  absences: readonly Absence[],
  personId: string | null,
  heute = new Date(),
): DashZeile[] {
  const ab = kalendertagMs(heute)
  const bis = ab + (DASH_TAGE - 1) * 864e5

  const zeilen: DashZeile[] = myTasks.map((task) => ({
    kind: 'task',
    key: task.id,
    at: task.at ?? null,
    task,
  }))

  // Nur die eigenen: Die Abwesenheiten werden versammlungsweit geladen (die
  // Planung braucht sie). Über die Person, nicht über den Ersteller — dieselbe
  // Grenze wie im Personen-Detail.
  if (personId) {
    for (const abw of absences) {
      if (abw.personId !== personId) continue
      const raender: Array<'start' | 'ende' | 'einzel'> =
        abw.from === abw.to ? ['einzel'] : ['start', 'ende']
      for (const rand of raender) {
        const datum = fromIso(rand === 'ende' ? abw.to : abw.from)
        zeilen.push({
          kind: 'abw',
          key: `abw|${abw.id}|${rand}`,
          at: kalendertagMs(datum),
          grund: abw.reason,
          datum,
          rand,
        })
      }
    }
  }

  /*
   * Nach Termin, und bei gleichem Tag fassen die Ränder einer Abwesenheit ihn
   * ein: Der Beginn steht vor den Aufgaben dieses Tages, das Ende dahinter.
   * Sonst liefe die Färbung an einer Aufgabe vorbei, die sehr wohl in den
   * Zeitraum fällt (dieselbe Regel wie in `personTimeline`).
   *
   * Ohne Termin (Demo, Vorlagen) ans Ende — verglichen werden kann dort nichts,
   * und die mitgelieferte Reihenfolge bleibt untereinander erhalten.
   */
  const rang = (z: DashZeile): number => (z.kind === 'abw' ? (z.rand === 'ende' ? 1 : -1) : 0)
  zeilen.sort((a, b) => (a.at ?? Infinity) - (b.at ?? Infinity) || rang(a) - rang(b))
  markiereAbwesenheiten(zeilen)

  const imFenster = zeilen.filter((z) => z.at == null || (z.at >= ab && z.at <= bis))
  if (imFenster.length > 0) return imFenster
  const naechste = zeilen.find((z) => z.kind === 'task' && z.at != null && z.at > bis)
  return naechste ? [naechste] : []
}

/**
 * Färbt die Strecken zwischen Beginn und Ende: Jede Zeile bekommt gesagt, ob
 * ober- bzw. unterhalb ihres Punktes gerade eine Abwesenheit läuft.
 *
 * Ein Durchlauf mit Zähler statt eines Vergleichs je Paar — so tragen auch
 * **überlappende** Zeiträume (zwei offene gleichzeitig) durchgehend, statt sich
 * gegenseitig wieder auszuschalten. Verändert die Zeilen an Ort und Stelle; sie
 * sind gerade erst entstanden.
 */
function markiereAbwesenheiten(zeilen: DashZeile[]): void {
  let offen = 0
  for (const z of zeilen) {
    const vorher = offen
    if (z.kind === 'abw') {
      if (z.rand === 'start') offen++
      else if (z.rand === 'ende') offen--
    }
    z.abwOben = vorher > 0
    z.abwUnten = offen > 0
  }
}
