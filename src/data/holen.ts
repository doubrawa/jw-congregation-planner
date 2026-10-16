/**
 * **Welche Woche als Nächstes geholt wird** — für den Knopf „Holen" in der App
 * (`useWochenImport`) und für das Wartungsskript `wochen-importieren.mjs`.
 *
 * Rein, ohne Supabase-Client: Das Skript lädt es über `appCodeBereit`
 * (`scripts/gemeinsam.mjs`), und `src/lib/import.ts` hängt am Client. Bis zum
 * 16.10.2026 stand es dort, und das Skript schickte ohne gespeicherte Woche gar
 * kein `after` — mit der Folge, die `holenNach` beschreibt (Review, scripts).
 */

import { isoDay, montagNach, montagVon, weekEndMs } from './meeting-dates'
import type { Week } from './types'

/** ISO-Startdatum der zuletzt importierten Woche (für die nächste Woche). */
export function latestImportedStart(weeks: readonly Pick<Week, 'start'>[]): string | undefined {
  const starts = weeks.map((w) => w.start).filter((s): s is string => Boolean(s)).sort()
  return starts[starts.length - 1]
}

/**
 * **Wonach „Holen" sucht** — `after` für `import-week`: die späteste geladene
 * Woche, aber keine vor der Vorwoche. Eine vergangene Woche plant niemand
 * mehr. Bis zum 16.10.2026 holte „Holen" nach einer Pause die Woche nach der
 * zuletzt geladenen, Wochen zurück — und die laufende erst viele Abrufe
 * später.
 *
 * **Immer mit Angabe, auch ohne geladene Woche.** Ohne `after` wählt der
 * Server die laufende Woche nach seinem Tag, und der ist UTC: Montags kurz
 * nach Mitternacht war es dort noch Sonntag, und es kam die vergangene Woche,
 * während die Karte „Holen" die laufende ansagte.
 */
export function holenNach(weeks: readonly Pick<Week, 'start'>[], heute: Date): string {
  const vorwoche = montagNach(montagVon(isoDay(heute)), -1)
  const letzte = latestImportedStart(weeks)
  return letzte !== undefined && letzte > vorwoche ? letzte : vorwoche
}

/**
 * Tag, bis zu dem Programme vorliegen (UTC-ms) — der Sonntag der spätesten
 * geladenen Woche, also ihr letzter Tag.
 *
 * Der Versatz 6 ist bewusst fest und NICHT aus den Zusammenkunftszeiten
 * abgeleitet: gefragt ist das Ende der Kalenderwoche, nicht der Tag der
 * letzten Zusammenkunft. Ohne ISO-Startdatum (Demo- und Vorlagenwochen)
 * null — der Aufrufer zeigt dann den Wochenbereich im Klartext.
 */
export function loadedUntilMs(weeks: readonly Pick<Week, 'start'>[]): number | null {
  return weekEndMs(latestImportedStart(weeks))
}
