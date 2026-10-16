import type { AnlassArt, MeetingKey } from '../data/types'
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

/**
 * Wie eine Zusammenkunft heißt — unter der Woche oder am Wochenende. Stand bis
 * zum 16.10.2026 neunmal von Hand da (Review, UI C9), in zwei Schreibweisen.
 */
export function zusammenkunftName(tab: MeetingKey, t: Pick<Dict, 'tabMid' | 'tabWe'>): string {
  return tab === 'we' ? t.tabWe : t.tabMid
}
