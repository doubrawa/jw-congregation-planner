import { mitAbstand } from '../aufgaben/aufgabe-anzeige'
import { gebundenesDatum, kopfzeilenTag } from '../components/datum-anzeige'
import type { Lang } from '../data/types'
import type { Dict } from '../i18n/ui'
import { fill } from '../i18n/useT'
import { relativeZeit } from '../i18n/zeit'

/**
 * **Was das Handy im Film zeigt** (22.10.2026): die Ansichten der App mit den
 * Daten dessen, der den Film sieht — sein Vorname im Gruß und in der E-Mail,
 * seine Versammlung im Kopf, heute als Datum, morgen als Termin. Alles in der
 * Sprache der App: Der Film ist keine Aufnahme, er wird in jeder Sprache neu
 * gezeichnet. Die Aufgabe ist eine Bibellesung, weil ihr Name im Wörterbuch
 * steht (`privBibellesung`) — ein Programmpunkt aus dem Arbeitsheft stünde nur
 * in der Sprache der Versammlung da.
 */
export interface FilmInhalt {
  /** „Montag, 7. September" — wie in der Kopfzeile. */
  kopfDatum: string
  /** „Versammlung Krumbach" — wie in der Kopfzeile. */
  kopfVersammlung: string
  /** „Guten Morgen, Simon" */
  gruss: string
  /** „Morgen · Dienstag, 8. September · 19:00" */
  wann: string
  /** „Bibellesung · Dienstag, 8. September" — die Aufgabe in der Mitteilung. */
  aufgabeZeile: string
  /** „vor 12 Minuten" */
  vorKurzem: string
  /** Die Tage der zwei Zeilen unter der großen Karte. */
  zeilen: readonly string[]
  /** Der Anfang der Nachricht mit dem Anmelde-Link, bis zum Link. */
  nachrichtText: string
}

/** Der Platz eines Namens, wenn das Konto keine Person hat. */
const OHNE_NAMEN = '…'

/**
 * Die Uhrzeit der Aufgabe, wie das Programm sie schreibt: Die Karte zeigt sie
 * in jeder Sprache so (`aufgabeWann`), auch dort, wo `Intl` „07:00 PM" sagte.
 */
const UHRZEIT = '19:00'

export function filmInhalt(
  { t, lang, vorname, versammlung }: { t: Dict; lang: Lang; vorname: string; versammlung: string },
  jetzt: Date,
): FilmInhalt {
  const name = vorname.trim() || OHNE_NAMEN
  const tag = (abstand: number) => new Date(jetzt.getFullYear(), jetzt.getMonth(), jetzt.getDate() + abstand)
  const morgen = tag(1)
  const stunde = jetzt.getHours()
  const gruss = stunde < 11 ? t.grussMorgen : stunde < 18 ? t.grussTag : t.grussAbend
  const datum = gebundenesDatum(morgen, lang, 'tag')
  // Ein Kalendertag als UTC-Mitternacht, wie `MyTask.at`.
  const morgenAt = Date.UTC(morgen.getFullYear(), morgen.getMonth(), morgen.getDate())
  // Die Nachricht bis zum Link — dahinter steht der Link selbst, auf den getippt wird.
  const [vorDemLink = ''] = t.linkNachrichtText.split('{url}')
  return {
    kopfDatum: kopfzeilenTag(jetzt, lang),
    kopfVersammlung: versammlung ? fill(t.congLabel, { name: versammlung }) : 'Versammlung.app',
    gruss: `${gruss}, ${name}`,
    wann: mitAbstand(`${datum} · ${UHRZEIT}`, morgenAt, lang, jetzt.getTime()),
    aufgabeZeile: `${t.privBibellesung} · ${datum}`,
    vorKurzem: relativeZeit(new Date(jetzt.getTime() - 12 * 60_000).toISOString(), lang, jetzt.getTime()),
    zeilen: [5, 12].map((n) => gebundenesDatum(tag(n), lang, 'wochentagZahl')),
    nachrichtText: fill(vorDemLink, { name, versammlung: versammlung || 'Versammlung.app' }).trimEnd(),
  }
}
