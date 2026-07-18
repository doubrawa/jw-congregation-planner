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

/**
 * Holt die nächste kommende Woche nach `afterISO` (oder die aktuelle) in der
 * Versammlungssprache `langCode` (jw.org-Code, Standard "de"). `altLangs`
 * (weitere jw.org-Codes) werden als Sprachvarianten mitgeholt (Week.alt).
 */
export async function importNextWeek(
  afterISO?: string,
  langCode = 'de',
  altLangs: string[] = [],
): Promise<ImportResult> {
  if (!supabase) return { ok: false, error: 'demo' }
  const { data, error } = await supabase.functions.invoke('import-week', {
    body: { after: afterISO, lang: langCode, altLangs },
  })
  if (error) return { ok: false, error: error.message }
  const payload = data as { week?: Week; error?: string } | null
  if (!payload?.week) return { ok: false, error: payload?.error ?? 'Unbekannter Fehler beim Import' }
  return { ok: true, week: payload.week }
}

/**
 * Holt eine bereits importierte Woche (identifiziert über ihr ISO-Startdatum)
 * erneut, um fehlende Sprachvarianten nachzuladen — z. B. wenn eine weitere
 * Programmsprache erst nach dem Import konfiguriert wurde. Verwendet wird nur
 * `week.alt` der Antwort.
 */
export async function importWeekVariants(
  startISO: string,
  langCode: string,
  altLangs: string[],
): Promise<ImportResult> {
  if (!supabase) return { ok: false, error: 'demo' }
  const { data, error } = await supabase.functions.invoke('import-week', {
    body: { start: startISO, lang: langCode, altLangs },
  })
  if (error) return { ok: false, error: error.message }
  const payload = data as { week?: Week; error?: string } | null
  if (!payload?.week) return { ok: false, error: payload?.error ?? 'Unbekannter Fehler beim Import' }
  return { ok: true, week: payload.week }
}
