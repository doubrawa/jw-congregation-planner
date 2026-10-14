import type { ReactNode } from 'react'
import '../bausteine/bausteine.css'
import './zeitleiste.css'

/**
 * Eine Zeile der Zeitleiste — **fertig beschriftet**. Was dasteht, entscheidet
 * der Aufrufer: Er kennt die Sprache seiner Daten (Programmtitel in der
 * Versammlungssprache, Rollen und Wochentage in der des Lesers).
 */
export interface ZeitZeile {
  key: string
  /** Die Datumszeile („Dienstag, 8. September · 19:00"). */
  wann: string
  /** Was an dem Tag ansteht. */
  art: ReactNode
  /** Eine Abwesenheit: Der Punkt trägt dann die Farbe der Probleme. */
  abw?: boolean
  /**
   * Läuft ober- bzw. unterhalb des Punktes eine Abwesenheit? Daraus färbt die
   * Leiste die Strecke **zwischen** Beginn und Ende ein.
   */
  abwOben?: boolean
  abwUnten?: boolean
  /** Liegt vor dem heutigen Tag — die Zeile tritt zurück. */
  vergangen?: boolean
}

/**
 * **Die Zeitleiste einer Person** (Personen, T121 als Karte): je Eintrag ein
 * Punkt an einer senkrechten Linie, dazu Datum und Art. Abwesenheiten markieren
 * Beginn und Ende, und die Strecke dazwischen ist eingefärbt — was in den
 * Abschnitt fällt, liegt sichtbar darin.
 *
 * Bis zur Phase 3a stand sie auch auf dem Start; seither zeigt nur noch die
 * Person sie, und Knöpfe in den Zeilen gibt es nicht mehr: Entfernt wird eine
 * Abwesenheit in ihrer eigenen Karte (`AbwesenheitenKarte`). Ohne Zeile bleibt
 * die Karte ganz weg.
 */
export function Zeitleiste({ label, zeilen }: { label: string; zeilen: readonly ZeitZeile[] }) {
  if (zeilen.length === 0) return null
  return (
    <section className="karte zeit-karte">
      <h2 className="abschnitt-titel karte-titel">{label}</h2>
      <ol className="zeit">
        {zeilen.map((z) => (
          <li key={z.key} className={zeilenKlassen(z)}>
            <span className={z.abw ? 'zeit-dot zeit-dot--abw' : 'zeit-dot'} aria-hidden="true" />
            <span className="zeit-datum">{z.wann}</span>
            <span className="zeit-art">{z.art}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}

/**
 * Ganze Namen, nie zusammengesetzt (siehe styles/klassennamen.test.ts).
 *
 * **Die Zeile entscheidet nicht mit, ob ein Band sichtbar ist.** Hier stand
 * einmal `abwOben && i > 0` — an der ersten und letzten Zeile endet die Leiste
 * ohnehin am Punkt, und eine Strecke ins Leere wäre ein Strich zu viel. Für die
 * ungeschnittene Leiste war die Bedingung wirkungslos (über der ersten Zeile
 * läuft nie etwas), für einen Ausschnitt dagegen falsch: Eine Aufgabe mitten in
 * einer langen Abwesenheit stand dann ohne Band da. Wo das Band läuft, weiß
 * `markiereAbwesenheiten` und sonst niemand; wo die Leiste endet, ist eine
 * Frage der Darstellung und steht im Stylesheet (`:first-child` /
 * `:last-child`).
 */
function zeilenKlassen(z: ZeitZeile): string {
  const namen = ['zeit-row']
  if (z.vergangen) namen.push('is-past')
  if (z.abwOben) namen.push('zeit-row--abw-oben')
  if (z.abwUnten) namen.push('zeit-row--abw-unten')
  return namen.join(' ')
}
