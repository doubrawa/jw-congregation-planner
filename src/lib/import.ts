/**
 * Arbeitsheft-Import: ruft die Supabase Edge Function `import-week` auf, die
 * das Programm serverseitig von jw.org holt und als Week zurückgibt (umgeht
 * CORS). Im Demo-Modus nicht verfügbar.
 */

import { weekEndMs } from '../data/meeting-dates'
import type { Week } from '../data/types'
import { supabase } from './supabase'

/**
 * Fehlerfall des Imports. `'demo'`, `'unbekannt'` und `'ende'` (das Heft hat
 * keine weitere Woche) sind Schlüssel, die der Aufrufer in der Sprache des
 * Nutzers ausgibt — hier stand früher ein fester deutscher Satz, den auch ein
 * englischer Planer zu sehen bekam. Alles andere ist die Meldung des Servers
 * und wird unverändert durchgereicht.
 */
export type ImportFehler = 'demo' | 'unbekannt' | 'ende' | (string & {})

/**
 * Was der Server zu einer Antwort mit Status ≠ 2xx sagt. `functions.invoke`
 * meldet dann selbst nur einen festen englischen Satz und legt die Antwort
 * hinter `error.context`.
 */
async function serverFehler(error: { message: string; context?: unknown }): Promise<ImportFehler> {
  const antwort = error.context as { json?: () => Promise<unknown> } | undefined
  const body = (await antwort?.json?.().catch(() => null)) as { error?: string; ende?: boolean } | null
  if (body?.ende) return 'ende'
  return body?.error ?? error.message
}

export type ImportResult = { ok: true; week: Week } | { ok: false; error: ImportFehler }

/** ISO-Startdatum der zuletzt importierten Woche (für die nächste Woche). */
export function latestImportedStart(weeks: Week[]): string | undefined {
  const starts = weeks.map((w) => w.start).filter((s): s is string => Boolean(s)).sort()
  return starts[starts.length - 1]
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
export function loadedUntilMs(weeks: Week[]): number | null {
  return weekEndMs(latestImportedStart(weeks))
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
  if (error) return { ok: false, error: await serverFehler(error) }
  const payload = data as { week?: Week; error?: string } | null
  if (!payload?.week) return { ok: false, error: payload?.error ?? 'unbekannt' }
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
  if (!payload?.week) return { ok: false, error: payload?.error ?? 'unbekannt' }
  return { ok: true, week: payload.week }
}
