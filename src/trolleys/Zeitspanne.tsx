import type { TrolleyTermin } from '../data/types'
import { zeitSpanne } from './trolley-anzeige'
import './trolleys.css'

/**
 * **„09:00–11:00" in einem Stück** (T193): ohne Umbruch am Strich und
 * bidi-isoliert. In Arabisch und Persisch brach die Spanne nach dem Strich
 * um und las sich als „-09:00 / 11:00".
 */
export function Zeitspanne({ termin }: { termin: Pick<TrolleyTermin, 'von' | 'bis'> }) {
  return <span className="zeitspanne">{zeitSpanne(termin)}</span>
}
