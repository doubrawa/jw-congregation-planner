/**
 * **Die Form des Logos „Versammelt"** (4.10.2026): Sitzreihen um ein
 * Rednerpult, von oben gesehen — dieselben Koordinaten wie die Dateien in
 * `public/` (Raster 512 × 512). Eine Stelle für beide: `tests/logo-form.test.ts`
 * hält die Dateien gegen diese Zahlen.
 *
 * Zwei Fassungen: groß mit 4, 6 und 8 Plätzen (`logo.svg`, Anmeldung und
 * App-Icons), klein mit 3, 5 und 7 kräftigeren Plätzen (`logo-klein.svg`,
 * Favicon, Menü, Druckbögen) — klein verschwammen die 18 Plätze zu Streifen.
 */

/** Ein Platz oder das Pult: Mittelpunkt im Raster 512. */
export type Punkt = readonly [x: number, y: number]

export interface LogoForm {
  /** Der Ausschnitt um Pult und Plätze — ohne die Kachel der Dateien. */
  viewBox: string
  pult: { mitte: Punkt; r: number }
  /** Halbmesser eines Platzes. */
  r: number
  /** Die Reihen von vorn nach hinten. */
  reihen: ReadonlyArray<readonly Punkt[]>
}

/** Die hinteren Reihen blasser: so liest man die Tiefe des Saals. */
export const REIHEN_DECKKRAFT = [1, 0.76, 0.52] as const

export const LOGO_GROSS: LogoForm = {
  viewBox: '46 108 420 286',
  pult: { mitte: [256, 140], r: 30 },
  r: 15,
  reihen: [
    [[171.33, 213.32], [224.43, 247.46], [287.57, 247.46], [340.67, 213.32]],
    [[117.15, 248.15], [164.69, 290.46], [224.18, 313.1], [287.82, 313.1], [347.31, 290.46], [394.85, 248.15]],
    [[63.13, 282.84], [107.59, 328.61], [162.54, 361.06], [224.09, 377.87], [287.91, 377.87], [349.46, 361.06], [404.41, 328.61], [448.87, 282.84]],
  ],
}

export const LOGO_KLEIN: LogoForm = {
  viewBox: '62 105 388 297',
  pult: { mitte: [256, 140], r: 34 },
  r: 21,
  reihen: [
    [[195.43, 234.21], [256, 252], [316.57, 234.21]],
    [[138.99, 271.47], [193.4, 304.49], [256, 316], [318.6, 304.49], [373.01, 271.47]],
    [[83.83, 307.21], [133.98, 346.67], [192.76, 371.52], [256, 380], [319.24, 371.52], [378.02, 346.67], [428.17, 307.21]],
  ],
}
