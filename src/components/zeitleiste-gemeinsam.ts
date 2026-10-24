import type { Lang } from '../data/types'
import { gebundenesDatum } from './datum-anzeige'

/**
 * **Wie die Zeitleiste einer Person Abwesenheiten fasst** — zwei Ränder, eine
 * eingefärbte Strecke dazwischen — und wie sie das Datum schreibt.
 *
 * Bis zur Phase 3a gab es die Leiste zweimal (auch auf dem Start, aus
 * `state.myTasks`); daher der eigene Ort. Seit dem 23.10.2026 stehen ihre
 * Einträge **die neuesten zuerst**, und `abwRang` und `markiereAbwesenheiten`
 * rechnen genau damit: Eine aufsteigende Liste färbten sie falsch.
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
 * Rang innerhalb **eines** Tages, die neuesten zuerst (seit 23.10.2026): Von
 * oben gelesen steht das Ende vor den Aufgaben dieses Tages, der Beginn
 * dahinter. Sonst liefe die Färbung an einer Zuteilung vorbei, die sehr wohl in
 * den Zeitraum fällt. Ein einzelner Tag hat keine Strecke; er steht wie vor
 * der Umstellung über den Aufgaben seines Tages. `null` = keine Abwesenheit.
 */
export function abwRang(rand: AbwRand | null): number {
  if (rand === null) return 0
  return rand === 'start' ? 1 : -1
}

/** Eine Zeile, die sagen kann, ob über und unter ihr eine Abwesenheit läuft. */
export interface BandZeile {
  abwOben?: boolean
  abwUnten?: boolean
}

/**
 * Färbt die Strecken zwischen Ende und Beginn: Jede Zeile bekommt gesagt, ob
 * ober- bzw. unterhalb ihres Punktes gerade eine Abwesenheit läuft. Die Zeilen
 * stehen wie in der Leiste, die neuesten zuerst — von oben gelesen öffnet das
 * Ende eine Strecke, der Beginn schließt sie.
 *
 * Ein Durchlauf mit Zähler statt eines Vergleichs je Paar — so tragen auch
 * **überlappende** Zeiträume (zwei offene gleichzeitig) durchgehend, statt sich
 * gegenseitig wieder auszuschalten. Verändert die Zeilen an Ort und Stelle; die
 * Aufrufer haben sie gerade erst gebaut.
 *
 * Die Liste muss dafür **vollständig** sein: Wer erst beschneidet und dann
 * färbt, verliert das Ende eines Zeitraums, das über dem Ausschnitt liegt, und
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
    if (rand === 'ende') offen++
    else if (rand === 'start') offen--
    zeile.abwOben = vorher > 0
    zeile.abwUnten = offen > 0
  }
  return zeilen
}

/**
 * Die Datumszeile einer Leiste: Wochentag, Tag und Monat in der Sprache des
 * Lesers, dazu die Uhrzeit, sofern es eine gibt („Dienstag, 8. September ·
 * 19:00"). Eine Abwesenheit hat keine. Tag und Monat bleiben zusammen (T128:
 * „воскресенье, 20 |сентября" bei 320 px und Stufe 1,3).
 */
export function zeitleisteDatum(datum: Date, lang: Lang, zeit = ''): string {
  const tag = gebundenesDatum(datum, lang, 'tag')
  return zeit ? `${tag} · ${zeit}` : tag
}

/**
 * Die Beschriftung einer Abwesenheit. Beide Ränder tragen dieselbe — erst die
 * Strecke dazwischen macht daraus einen Zeitraum.
 */
export function abwesenheitsArt(grund: string, abwesendChip: string): string {
  return grund ? `${abwesendChip} · ${grund}` : abwesendChip
}
