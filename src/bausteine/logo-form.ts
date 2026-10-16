/**
 * **Die Form des Logos „Versammelt"** (4.10.2026): Sitzreihen um ein
 * Rednerpult, von oben gesehen — dieselben Koordinaten wie die Dateien in
 * `public/` (Raster 512 × 512). Eine Stelle für beide: `tests/logo-form.test.ts`
 * hält die Dateien gegen diese Zahlen.
 *
 * Zwei Fassungen: groß mit 4, 6 und 8 Plätzen (`logo.svg`, Anmeldung und
 * App-Icons), klein mit 3, 5 und 7 kräftigeren Plätzen (`logo-klein.svg`,
 * Favicon, Menü, Druckbögen) — klein verschwammen die 18 Plätze zu Streifen.
 *
 * **Das Pult steht so nah an der ersten Reihe wie zwei Reihen beieinander**
 * (Variante D des Betreibers, 16.10.2026). Die Bögen der Plätze haben ihren
 * Mittelpunkt 35 Einheiten über dem Pult; bis dahin saß es genau dort, und die
 * Lücke zur ersten Reihe war doppelt, klein sogar 2,6-mal so groß wie die
 * zwischen den Reihen. `tests/logo-form.test.ts` hält die Regel fest.
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
  viewBox: '46 125.5 420 251',
  pult: { mitte: [256, 157.5], r: 30 },
  r: 15,
  reihen: [
    [[171.33, 195.82], [224.43, 229.96], [287.57, 229.96], [340.67, 195.82]],
    [[117.15, 230.65], [164.69, 272.96], [224.18, 295.6], [287.82, 295.6], [347.31, 272.96], [394.85, 230.65]],
    [[63.13, 265.34], [107.59, 311.11], [162.54, 343.56], [224.09, 360.37], [287.91, 360.37], [349.46, 343.56], [404.41, 311.11], [448.87, 265.34]],
  ],
}

export const LOGO_KLEIN: LogoForm = {
  viewBox: '62 122.5 388 262',
  pult: { mitte: [256, 157.5], r: 34 },
  r: 21,
  reihen: [
    [[195.43, 216.71], [256, 234.5], [316.57, 216.71]],
    [[138.99, 253.97], [193.4, 286.99], [256, 298.5], [318.6, 286.99], [373.01, 253.97]],
    [[83.83, 289.71], [133.98, 329.17], [192.76, 354.02], [256, 362.5], [319.24, 354.02], [378.02, 329.17], [428.17, 289.71]],
  ],
}
