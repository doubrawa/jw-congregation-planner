import type { PlatzLage, SaalLage } from '../data/saal'
import './bausteine.css'

/** Die 18 Plätze des Logos 4-6-8, von vorn nach hinten — wie `werk.mjs` der Leinwand. */
const PLAETZE: ReadonlyArray<readonly [number, number]> = [
  [171.33, 213.32], [224.43, 247.46], [287.57, 247.46], [340.67, 213.32],
  [117.15, 248.15], [164.69, 290.46], [224.18, 313.1], [287.82, 313.1], [347.31, 290.46], [394.85, 248.15],
  [63.13, 282.84], [107.59, 328.61], [162.54, 361.06], [224.09, 377.87], [287.91, 377.87], [349.46, 361.06], [404.41, 328.61], [448.87, 282.84],
]

/** Ganze Klassennamen, damit eine Textsuche sie findet (`tests/css-klassen.test.ts`). */
const PLATZ_KLASSE: Record<PlatzLage, string> = {
  voll: 'saal-platz is-voll',
  wartet: 'saal-platz is-wartet',
  problem: 'saal-platz is-problem',
  offen: 'saal-platz is-offen',
}

/**
 * **Der Saal** (T121): die Besetzung einer Zusammenkunft als Bild, vor dem
 * Pult in Minze. Die Lagen rechnet `saalLagen`; die Beschriftung sagt in
 * Worten, was das Bild zeigt.
 */
export function Saal({ lagen, label }: { lagen: readonly SaalLage[]; label: string }) {
  return (
    <svg className="saal" viewBox="46 108 420 286" role="img" aria-label={label}>
      <circle className="logo-pult" cx="256" cy="140" r="30" />
      {PLAETZE.map(([x, y], i) => {
        const lage = lagen[i] ?? 'offen'
        if (lage === 'du') {
          return (
            <g key={i} className="saal-du">
              <circle cx={x} cy={y} r="15" />
              <circle className="saal-ring" cx={x} cy={y} r="25" />
            </g>
          )
        }
        return <circle key={i} className={PLATZ_KLASSE[lage]} cx={x} cy={y} r={lage === 'offen' ? 13 : 15} />
      })}
    </svg>
  )
}
