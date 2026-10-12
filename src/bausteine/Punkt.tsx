import type { SaalLage } from '../data/saal'
import './bausteine.css'

/**
 * Die Lagen der Punktsprache (T121) — dieselben wie im Saal: voll ist
 * zugesagt, blass wartet, rot ist ein Problem, gestrichelt noch offen, Minze
 * bist du.
 */
export type PunktArt = SaalLage

/** Ganze Klassennamen, damit eine Textsuche sie findet (`tests/css-klassen.test.ts`). */
const PUNKT_KLASSE: Record<PunktArt, string> = {
  voll: 'punkt is-voll',
  wartet: 'punkt is-wartet',
  problem: 'punkt is-problem',
  offen: 'punkt is-offen',
  du: 'punkt is-du',
}

/**
 * **Ein Statuspunkt.** Rein zur Ansicht: Was er bedeutet, steht immer auch als
 * Wort daneben oder in der Beschriftung — allein auf die Farbe verlässt sich
 * nichts.
 */
export function Punkt({ art }: { art: PunktArt }) {
  return <span className={PUNKT_KLASSE[art]} aria-hidden="true" />
}
