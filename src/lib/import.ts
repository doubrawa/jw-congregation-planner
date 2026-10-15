/**
 * Arbeitsheft-Import: ruft die Supabase Edge Function `import-week` auf, die
 * das Programm serverseitig von jw.org holt und als Week zurückgibt (umgeht
 * CORS). Ohne Datenbank (keine Konfiguration, Entwicklerseite) nicht verfügbar.
 */

import { isoDay, montagNach, montagVon, weekEndMs } from '../data/meeting-dates'
import type { Week } from '../data/types'
import { supabase } from './supabase'

/**
 * Fehlerfall des Imports — **nur Schlüssel**, die der Aufrufer in der Sprache
 * des Nutzers ausgibt: `'ohne-datenbank'`, `'ende'` (das Heft hat keine weitere
 * Woche), `'sprache-fehlt'` (die Woche gibt es in der Sprache der Versammlung
 * noch nicht) und `'unbekannt'` für alles Übrige.
 *
 * Bis Phase 10 von T121 ging alles andere als Meldung des Servers unverändert
 * durch — deutsche Sätze („Diese Woche ist in der gewählten Sprache …"), dazu
 * „forbidden" und „Import fehlgeschlagen.", in jeder Sprache der App. Was der
 * Server sagt, steht jetzt in der Konsole. (`'ohne-datenbank'` hieß bis zum
 * 2.10.2026 `'demo'`; einen Demo-Modus gibt es nicht mehr.)
 */
export type ImportFehler = 'ohne-datenbank' | 'unbekannt' | 'ende' | 'sprache-fehlt'

/** Was der Server sagte, für die Konsole — angezeigt wird der Schlüssel. */
function unbekannt(meldung: string | undefined): ImportFehler {
  console.error('[import-week]', meldung ?? 'ohne Meldung')
  return 'unbekannt'
}

/**
 * Was der Server zu einer Antwort mit Status ≠ 2xx sagt. `functions.invoke`
 * meldet dann selbst nur einen festen englischen Satz und legt die Antwort
 * hinter `error.context`.
 */
async function serverFehler(error: { message: string; context?: unknown }): Promise<ImportFehler> {
  const antwort = error.context as { json?: () => Promise<unknown> } | undefined
  const body = (await antwort?.json?.().catch(() => null)) as { error?: string; ende?: boolean; code?: string } | null
  if (body?.ende) return 'ende'
  if (body?.code === 'sprache-fehlt') return 'sprache-fehlt'
  return unbekannt(body?.error ?? error.message)
}

export type ImportResult = { ok: true; week: Week } | { ok: false; error: ImportFehler }

/** ISO-Startdatum der zuletzt importierten Woche (für die nächste Woche). */
export function latestImportedStart(weeks: Week[]): string | undefined {
  const starts = weeks.map((w) => w.start).filter((s): s is string => Boolean(s)).sort()
  return starts[starts.length - 1]
}

/**
 * **Wonach „Holen" sucht** — `after` für `import-week`: die späteste geladene
 * Woche, aber keine vor der Vorwoche. Eine vergangene Woche plant niemand
 * mehr. Bis zum 16.10.2026 holte „Holen" nach einer Pause die Woche nach der
 * zuletzt geladenen, Wochen zurück — und die laufende erst viele Abrufe
 * später. Ohne geladene Woche `undefined`: Dann wählt der Server die laufende.
 */
export function holenNach(weeks: Week[], heute: Date): string | undefined {
  const letzte = latestImportedStart(weeks)
  if (!letzte) return undefined
  const vorwoche = montagNach(montagVon(isoDay(heute)), -1)
  return letzte > vorwoche ? letzte : vorwoche
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
  if (!supabase) return { ok: false, error: 'ohne-datenbank' }
  const { data, error } = await supabase.functions.invoke('import-week', {
    body: { after: afterISO, lang: langCode, altLangs },
  })
  if (error) return { ok: false, error: await serverFehler(error) }
  const payload = data as { week?: Week; error?: string } | null
  if (!payload?.week) return { ok: false, error: unbekannt(payload?.error) }
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
  if (!supabase) return { ok: false, error: 'ohne-datenbank' }
  const { data, error } = await supabase.functions.invoke('import-week', {
    body: { start: startISO, lang: langCode, altLangs },
  })
  if (error) return { ok: false, error: await serverFehler(error) }
  const payload = data as { week?: Week; error?: string } | null
  if (!payload?.week) return { ok: false, error: unbekannt(payload?.error) }
  return { ok: true, week: payload.week }
}
