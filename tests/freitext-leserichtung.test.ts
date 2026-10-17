import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { quelldateien, WURZEL } from './quelldateien'

/**
 * **Jedes Freitextfeld sagt, in welche Richtung es gelesen wird.**
 *
 * Zwei der App-Sprachen laufen von rechts nach links, und getippt werden kann
 * in jeder Schrift — die Versammlungssprache ist frei. Ein Feld ohne
 * `dir="auto"` zeigt arabischen oder hebräischen Text linksbündig und schiebt
 * die Satzzeichen ans falsche Ende — der Browser richtet sich sonst nach der
 * Seite, nicht nach dem, was der Nutzer tippt.
 *
 * Gesetzt wurde das Attribut einmal von Hand über alle Felder, und dabei fielen
 * zwei durch: die **Suchfelder** der Sprachauswahl und der Dienst-Freigabe.
 * Ausgerechnet die Sprachauswahl ist der erste Bildschirm, den ein Leser
 * erreicht, der die App noch nicht in seiner Sprache hat.
 *
 * Genau deshalb steht die Regel hier und nicht in einer Liste: Eine Aufzählung,
 * in die sich jedes neue Feld selbst eintragen muss, ist in diesem Projekt
 * schon mehrfach auseinandergelaufen. Gefragt wird der Quelltext.
 *
 * **Ausgenommen sind Felder, die gar keinen Freitext aufnehmen** — und auch das
 * nicht als Namensliste, sondern an dem, was im Feld selbst steht: `inputMode`
 * `numeric` (die Liednummer) und `autoCapitalize="characters"` (der
 * Einladungscode aus A–Z und Ziffern). Beides sind Zeichen ohne eigene
 * Leserichtung; `dir="auto"` hätte dort nichts zu entscheiden.
 */

/** Ein Baustein, gelesen — `datei` relativ zur Wurzel (`src/…`). */
const lies = (datei: string): string => readFileSync(join(WURZEL, datei), 'utf8')

/**
 * Das Attribut-Stück eines `<input …>` ab `type="text"` bis zum schließenden
 * `/>`. Genügt hier: Die Bausteine schreiben ein Attribut je Zeile.
 */
function textFelder(quelle: string): string[] {
  return [...quelle.matchAll(/<input\b[\s\S]*?\/>/g)]
    .map((m) => m[0])
    .filter((feld) => /type="text"/.test(feld))
}

describe('Freitextfelder tragen dir="auto"', () => {
  // Alle .tsx-Dateien unter src, ohne Prüfstände.
  const dateien = quelldateien({ orte: ['src'], endungen: ['.tsx'], ohneTests: true })

  it('der Prüfstand findet überhaupt Felder', () => {
    // Ohne diese Zeile wäre alles darunter grün, sobald das Muster nicht mehr
    // greift — und niemand merkte, dass nichts mehr gemessen wird.
    const alle = dateien.flatMap((d) => textFelder(lies(d)))
    expect(alle.length, 'keine Textfelder gefunden').toBeGreaterThan(10)
  })

  it('keines ohne Leserichtung — außer Zahl- und Code-Feldern', () => {
    const ohne: string[] = []
    for (const datei of dateien) {
      const kurz = datei.slice('src/'.length)
      for (const feld of textFelder(lies(datei))) {
        const ohneFreitext =
          /inputMode="numeric"/.test(feld) || /autoCapitalize="characters"/.test(feld)
        if (ohneFreitext || /dir="auto"/.test(feld)) continue
        // Die Beschriftung mitgeben: Sie sagt, um welches Feld es geht.
        const label = /aria-label=\{([^}]+)\}/.exec(feld)?.[1] ?? '?'
        ohne.push(`${kurz} (${label})`)
      }
    }
    expect(ohne, 'Textfelder ohne dir="auto"').toEqual([])
  })
})
