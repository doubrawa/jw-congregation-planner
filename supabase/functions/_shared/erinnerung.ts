/**
 * **Der Rhythmus der Erinnerungen** — wann `send-reminders` an eine offene
 * Zuteilung erinnert. Hier, weil zwei Seiten dieselbe Frage stellen: die
 * Function, die erinnert, und die App, die in den Zusagen der Woche sagt, wann
 * die nächste Erinnerung von selbst hinausgeht (T121, Phase 5g). Zwei Fassungen
 * einer Terminregel waren schon einmal die Ursache von B8.
 */

/** Einstellungen → ERINNERUNGEN (Spalten `reminder_first`/`_last`/`_repeat`). */
export interface Rhythmus {
  /** Erste Erinnerung: so viele Tage vor der Zusammenkunft. */
  first: number
  /** Letzte Erinnerung: so viele Tage vorher (0 = am Tag selbst). */
  last: number
  /** An den Tagen dazwischen täglich. */
  repeat: boolean
}

/**
 * Die Stunde (UTC), zu der der tägliche Lauf startet — `cron.schedule` in
 * `supabase/cron-reminders.sql`. Steht dort eine andere, nennt die App einen
 * falschen Tag; `tests/erinnerung-cron.test.ts` hält beide beieinander.
 */
export const ERINNERUNG_STUNDE_UTC = 8

/**
 * Fälligkeit laut Einstellungen: Haupttermin (first/last) oder Wiederholung.
 *
 * **„Letzte Erinnerung" heißt letzte.** Die Wiederholung deckt die Tage
 * *dazwischen* ab — nicht die danach. Geprüft wurde hier nur `days < first`,
 * und damit ging bei `first 7 · last 1 · wiederholen` auch **am Tag der
 * Zusammenkunft selbst** noch eine Erinnerung hinaus (Tag 0 < 7). Wer „letzte
 * Erinnerung: 1 Tag vorher" einstellt, hat ausdrücklich entschieden, am Tag
 * selbst nicht mehr erinnert zu werden; für „am Tag" gibt es den eigenen Wert
 * `last = 0`. Die Einstellung blieb also folgenlos, und niemand sah es — die
 * Erinnerung kam ja an.
 *
 * Die Grenzen werden sortiert genommen, nicht als „first oben, last unten":
 * die Oberfläche lässt `first` 1–21 und `last` 0–7 zu, ein `last > first` ist
 * also einstellbar. Ohne das Sortieren wäre das Fenster dann leer statt
 * umgekehrt.
 */
export function dueKind(rem: Rhythmus, days: number): 'main' | 'repeat' | null {
  if (days < 0) return null
  if (days === rem.first || days === rem.last) return 'main'
  if (!rem.repeat) return null
  const frueh = Math.min(rem.first, rem.last)
  const spaet = Math.max(rem.first, rem.last)
  return days > frueh && days < spaet ? 'repeat' : null
}
