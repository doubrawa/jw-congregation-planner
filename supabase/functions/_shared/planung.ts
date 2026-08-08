/**
 * Regeln, die Client **und** Edge Functions gleich anwenden müssen.
 *
 * Sie standen bis August 2026 in bis zu drei Fassungen nebeneinander:
 * `meetingDayOffsets` dreimal, `displayName` und `taskDate` je zweimal,
 * `SKIP_ROLE` zweimal. Das ist nicht bloß Doppelarbeit — daraus entstand B8:
 * `send-reminders` rechnete mit dem Array-Index, `substitute` mit `position`,
 * und die Erinnerung zeigte auf eine andere Woche als die Übernahme. Solche
 * Fehler fallen nirgends auf, weil beide Seiten für sich betrachtet stimmen.
 *
 * **Der Ordnername beginnt mit `_`**, damit die Supabase-CLI ihn nicht für
 * eine eigene Function hält; das ist die vorgesehene Ablage für geteilten
 * Code. Der Client bindet dieselbe Datei ein — Vite folgt dem relativen Pfad,
 * und `allowImportingTsExtensions` erlaubt die `.ts`-Endung, die Deno
 * verlangt.
 *
 * **Was hier hineingehört:** reine Funktionen ohne Laufzeit-Abhängigkeit —
 * kein `Deno.*`, kein `import.meta`, kein Netz. Sonst bricht eine der beiden
 * Seiten.
 *
 * Die Gegenprobe steht in `src/data/edge-parity.test.ts`: sie vergleicht die
 * Ergebnisse mit den Client-Fassungen, damit ein Auseinanderlaufen auffällt,
 * bevor es jemand im Betrieb merkt.
 */

/**
 * Rollen, die von außen kommen: kein Bestätigungs-Flow, keine Erinnerung,
 * keine Anrechnung auf die Auslastung.
 */
export const SKIP_ROLE = /Gastredner|Kreisaufseher/

/** Ist dieser Slot von außen besetzt? */
export function isGuestRole(rolle: string | undefined): boolean {
  return Boolean(rolle && SKIP_ROLE.test(rolle))
}

/** Anzeigename: eigener Kurzname, sonst voller Name. */
export function personDisplayName(fn: string, ln: string, dn?: string | null): string {
  return dn || `${fn} ${ln}`.trim()
}

/**
 * Termin aus dem `date`-Feld einer Zusammenkunft:
 * „Dienstag, 8. September · 19:00 · Saal" → „Dienstag, 8. September · 19:00".
 */
export function taskDateText(date: string | undefined): string {
  return (date ?? '').split(' · ').slice(0, 2).join(' · ')
}

/** Wochentags-Kürzel → Tage nach Montag. */
export const DAY_OFFSET: Record<string, number> = {
  Mo: 0, Di: 1, Mi: 2, Do: 3, Fr: 4, Sa: 5, So: 6,
}

/**
 * „Di 19:00 · So 10:00" → Tage nach Montag je Zusammenkunft.
 *
 * Ohne erkennbare Kürzel bleibt es bei Dienstag/Sonntag — dem verbreitetsten
 * Rhythmus. Ein Rückfall auf 0/0 hieße Montag, und das wäre stillschweigend
 * falsch statt stillschweigend üblich.
 */
export function meetingDayOffsets(meetingTimes: string): { mid: number; we: number } {
  const found = [...meetingTimes.matchAll(/\b(Mo|Di|Mi|Do|Fr|Sa|So)\b/g)].map((m) => DAY_OFFSET[m[1]])
  return { mid: found[0] ?? 1, we: found[1] ?? 6 }
}

/**
 * Ausgeschriebener Wochentag → Tage nach Montag. Die Wochendaten sind
 * kanonisch deutsch, auch bei fremdsprachiger Versammlung (übersetzt wird
 * erst bei der Anzeige). „Sonnabend" steht mit drin, weil ältere Datensätze
 * ihn tragen.
 */
export const WEEKDAY_OFFSET: Record<string, number> = {
  Montag: 0, Dienstag: 1, Mittwoch: 2, Donnerstag: 3,
  Freitag: 4, Samstag: 5, Sonnabend: 5, Sonntag: 6,
}
