import { isoVonKalendertag, versatzAbMontag } from '../data/meeting-dates'

/**
 * **Das Monatsraster der Kalender** — für die Datumsauswahl (`DatePicker`) und
 * den Zeitraum einer Abwesenheit (`ZeitraumKalender`), dazu dessen Regel für
 * Von und Bis. Gerechnet wird in UTC (zeitzonenneutral), Tage stehen als
 * ISO-Datum.
 */

const TAG = 864e5

/** Ein angezeigter Monat: Jahr und Monat (0 = Januar). */
export interface Monat {
  y: number
  m: number
}

/**
 * Der Monat, mit dem ein Kalender aufgeht.
 *
 * **Mit Wert** kommt er aus dem ISO-Datum, über UTC-Mittag gelesen — dieselbe
 * Rechnung wie das Raster, und damit zeitzonenfrei.
 *
 * **Ohne Wert** ist „dieser Monat" gemeint, und das ist ein **örtlicher**
 * Begriff. Hier stand einmal `new Date()` mit `getUTC…`: Zwischen Mitternacht
 * und 01:00 bzw. 02:00 ist der UTC-Tag in Mitteleuropa noch der gestrige, am
 * Monatsersten also der Vormonat. Der Kalender ging dann im **Februar** auf,
 * während die Heute-Marke auf dem 1. März in der ausgegrauten Nachzeile saß.
 */
export function monatVon(iso: string): Monat {
  if (!iso) {
    const jetzt = new Date()
    return { y: jetzt.getFullYear(), m: jetzt.getMonth() }
  }
  const d = new Date(`${iso}T12:00:00Z`)
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() }
}

/** Ein Monat weiter oder zurück. */
export function monatPlus({ y, m }: Monat, delta: number): Monat {
  const d = new Date(Date.UTC(y, m + delta, 1))
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() }
}

/** 6×7-Raster ab Montag für den Monat, als ISO-Daten. */
export function monatsRaster({ y, m }: Monat): string[] {
  const erster = new Date(Date.UTC(y, m, 1))
  const start = Date.UTC(y, m, 1 - versatzAbMontag(erster.getUTCDay()))
  return Array.from({ length: 42 }, (_, i) => isoVonKalendertag(start + i * TAG))
}

/** Liegt der Tag (ISO) im angezeigten Monat? */
export function imMonat(iso: string, { y, m }: Monat): boolean {
  return Number(iso.slice(0, 4)) === y && Number(iso.slice(5, 7)) === m + 1
}

/** Welches Ende eines Zeitraums der nächste Tipp setzt. */
export type ZeitraumEnde = 'von' | 'bis'

/**
 * Der nächste Stand eines Zeitraums nach einem Tipp auf `tag` (ISO) —
 * `ZeitraumKalender`.
 *
 * Ist „Von" an der Reihe, beginnt der Zeitraum dort; ein „Bis" davor fällt auf
 * denselben Tag, und als Nächstes ist „Bis" dran. Ist „Bis" an der Reihe, endet
 * er dort — es sei denn, der Tag liegt vor „Von": Dann beginnt der Zeitraum
 * neu, denn rückwärts gezogen ist auch gemeint, dass er dort anfängt.
 */
export function zeitraumTippen(
  stand: { von: string; bis: string; ende: ZeitraumEnde },
  tag: string,
): { von: string; bis: string; ende: ZeitraumEnde } {
  if (stand.ende === 'von' || !stand.von || tag < stand.von) {
    return { von: tag, bis: stand.bis && stand.bis >= tag ? stand.bis : tag, ende: 'bis' }
  }
  return { von: stand.von, bis: tag, ende: 'bis' }
}

/** Liegt der Tag (ISO) im gewählten Zeitraum? Ohne beide Enden nie. */
export function imZeitraum(tag: string, von: string, bis: string): boolean {
  return Boolean(von && bis && tag >= von && tag <= bis)
}

const kuerzel = new Map<string, string[]>()

/**
 * Die Kürzel der Wochentage ab Montag, in der Sprache des Lesers — je Sprache
 * einmal gebaut. Ist eine Kurzform länger als drei Zeichen, stehen alle sieben
 * als Anfangsbuchstaben: Bei 320 px ragten „چهارشنبه" bis 29 px aus seinem
 * Siebtel (Arabisch und Persisch schreiben auch „kurz" den ganzen Namen),
 * „niedz." 13 px und „dum." 3 px (T128). Drei Zeichen („Wed", „Çar") passten.
 */
export function wochentagKuerzel(locale: string): string[] {
  const gemerkt = kuerzel.get(locale)
  if (gemerkt) return gemerkt
  const montag = Date.UTC(2024, 0, 1) // 1. Januar 2024 war ein Montag
  const tage = (weekday: 'short' | 'narrow') => {
    const fmt = new Intl.DateTimeFormat(locale, { weekday, timeZone: 'UTC' })
    return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(montag + i * TAG)))
  }
  const kurz = tage('short')
  const ergebnis = kurz.some((k) => [...k].length > 3) ? tage('narrow') : kurz
  kuerzel.set(locale, ergebnis)
  return ergebnis
}
