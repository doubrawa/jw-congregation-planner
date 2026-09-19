import type { ReactNode } from 'react'
import './zeitleiste.css'

/**
 * Eine Zeile der Zeitleiste — **fertig beschriftet**. Was dasteht, entscheidet
 * der Aufrufer: Er kennt die Sprache seiner Daten (Programmtitel in der
 * Versammlungssprache, Rollen und Wochentage in der des Lesers) und die Knöpfe,
 * die zu seinem Bildschirm gehören.
 */
export interface ZeitZeile {
  key: string
  /** Die Datumszeile („Dienstag, 8. September · 19:00"). */
  wann: string
  /** Was an dem Tag ansteht. */
  art: ReactNode
  /** Eine Abwesenheit: Der Punkt trägt dann die Warnfarbe statt der Panel-Farbe. */
  abw?: boolean
  /**
   * Läuft ober- bzw. unterhalb des Punktes eine Abwesenheit? Daraus färbt die
   * Leiste die Strecke **zwischen** Beginn und Ende ein.
   */
  abwOben?: boolean
  abwUnten?: boolean
  /** Liegt vor dem heutigen Tag — die Zeile tritt zurück. */
  vergangen?: boolean
  /** Tippbar: Datum und Art werden zusammen zum Knopf (Start-Bildschirm). */
  oeffnen?: () => void
  /** Unter der Art: Knöpfe und Zustände (bestätigen, S-89, „Bestätigt"). */
  aktionen?: ReactNode
  /** Am Ende der Zeile: der Countdown-Chip oder das ✕ zum Entfernen. */
  ende?: ReactNode
}

/**
 * Die Zeitleiste: je Eintrag ein Punkt an einer senkrechten Linie, dazu Datum
 * und Art. Abwesenheiten markieren Beginn und Ende, und die Strecke dazwischen
 * ist eingefärbt — was in den Abschnitt fällt, liegt sichtbar darin.
 *
 * Zwei Bildschirme benutzen sie: das **Personen-Detail** (alle Zuteilungen und
 * Abwesenheiten einer Person, Vergangenes blasser) und der **Start** (die
 * eigenen Aufgaben der nächsten zwei Wochen, jede zum Antippen). Beide sollen
 * gleich aussehen, deshalb steht die Form hier und nicht zweimal.
 *
 * Ohne Zeile bleibt die Karte weg — das entscheidet der Aufrufer, der auch
 * weiß, was statt ihrer dastehen soll.
 */
export function Zeitleiste({
  label,
  farbe,
  zeilen,
  lead,
}: {
  label: string
  /** Panel-Farbe (`data-farbe`): „gold" bei den Personen, „acc" auf dem Start. */
  farbe: string
  zeilen: ZeitZeile[]
  /** Erstes Panel des Bildschirms — dann der größere Abstand nach oben. */
  lead?: boolean
}) {
  return (
    <div className={lead ? 'panel panel--lead panel--pb10' : 'panel panel--pb10'} data-farbe={farbe}>
      <div className="panel-label zeit-label">{label}</div>
      <ol className="zeit">
        {zeilen.map((z, i) => (
          <li key={z.key} className={zeilenKlassen(z, i, zeilen.length)}>
            <span
              className={z.abw ? 'zeit-dot zeit-dot--abw' : 'zeit-dot'}
              aria-hidden="true"
            />
            <div className="zeit-body">
              {z.oeffnen ? (
                <button type="button" className="zeit-open" onClick={z.oeffnen}>
                  <span className="zeit-datum">{z.wann}</span>
                  <span className="zeit-art">{z.art}</span>
                </button>
              ) : (
                <>
                  <div className="zeit-datum">{z.wann}</div>
                  <div className="zeit-art">{z.art}</div>
                </>
              )}
              {z.aktionen && <div className="zeit-aktionen">{z.aktionen}</div>}
            </div>
            <div className="zeit-ende">{z.ende}</div>
          </li>
        ))}
      </ol>
    </div>
  )
}

/** Ganze Namen, nie zusammengesetzt (siehe styles/klassennamen.test.ts). */
function zeilenKlassen(z: ZeitZeile, i: number, anzahl: number): string {
  const namen = ['zeit-row']
  if (z.vergangen) namen.push('is-past')
  // Am oberen und unteren Rand gibt es keine Nachbarzeile — dort endet die
  // Leiste ohnehin am Punkt, eine Strecke ins Leere wäre ein Strich zu viel.
  if (z.abwOben && i > 0) namen.push('zeit-row--abw-oben')
  if (z.abwUnten && i < anzahl - 1) namen.push('zeit-row--abw-unten')
  return namen.join(' ')
}
