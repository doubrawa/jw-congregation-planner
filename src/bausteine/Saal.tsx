import type { PlatzLage, SaalLage } from '../data/saal'
import { LOGO_GROSS } from './logo-form'
import './bausteine.css'

/**
 * Die 18 Plätze des Logos 4-6-8, von vorn nach hinten. Aus `logo-form.ts`, nicht
 * abgeschrieben: Bis zum 16.10.2026 stand hier eine eigene Liste, und als das
 * Pult näher an die Reihen rückte, hätte der Saal es als Einziger nicht getan.
 */
const PLAETZE = LOGO_GROSS.reihen.flat()

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
  const [pultX, pultY] = LOGO_GROSS.pult.mitte
  return (
    <svg className="saal" viewBox={LOGO_GROSS.viewBox} role="img" aria-label={label}>
      <circle className="logo-pult" cx={pultX} cy={pultY} r={LOGO_GROSS.pult.r} />
      {PLAETZE.map(([x, y], i) => {
        const lage = lagen[i] ?? 'offen'
        if (lage === 'du') {
          return (
            <g key={i} className="saal-du">
              <circle cx={x} cy={y} r={LOGO_GROSS.r} />
              <circle className="saal-ring" cx={x} cy={y} r="25" />
            </g>
          )
        }
        return <circle key={i} className={PLATZ_KLASSE[lage]} cx={x} cy={y} r={lage === 'offen' ? 13 : LOGO_GROSS.r} />
      })}
    </svg>
  )
}
