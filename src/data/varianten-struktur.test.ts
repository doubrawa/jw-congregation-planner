import { describe, expect, it } from 'vitest'
import {
  editTalkTheme,
  lacAdd,
  lacRemove,
  setDienstwoche,
  setOpeningSong,
  setPartThema,
} from './meeting-edit'
import { localizedWeek } from './localize'
import { buildImportWeek } from './testdaten'
import { isSong, istArt } from './helpers'
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

describe('Ein ausgetauschter Titel zählt ebenfalls als Umbau', () => {
  /**
   * `umbauMerken` nennt in seinem Kopf ausdrücklich „ein ausgetauschter Titel" —
   * gerufen wurde es aber nur beim Anlegen, Löschen, Verschieben und in der
   * Kreisaufseher-Woche. Die beiden Stellen, an denen der Planer **eigenen
   * Text** einträgt, fehlten: das Thema eines Schülerteils und das
   * Vortragsthema.
   *
   * Beides sind Sätze, die es auf jw.org nicht gibt. Eine Variante, die
   * Monate später nachkommt, bringt an derselben Stelle den Vorlagentitel mit
   * und legte ihn darüber — der Zugeteilte bereitete etwas vor, das nicht auf
   * dem Programm steht.
   */
  const LAC_ABSCHNITT = 3

  it('das Thema eines Punkts überlebt eine nachgeholte Variante', () => {
    const woche = buildImportWeek()
    const punkt = woche.mid.sections[LAC_ABSCHNITT]!.items[1]!
    const begriff = isSong(punkt) ? '' : punkt.title
    const nachher = setPartThema([woche], 0, 'mid', LAC_ABSCHNITT, 1, begriff, 'Eigenes Thema')[0]!
    expect(nachher.mid.umgebaut, 'keine Umbau-Marke gesetzt').toBe(true)

    nachher.alt = { en: alsVariante(woche) }
    const gezeigt = localizedWeek(nachher, 'en')
    expect(titel(gezeigt.mid, LAC_ABSCHNITT)).toEqual(titel(nachher.mid, LAC_ABSCHNITT))
  })

  it('… und das Vortragsthema ebenso', () => {
    const woche = buildImportWeek()
    const si = woche.we.sections.findIndex((s) => istArt(s, 'vortrag'))
    const nachher = editTalkTheme([woche], 0, si, 0, 'Mein Vortragsthema')[0]!
    expect(nachher.we.umgebaut, 'keine Umbau-Marke gesetzt').toBe(true)

    nachher.alt = { en: alsVariante(woche) }
    const gezeigt = localizedWeek(nachher, 'en')
    expect(titel(gezeigt.we, si)).toEqual(titel(nachher.we, si))
  })

  it('Lieder bleiben ausgenommen — sie stehen, wo sie standen', () => {
    // Gegenprobe: Die Marke darf nicht bei jeder Änderung fallen, sonst wäre
    // die Übersetzung nach dem ersten Lied für immer aus.
    const woche = buildImportWeek()
    const nachher = setOpeningSong([woche], 0, '78')[0]!
    expect(nachher.we.umgebaut).toBeUndefined()
  })
})

/**
 * **Wer künftig einen Titel austauscht, muss die Marke mitsetzen.**
 *
 * Der Kopf von `umbauMerken` sagt es, aber gelesen wird ein Kommentar erst,
 * wenn man ihn sucht. Hier wird der Quelltext selbst gefragt: Jede exportierte
 * Funktion dieser Datei, die einen `title` schreibt oder Punkte umsortiert,
 * braucht ein `umbauMerken`.
 *
 * Ausgenommen ist allein `setSong` — Liednummern stehen an derselben Stelle wie
 * vorher, eine nachgeholte Variante passt dort weiterhin (siehe den Kopf von
 * `umbauMerken`). Steht hier je eine zweite Ausnahme, gehört sie begründet.
 */
describe('Jede Ablauf-Änderung merkt den Umbau', () => {
  const QUELLE = import.meta.glob('./meeting-edit.ts', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>

  const AUSGENOMMEN = new Set(['setSong'])

  it('keine Titel- oder Reihenfolge-Änderung ohne umbauMerken', () => {
    const quelle = String(Object.values(QUELLE)[0] ?? '')
    // Bei jeder Funktionsdefinition auf Spaltenebene 0 aufteilen; das erste
    // Stück davor ist der Dateikopf.
    const stuecke = quelle.split(/\n(?=(?:export )?function )/)
    expect(stuecke.length, 'keine Funktionen gefunden — der Test misst nichts').toBeGreaterThan(10)

    const fehlend: string[] = []
    for (const stueck of stuecke) {
      const name = /^(?:export )?function (\w+)/.exec(stueck)?.[1]
      if (!name || AUSGENOMMEN.has(name)) continue
      const aendertAblauf =
        /\.title = /.test(stueck) || /\.items\.splice\(/.test(stueck) || /swapKeepNums\(/.test(stueck)
      if (aendertAblauf && !stueck.includes('umbauMerken(')) fehlend.push(name)
    }
    // `swapKeepNums` selbst ist die Hilfsfunktion, nicht ihr Aufrufer.
    expect(fehlend.filter((n) => n !== 'swapKeepNums'), 'ohne umbauMerken').toEqual([])
  })
})
