import { isSong, istBlockSektion, splitOpeningSong } from '../data/helpers'
import type { HelperSlot, Meeting, PartItem, Section, Service } from '../data/types'

/** Ein Punkt, wie er dasteht — mit überschriebenem Titel, wenn das Lied herausgezogen ist. */
export interface AbschnittsZeile {
  item: PartItem
  title?: string
}

/**
 * **Was ein Abschnitt zeigt**: die Lieder für seinen Kopf und die Punkte
 * darunter — für den Bildschirm (`ZusammenkunftAnsicht`) und für die
 * Druckbögen, damit beide dieselben Zeilen aus denselben Daten machen.
 *
 * Die Lieder stehen rechts im Kopf: eigene Liedzeilen ebenso wie das Lied aus
 * dem Sammeltitel von Eröffnung und Abschluss („Lied 1 · Gebet · Einleitende
 * Worte"). Gefragt wird die **Art** des Abschnitts (`rawSection`, kanonisch),
 * nicht sein angezeigter Name.
 */
export function abschnittZeilen(
  section: Section,
  rawSection: Section | undefined,
  tpw: (s: string) => string,
): { lieder: string[]; zeilen: AbschnittsZeile[] } {
  const sammeltitel = rawSection ? istBlockSektion(rawSection) : false
  const lieder: string[] = []
  const zeilen: AbschnittsZeile[] = []
  for (const item of section.items) {
    if (isSong(item)) {
      lieder.push(tpw(item.song))
      continue
    }
    const { song, rest } = sammeltitel ? splitOpeningSong(tpw(item.title)) : { song: null, rest: '' }
    if (song) lieder.push(song)
    zeilen.push(song ? { item, title: rest } : { item })
  }
  return { lieder, zeilen }
}

/**
 * Die Plätze eines Dienstes, Platz für Platz — genau so weit, wie
 * `service.count` reicht; ein freier Platz ist `undefined`.
 *
 * Die gleiche Grenze, nach der `countOpenSlots`, `deriveMyTasks` und
 * `helperWorkload` rechnen. Reduziert der Planer die Platzzahl, bleiben die
 * Namen dahinter in den Wochendaten stehen; das Programmblatt nannte dann
 * jemanden, den die Aufgabenliste, die Auslastung und der Planen-Screen längst
 * nicht mehr kennen.
 */
export function plaetzeVon(helpers: Meeting['helpers'], service: Service): Array<HelperSlot | undefined> {
  return Array.from({ length: service.count }, (_unused, pos) => helpers[service.key]?.[pos])
}
