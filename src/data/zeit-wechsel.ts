/*
 * **Die Regelzeit einer Zusammenkunft ändern** — ab einer Woche, nicht für
 * alle zugleich (`MeetingTime.spaeter`).
 *
 * Gelesen wird die Zeit einer Woche an einer Stelle (`regelzeit` in
 * `meeting-dates.ts`, in den Functions `zeitDerWoche`); hier steht das
 * Gegenstück: was aus der Zeit wird, wenn der Admin einen Wechsel einträgt
 * oder einen geplanten wieder streicht. Das Blatt der Einstellungen
 * (`ZusammenkunftBlatt`) ruft nur diese Funktionen.
 */
import type { MeetingTime, ZeitWechsel } from './types'

/** Wochentag und Uhrzeit — was in einer Woche gilt. */
export type Regelzeit = Pick<MeetingTime, 'wd' | 'time'>

const gleich = (a: Regelzeit, b: Regelzeit): boolean => a.wd === b.wd && a.time === b.time

/**
 * Grundzeit und Wechsel als eine Zeit: die Wechsel nach ihrem Montag geordnet
 * und **ohne die, die nichts ändern**. Ein Wechsel auf das, was ohnehin gilt,
 * stünde sonst als „geplant" in den Einstellungen — und bliebe stehen, wenn
 * der davor entfernt wird.
 *
 * Ohne Wechsel fehlt `spaeter` ganz: So sieht eine Versammlung aus, die nie
 * einen hatte (`zeitenAus`), und so vergleicht `persist` sie mit dem Stand
 * davor (`geaenderteFelder`) — ein leeres Feld zählte dort als Änderung.
 */
function geordnet(grund: Regelzeit, wechsel: readonly ZeitWechsel[]): MeetingTime {
  const spaeter: ZeitWechsel[] = []
  let gilt: Regelzeit = grund
  for (const w of [...wechsel].sort((a, b) => a.ab.localeCompare(b.ab))) {
    if (gleich(w, gilt)) continue
    spaeter.push({ ab: w.ab, wd: w.wd, time: w.time })
    gilt = w
  }
  return spaeter.length > 0 ? { wd: grund.wd, time: grund.time, spaeter } : { wd: grund.wd, time: grund.time }
}

/**
 * **Ab der Woche mit dem Montag `ab` gilt `wert`.**
 *
 * Die Wochen davor behalten ihre Zeit — sie haben so stattgefunden, und die
 * Auswertung zählt sie an ihrem Tag. Das gilt auch für „ab dieser Woche": Die
 * Grundzeit bleibt, was sie war, der Wechsel steht am Montag der laufenden
 * Woche.
 *
 * Ein schon eingetragener Wechsel derselben Woche wird ersetzt. Spätere
 * bleiben stehen: Wer heute die Uhrzeit verschiebt, nimmt den für Januar
 * geplanten Tageswechsel nicht zurück — er steht weiter im Blatt und lässt
 * sich dort streichen.
 */
export function zeitAb(zeit: MeetingTime, ab: string, wert: Regelzeit): MeetingTime {
  const andere = (zeit.spaeter ?? []).filter((w) => w.ab !== ab)
  return geordnet(zeit, [...andere, { ab, wd: wert.wd, time: wert.time }])
}

/** Den Wechsel dieser Woche streichen — ab dort gilt wieder, was davor galt. */
export function ohneWechsel(zeit: MeetingTime, ab: string): MeetingTime {
  return geordnet(
    zeit,
    (zeit.spaeter ?? []).filter((w) => w.ab !== ab),
  )
}

/**
 * Die Wechsel, die noch bevorstehen: nach der laufenden Woche (`wirktAb()`).
 * Der Wechsel der laufenden Woche gilt schon — er ist die Zeit, die das Blatt
 * oben zeigt.
 */
export function kommendeWechsel(zeit: MeetingTime, laufendeWoche: string): readonly ZeitWechsel[] {
  return (zeit.spaeter ?? []).filter((w) => w.ab > laufendeWoche)
}
