/**
 * Arbeitsheft-Import: ruft die Supabase Edge Function `import-week` auf, die
 * das Programm serverseitig von jw.org holt und als Week zurückgibt (umgeht
 * CORS). Im Demo-Modus nicht verfügbar.
 */

import type { Week } from '../data/types'
import { supabase } from './supabase'

export type ImportResult = { ok: true; week: Week } | { ok: false; error: string }

/** ISO-Startdatum der zuletzt importierten Woche (für die nächste Woche). */
export function latestImportedStart(weeks: Week[]): string | undefined {
  const starts = weeks.map((w) => w.start).filter((s): s is string => Boolean(s)).sort()
  return starts[starts.length - 1]
}

/** Holt die nächste kommende Woche nach `afterISO` (oder die aktuelle). */
export async function importNextWeek(afterISO?: string): Promise<ImportResult> {
  if (!supabase) return { ok: false, error: 'demo' }
  const { data, error } = await supabase.functions.invoke('import-week', {
    body: { after: afterISO, lang: 'de' },
  })
  if (error) return { ok: false, error: error.message }
  const payload = data as { week?: Week; error?: string } | null
  if (!payload?.week) return { ok: false, error: payload?.error ?? 'Unbekannter Fehler beim Import' }
  return { ok: true, week: payload.week }
}
