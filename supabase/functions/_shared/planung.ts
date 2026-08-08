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

/* ---- Sonderwochen (T30) --------------------------------------------------- */

/**
 * Abweichung **einer** Zusammenkunft von der Regel — verlegter Tag, andere
 * Uhrzeit, Ausfall, Grund. Spiegelbild von `Abweichung` in
 * `src/data/types.ts`.
 *
 * Warum das hier stehen muss: eine verlegte Woche verschiebt **auch die
 * Erinnerungen**. `send-reminders` rechnete mit dem regulären Wochentag aus den
 * Einstellungen; die Erinnerung nannte dann einen Abend, an dem niemand kommt.
 * Und eine ausgefallene Zusammenkunft darf gar nicht erst erinnern.
 */
export interface Abweichung {
  day?: string
  time?: string
  cancelled?: boolean
  reason?: string
}

/** Abweichungen einer Woche, je Zusammenkunft. */
export type Abweichungen = Partial<Record<'mid' | 'we', Abweichung>>

/** Abweichung dieser einen Zusammenkunft, falls es eine gibt. */
export function abweichungFuer(
  dev: Abweichungen | undefined,
  tab: 'mid' | 'we',
): Abweichung | undefined {
  return dev?.[tab]
}

/**
 * Findet diese Zusammenkunft gar nicht statt?
 *
 * Eng gemeint: **es kommt niemand zusammen** (Kongresswoche, abgesagte
 * Zusammenkunft). Die Gedächtnismahl-Woche gehört ausdrücklich nicht dazu —
 * dort wird der reguläre Ablauf *ersetzt*, und das Mahl hat eigene
 * Zuteilungen, die sehr wohl erinnert werden wollen.
 */
export function istAusgefallenFuer(dev: Abweichungen | undefined, tab: 'mid' | 'we'): boolean {
  return abweichungFuer(dev, tab)?.cancelled === true
}

/**
 * Wochentag-Versatz mit Abweichung. Rangfolge wie im Client
 * (`meetingOffset`, src/data/meeting-dates.ts):
 * Abweichung → eigener Termin im `date`-Feld → Rhythmus aus den Einstellungen.
 */
export function versatzMitAbweichung(
  dev: Abweichungen | undefined,
  tab: 'mid' | 'we',
  dateFeld: string | undefined,
  fallback: number,
): number {
  const verlegt = abweichungFuer(dev, tab)?.day
  if (verlegt && verlegt in WEEKDAY_OFFSET) return WEEKDAY_OFFSET[verlegt]
  const tag = /\b(Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonnabend|Sonntag)\b/.exec(
    dateFeld ?? '',
  )
  return tag ? WEEKDAY_OFFSET[tag[1]] : fallback
}

/** Uhrzeit mit Abweichung — gleiche Rangfolge wie beim Tag. */
export function zeitMitAbweichung(
  dev: Abweichungen | undefined,
  tab: 'mid' | 'we',
  dateFeld: string | undefined,
  fallback: string,
): string {
  const verlegt = abweichungFuer(dev, tab)?.time
  if (verlegt) return verlegt
  const zeit = /\b(\d{1,2})[:.](\d{2})\b/.exec(dateFeld ?? '')
  return zeit ? `${zeit[1].padStart(2, '0')}:${zeit[2]}` : fallback
}
