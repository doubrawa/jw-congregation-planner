import { herkunftVon, isSong, istBlockSektion, liedImKopf, ROLE_GUEST_SPEAKER, rolleBasis, splitOpeningSong } from '../data/helpers'
import type { HelperSlot, Meeting, PartItem, Section, Service, SlotAssignment } from '../data/types'

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
 * nicht sein angezeigter Name. Eine Liedzeile steht dort nur mit ihrer Nummer,
 * ohne Liedthema (`liedImKopf`).
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
      lieder.push(tpw(liedImKopf(item.song)))
      continue
    }
    const { song, rest } = sammeltitel ? splitOpeningSong(tpw(item.title)) : { song: null, rest: '' }
    if (song) lieder.push(song)
    zeilen.push(song ? { item, title: rest } : { item })
  }
  return { lieder, zeilen }
}

/**
 * **Was neben dem Namen steht**: die Aufgabe in der Sprache des Lesers — beim
 * Gastredner seine Versammlung, wenn sie eingetragen ist (Betreiber am
 * 21.10.2026: „einfach den versammlungsnamen, wenn es einen gibt"). Für den
 * Bildschirm und den Wochenbogen, damit beide dasselbe zeigen.
 *
 * Die Versammlung nur bei einem **eingetragenen** Gastredner: Ein freier Platz
 * hat keinen Redner, der von irgendwo käme, und beim eigenen Redner wie beim
 * Kreisaufseher sagt die Aufgabe mehr. Bis zum 21.10.2026 blieb die Versammlung
 * eines Gastredners nach „Entfernen" am leeren Platz stehen und nach der Wahl
 * eines eigenen Redners an dessen Platz (im Betrieb am selben Tag gezählt: kein
 * solcher Platz); am Platz des Kreisaufsehers nimmt das Blatt sie bis heute an.
 *
 * Sie geht nicht durch den Übersetzer: Ein Ortsname ist kein Programmbegriff.
 */
export function rolleNebenDemNamen(slot: SlotAssignment, tu: (s: string) => string): string | undefined {
  const versammlung = herkunftVon(slot)
  if (slot.name && versammlung && rolleBasis(slot.rolle) === ROLE_GUEST_SPEAKER) return versammlung
  return slot.rolle ? tu(slot.rolle) : undefined
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
