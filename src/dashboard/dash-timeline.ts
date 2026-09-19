import {
  abwesenheitsRaender,
  abwRang,
  markiereAbwesenheiten,
  type AbwRand,
} from '../components/zeitleiste'
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
  /** Liegt vor dem heutigen Tag — die Zeile tritt zurück. */
  vergangen?: boolean
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
      rand: AbwRand
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
 * **Das Fenster gilt den Aufgaben, nicht den Abwesenheiten.** Es hält die Liste
 * kurz, und kurz wird sie von Zuteilungen. Eine Abwesenheit, die in diese zwei
 * Wochen hineinreicht, steht mit **beiden** echten Rändern da, auch wenn einer
 * davor oder dahinter liegt: Am Ausschnitt abgeschnitten verlor ein Zeitraum,
 * der schon läuft, seinen Beginn, und einer, der die ganzen zwei Wochen
 * umspannt, verschwand ganz — samt seiner Färbung, und der Start behauptete
 * „Keine anstehende Aufgabe" über einer Woche, in der man gar nicht da ist. Ein
 * erfundenes Randdatum am Fensterrand wäre die schlechtere Auskunft als das
 * echte, das eben zurückliegt (und dann blasser steht).
 *
 * Liegt in den zwei Wochen **keine Aufgabe**, steht die nächste dahinter da —
 * auch dann, wenn eine Abwesenheit das Fenster füllt. „Keine anstehende
 * Aufgabe" wäre schlicht falsch, sobald eine in drei Wochen liegt.
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
      const von = fromIso(abw.from)
      const nach = fromIso(abw.to)
      // Ganz vor oder ganz nach dem Fenster: Der Zeitraum sagt über diese zwei
      // Wochen nichts, und was dahinter liegt, steht im Personen-Detail.
      if (kalendertagMs(nach) < ab || kalendertagMs(von) > bis) continue
      for (const rand of abwesenheitsRaender(abw.from, abw.to)) {
        const datum = rand === 'ende' ? nach : von
        zeilen.push({
          kind: 'abw',
          key: `abw|${abw.id}|${rand}`,
          at: kalendertagMs(datum),
          vergangen: kalendertagMs(datum) < ab,
          grund: abw.reason,
          datum,
          rand,
        })
      }
    }
  }

  /*
   * Nach Termin, und bei gleichem Tag fassen die Ränder einer Abwesenheit ihn
   * ein (`abwRang`). Ohne Termin (Demo, Vorlagen) ans Ende — verglichen werden
   * kann dort nichts, und die mitgelieferte Reihenfolge bleibt untereinander
   * erhalten.
   */
  const randVon = (z: DashZeile): AbwRand | null => (z.kind === 'abw' ? z.rand : null)
  zeilen.sort(
    (a, b) => (a.at ?? Infinity) - (b.at ?? Infinity) || abwRang(randVon(a)) - abwRang(randVon(b)),
  )
  markiereAbwesenheiten(zeilen, randVon)

  const imFenster = (z: DashZeile): boolean =>
    z.at == null || (z.at >= ab && z.at <= bis)
  // Abwesenheiten sind schon beim Sammeln auf das Fenster geprüft; hier fällt
  // nur noch weg, was als Aufgabe zu weit weg liegt.
  const sichtbar = (z: DashZeile): boolean => z.kind === 'abw' || imFenster(z)
  if (zeilen.some((z) => z.kind === 'task' && imFenster(z))) return zeilen.filter(sichtbar)
  // Die nächste Aufgabe dahinter kommt **an ihrem Platz** dazu, nicht hinten
  // angehängt: Eine Abwesenheit reicht über den Fensterrand hinaus und kann
  // später enden als sie.
  const naechste = zeilen.find((z) => z.kind === 'task' && z.at != null && z.at > bis)
  return zeilen.filter((z) => sichtbar(z) || z === naechste)
}
