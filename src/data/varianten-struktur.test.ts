import { describe, expect, it } from 'vitest'
import { lacAdd, lacRemove, setDienstwoche } from './meeting-edit'
import { localizedWeek } from './localize'
import { buildImportWeek } from './testdaten'
import { isSong } from './helpers'
import type { Meeting, PartItem, Week } from './types'

/**
 * **Eine nachgeholte Sprachvariante darf keine fremden Titel aufsetzen.**
 *
 * Wird eine Programmsprache erst **nach** dem Import einer Woche hinzugefügt,
 * holt `ImportPanel` die fehlende Variante nach (`missingVariants` →
 * `mergeWeekAlt`). Die kommt frisch von jw.org und weiß nichts von dem, was der
 * Planer inzwischen an der Woche geändert hat.
 *
 * `mergeMeeting` kennt die Gefahr und wehrt sie ab — aber nur über die
 * **Anzahl** der Punkte. Genau eine gewöhnliche Handlung hebt sie wieder auf:
 * einen Punkt löschen und einen eigenen anlegen. Dann stimmt die Zahl wieder,
 * die Punkte sind aber andere.
 */

/** Die Titel eines Abschnitts, in der Reihenfolge. */
function titel(meeting: Meeting, si: number): string[] {
  return (meeting.sections[si]?.items ?? []).map((it) => (isSong(it) ? it.song : it.title))
}

/**
 * Die Woche noch einmal als Sprachvariante — strukturgleich, Titel erkennbar
 * anders. So kommt sie von jw.org: dieselbe Wochenseite in einer anderen
 * Sprache, ohne Zuteilungen (`stripVariant` im Import).
 */
function alsVariante(week: Week): Week {
  const kopie = structuredClone(week)
  for (const tab of ['mid', 'we'] as const) {
    for (const section of kopie[tab].sections) {
      for (const it of section.items) {
        if (isSong(it)) it.song = `${it.song} [en]`
        else {
          it.title = `${it.title} [en]`
          it.names = []
        }
      }
    }
    kopie[tab].helpers = {}
  }
  return kopie
}

describe('Nachgeholte Sprachvariante einer bearbeiteten Woche', () => {
  /** Index des Abschnitts „Unser Leben als Christ" (dort wird bearbeitet). */
  const LAC = 3

  it('bei abweichender Anzahl bleibt die Zusammenkunft kanonisch', () => {
    const woche = buildImportWeek()
    // Der Planer löscht einen Punkt; die Variante kommt erst danach.
    const nachher = lacRemove([woche], 0, 'mid', LAC, 1)[0]!
    nachher.alt = { en: alsVariante(woche) }

    const gezeigt = localizedWeek(nachher, 'en')
    expect(titel(gezeigt.mid, LAC)).toEqual(titel(nachher.mid, LAC))
  })

  it('… und ebenso, wenn ein Punkt gelöscht und ein eigener angelegt wurde', () => {
    const woche = buildImportWeek()
    const eins = lacRemove([woche], 0, 'mid', LAC, 1)[0]!
    const nachher = lacAdd([eins], 0, 'mid', LAC, 'Eigener Punkt')[0]!
    // Die Zahl stimmt wieder — nur sind es andere Punkte.
    expect(nachher.mid.sections[LAC]!.items.length).toBe(
      woche.mid.sections[LAC]!.items.length,
    )
    nachher.alt = { en: alsVariante(woche) }

    const gezeigt = localizedWeek(nachher, 'en')
    const eigen = nachher.mid.sections[LAC]!.items.find(
      (it) => !isSong(it) && (it as PartItem).title === 'Eigener Punkt',
    )
    expect(eigen, 'der eigene Punkt fehlt — Testaufbau falsch').toBeDefined()

    /*
     * Der eigene Punkt darf unter keinen Umständen den Titel eines fremden
     * bekommen: Wer ihn zugeteilt bekommen hat, bereitete sonst das Falsche vor
     * — und in der Sprache, in der er liest, stünde ein Programm, das es gar
     * nicht gibt.
     */
    expect(titel(gezeigt.mid, LAC)).toEqual(titel(nachher.mid, LAC))
  })

  it('… und ebenso in der Kreisaufseher-Woche (Dienstvortrag statt Bibelstudium)', () => {
    /*
      Derselbe Fall ohne jedes Zutun des Planers am Ablauf: `setDienstwoche`
      **tauscht** den Titel des Bibelstudiums gegen den Dienstvortrag aus. Die
      Anzahl der Punkte ändert sich dabei nicht — eine nachgeholte Variante
      schriebe also „Congregation Bible Study" über den Dienstvortrag des
      Kreisaufsehers.
    */
    const woche = buildImportWeek()
    const nachher = setDienstwoche([woche], 0, true)[0]!
    expect(nachher.mid.sections[LAC]!.items.length).toBe(woche.mid.sections[LAC]!.items.length)
    nachher.alt = { en: alsVariante(woche) }

    const gezeigt = localizedWeek(nachher, 'en')
    expect(titel(gezeigt.mid, LAC)).toEqual(titel(nachher.mid, LAC))
  })

  it('eine mitgewachsene Variante wird weiterhin übernommen', () => {
    // Gegenprobe: Die Absicherung darf die Übersetzung nicht überhaupt
    // abschalten. War die Variante schon da, als der Punkt angelegt wurde,
    // hat `lacAdd` sie mitgezogen — dann gilt sie.
    const woche = buildImportWeek()
    woche.alt = { en: alsVariante(woche) }
    const nachher = lacAdd([woche], 0, 'mid', LAC, 'Eigener Punkt')[0]!

    const gezeigt = localizedWeek(nachher, 'en')
    expect(titel(gezeigt.mid, 1)).toEqual(titel(nachher.alt!.en!.mid, 1))
  })
})
