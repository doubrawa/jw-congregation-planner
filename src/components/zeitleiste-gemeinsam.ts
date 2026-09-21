import type { Lang } from '../data/types'
import { LOCALES } from '../i18n/langs'

/**
 * **Was beide Zeitleisten gemeinsam rechnen.**
 *
 * Die Leiste gibt es zweimal: im Personen-Detail (alle Einträge einer Person)
 * und auf dem Start (die eigenen Aufgaben der nächsten zwei Wochen). Sie holen
 * ihre Einträge aus verschiedenen Quellen — `personTimeline` aus den Wochen,
 * `dashTimeline` aus `state.myTasks` —, aber sie fassen Abwesenheiten gleich:
 * zwei Ränder, eine eingefärbte Strecke dazwischen, und dieselbe Schreibweise
 * des Datums. Das stand eine Zeit lang Zeichen für Zeichen zweimal da.
 */

/** Welches Ende eines Abwesenheits-Zeitraums eine Zeile ist. */
export type AbwRand = 'start' | 'ende' | 'einzel'

/**
 * Die Ränder eines Zeitraums: zwei Punkte, oder einer bei einem einzelnen Tag.
 * Der letzte Tag gehört noch dazu (`istAbwesendAm` prüft `von <= tag <= bis`).
 */
export function abwesenheitsRaender(von: string, bis: string): AbwRand[] {
  return von === bis ? ['einzel'] : ['start', 'ende']
}

/**
 * Rang innerhalb **eines** Tages: Der Beginn steht vor den Aufgaben dieses
 * Tages, das Ende dahinter. Sonst liefe die Färbung an einer Zuteilung vorbei,
 * die sehr wohl in den Zeitraum fällt. `null` = keine Abwesenheit.
 */
export function abwRang(rand: AbwRand | null): number {
  if (rand === null) return 0
  return rand === 'ende' ? 1 : -1
}

/** Eine Zeile, die sagen kann, ob über und unter ihr eine Abwesenheit läuft. */
export interface BandZeile {
  abwOben?: boolean
  abwUnten?: boolean
}

/**
 * Färbt die Strecken zwischen Beginn und Ende: Jede Zeile bekommt gesagt, ob
 * ober- bzw. unterhalb ihres Punktes gerade eine Abwesenheit läuft.
 *
 * Ein Durchlauf mit Zähler statt eines Vergleichs je Paar — so tragen auch
 * **überlappende** Zeiträume (zwei offene gleichzeitig) durchgehend, statt sich
 * gegenseitig wieder auszuschalten. Verändert die Zeilen an Ort und Stelle; die
 * Aufrufer haben sie gerade erst gebaut.
 *
 * Die Liste muss dafür **vollständig** sein: Wer erst beschneidet und dann
 * färbt, verliert den Beginn eines Zeitraums, der vor dem Ausschnitt liegt, und
 * mit ihm die Strecke.
 */
export function markiereAbwesenheiten<T extends BandZeile>(
  zeilen: T[],
  randVon: (zeile: T) => AbwRand | null,
): T[] {
  let offen = 0
  for (const zeile of zeilen) {
    const vorher = offen
    const rand = randVon(zeile)
    if (rand === 'start') offen++
    else if (rand === 'ende') offen--
    zeile.abwOben = vorher > 0
    zeile.abwUnten = offen > 0
  }
  return zeilen
}

/**
 * Die Datumszeile einer Leiste: Wochentag, Tag und Monat in der Sprache des
 * Lesers, dazu die Uhrzeit, sofern es eine gibt („Dienstag, 8. September ·
 * 19:00"). Eine Abwesenheit hat keine.
 */
export function zeitleisteDatum(datum: Date, lang: Lang, zeit = ''): string {
  const tag = datum.toLocaleDateString(LOCALES[lang], {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
  return zeit ? `${tag} · ${zeit}` : tag
}

/**
 * Die Beschriftung einer Abwesenheit. Beide Ränder tragen dieselbe — erst die
 * Strecke dazwischen macht daraus einen Zeitraum.
 */
export function abwesenheitsArt(grund: string, abwesendChip: string): string {
  return grund ? `${abwesendChip} · ${grund}` : abwesendChip
}
