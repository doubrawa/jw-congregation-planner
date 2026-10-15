import type { AnlassArt } from '../data/types'
import type { Dict } from '../i18n/ui'

/**
 * Wie eine besondere Woche heißt — Kreisaufseher, Gedächtnismahl, Kongress —,
 * oder `null` für eine gewöhnliche. Für die Wochenwahl und die Druckbögen:
 * dieselbe Woche soll an beiden Stellen gleich heißen.
 */
export function anlassName(
  art: AnlassArt | undefined,
  t: Pick<Dict, 'coWoche' | 'memWoche' | 'kongress'>,
): string | null {
  return art === 'co' ? t.coWoche : art === 'mem' ? t.memWoche : art === 'kongress' ? t.kongress : null
}
