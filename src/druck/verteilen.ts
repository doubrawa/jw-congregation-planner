/**
 * Die Höhe eines A4-Blatts in CSS-Pixeln (96 dpi) — ein Pixel unter 1123,
 * die 297,1 mm wären: Sonst schiebt die Rundung ein leeres Blatt hinterher.
 * Dieselbe Zahl steht in `druck-bogen.css`.
 */
export const BLATT_HOEHE = 1122

/** Ein Blatt: welche Blöcke darauf stehen, und ob einer allein höher ist als das Blatt. */
export interface Blatt {
  indizes: number[]
  ueberlang: boolean
}

/**
 * **Blöcke der Reihe nach auf Blätter verteilen** — so viele, wie passen.
 *
 * `hoehen` sind die gemessenen Höhen der Blöcke, `platz` ist, was auf einem
 * Blatt zwischen Kopf und Fuß bleibt, `abstand` der Abstand zwischen zwei
 * Blöcken. Die Reihenfolge bleibt; ein Block geht nie über zwei Blätter. Passt
 * einer allein nicht auf ein Blatt, bekommt er eins für sich (`ueberlang`).
 *
 * Ohne Blöcke ein leeres Blatt: Ein Bogen ohne Seite druckte gar nichts, und
 * der Druckdialog zeigte ein weißes Nichts.
 */
export function blaetterVerteilen(hoehen: readonly number[], platz: number, abstand: number): Blatt[] {
  const blaetter: Blatt[] = []
  let aktuell: Blatt | null = null
  let belegt = 0
  hoehen.forEach((hoehe, i) => {
    const mitAbstand = aktuell && aktuell.indizes.length > 0 ? belegt + abstand + hoehe : hoehe
    if (aktuell && mitAbstand <= platz) {
      aktuell.indizes.push(i)
      belegt = mitAbstand
      return
    }
    aktuell = { indizes: [i], ueberlang: hoehe > platz }
    blaetter.push(aktuell)
    belegt = hoehe
  })
  return blaetter.length > 0 ? blaetter : [{ indizes: [], ueberlang: false }]
}
