import { raeume, ratgeberSlot, slotsOf } from './aux-class'
import { isQualified, isSong, serviceQualKey } from './helpers'
import { istAbwesend, type AbsenceSet } from './absence'
import type { MeetingKey, Meeting, Person, Service } from './types'

/**
 * **Was an einem Tag gar nicht besetzbar ist.**
 *
 * Nicht zu verwechseln mit „offene Zuteilungen": Die sagen, was der Planer noch
 * nicht getan hat. Hier geht es um das, was er auch nicht tun *kann* — es sind
 * schlicht zu wenige Leute da. Beispiel des Betreibers: zehn Personen können
 * Mikrofone, drei Plätze sind zu besetzen, an dem Tag fehlen acht von den zehn.
 * Zwei können, einer bleibt offen. Ohne diesen Hinweis sucht der Planer den
 * Fehler bei sich oder bei der Auto-Zuteilung.
 *
 * **Die Zahl ist eine Untergrenze, keine Vorhersage.** Gezählt wird je Bereich
 * einzeln, und wer für zwei Bereiche qualifiziert ist, zählt in beiden mit —
 * obwohl er an dem Tag nur eine Aufgabe übernimmt. Der Engpass kann also
 * größer ausfallen als gemeldet, nie kleiner. Das ist die richtige Richtung:
 * Eine Warnung, die auch nur manchmal grundlos erscheint, wird weggeklickt und
 * dann auch dann übersehen, wenn sie stimmt.
 *
 * **Ohne Geschlechts-Sperre**, wie `isQualified` selbst: Welche Bereiche eine
 * Schwester übernimmt, entscheidet der Schalter an ihrer Person, nicht diese
 * Rechnung. Sonst zählte sie hier nicht mit und die Warnung erschiene grundlos.
 */
export interface Engpass {
  /** Bereichs-Schlüssel: fest (`gebet`) oder Hilfsdienst (`svc:mik`). */
  key: string
  /** Plätze dieser Art in dieser Zusammenkunft. */
  benoetigt: number
  /** Qualifiziert **und** an diesem Tag da. */
  verfuegbar: number
  /** Qualifiziert insgesamt — für „8 von 10 fehlen". */
  qualifiziert: number
}

/**
 * Plätze je Bereich in einer Zusammenkunft — über **alle vier Platzsorten**
 * (Hauptsaal, Zusätzliche Klasse, Ratgeber, Hilfsdienste; siehe
 * `alle-plaetze.test.ts`).
 *
 * Gezählt werden **alle** Plätze, nicht nur die offenen: Die Frage ist, ob die
 * Versammlung an dem Tag genug Leute *hat*, nicht wie weit der Planer ist. Ein
 * schon besetzter Platz ändert daran nichts — er ist ja mit einer der
 * verfügbaren Personen besetzt.
 *
 * Gruppen-Dienste (Reinigung) bleiben draußen: Sie rotieren über
 * Predigtdienstgruppen, nicht über Personen, und kennen keine Qualifikation.
 */
export function bedarfJeBereich(meeting: Meeting, services: readonly Service[]): Map<string, number> {
  const out = new Map<string, number>()
  const zaehl = (key: string | undefined): void => {
    if (!key) return
    out.set(key, (out.get(key) ?? 0) + 1)
  }

  for (const section of meeting.sections) {
    for (const item of section.items) {
      if (isSong(item)) continue
      for (const aux of raeume(meeting)) {
        for (const slot of slotsOf(item, aux)) zaehl(slot.bereichsKey)
      }
    }
  }
  // Der Ratgeber ist ein eigener Platz je Zusammenkunft — aber nur, wenn die
  // Zusätzliche Klasse überhaupt läuft (wie `countOpenSlots` es prüft).
  if (meeting.auxRatgeber) zaehl(ratgeberSlot(meeting).bereichsKey)

  for (const svc of services) {
    if (svc.groups) continue
    for (let i = 0; i < svc.count; i++) zaehl(serviceQualKey(svc.key))
  }
  return out
}

/**
 * Die Bereiche, in denen an diesem Tag weniger Leute verfügbar sind als Plätze
 * zu besetzen — absteigend nach Größe der Lücke. Reine Funktion.
 *
 * `wi`/`tab` bestimmen den Tag: Abwesenheit gilt **taggenau**, nicht je Woche
 * (`istAbwesend`). Deshalb kann der Dienstag knapp sein und der Sonntag nicht.
 */
export function engpaesse(
  meeting: Meeting,
  services: readonly Service[],
  persons: readonly Person[],
  abwesend: AbsenceSet,
  wi: number,
  tab: MeetingKey,
): Engpass[] {
  const out: Engpass[] = []
  for (const [key, benoetigt] of bedarfJeBereich(meeting, services)) {
    const qualifizierte = persons.filter((p) => isQualified(p, key))
    const verfuegbar = qualifizierte.filter((p) => !istAbwesend(abwesend, p.id, wi, tab)).length
    if (verfuegbar >= benoetigt) continue
    out.push({ key, benoetigt, verfuegbar, qualifiziert: qualifizierte.length })
  }
  return out.sort((a, b) => b.benoetigt - b.verfuegbar - (a.benoetigt - a.verfuegbar))
}

/** Wie viele Plätze zusammen offen bleiben müssen. */
export function offenTrotzAllem(liste: readonly Engpass[]): number {
  return liste.reduce((n, e) => n + (e.benoetigt - e.verfuegbar), 0)
}
