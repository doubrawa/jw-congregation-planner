import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { quelldateien, WURZEL } from './quelldateien'

/**
 * **Kein Rechte-Entscheid an `rechteVon` vorbei** (T124).
 *
 * Die befristete Ansicht — der Admin sieht die App mit den Rechten einer
 * anderen Stufe — legt sich in `rechteVon` über die echten Rechte. Sie wirkt
 * deshalb nur, wo die App über `rechteVon` fragt. Wer `planner` oder
 * `zuteiler` selbst liest, entscheidet daran vorbei: So bot
 * `darfAbwesenheitBearbeiten` in der Ansicht als Verkündiger die Abwesenheiten
 * anderer weiter zum Bearbeiten an, bis es über `rechteVon` fragte.
 *
 * Und es geht über die Ansicht hinaus: Zwei Fassungen derselben Frage laufen
 * auseinander, sobald eine sich ändert — das Muster, an dem dieses Projekt am
 * häufigsten Fehler fand.
 *
 * Erlaubt sind die Stellen, die das **echte** Recht brauchen oder befördern:
 * `rechte.ts` selbst, der Reducer (Laden und die Wache von `setAnsicht`),
 * `lib/data.ts` (Mitglieder lesen und schreiben) und der Schalter samt Leiste —
 * sie fragen am echten Recht, sonst gäbe es aus „Verkündiger" kein Zurück.
 */

const ERLAUBT = new Set([
  'src/data/rechte.ts',
  'src/app/reducer.ts',
  'src/lib/data.ts',
  'src/app/AnsichtLeiste.tsx',
  'src/profil/AnsichtKarte.tsx',
])

/** Ein Lesen des Rechts als Eigenschaft — `state.planner`, `m.zuteiler`, `{ planner } = state`. */
const LESEN = [/\.(planner|zuteiler)\b/, /\{[^}]*\b(planner|zuteiler)\b[^}]*\}\s*=\s*\w/]

/** Kommentarzeilen zählen nicht — dort darf vom Recht die Rede sein. */
const kommentar = (zeile: string): boolean => /^\s*(\*|\/\/|\/\*)/.test(zeile)

describe('Rechte-Entscheide fragen rechteVon', () => {
  it('niemand liest planner oder zuteiler selbst — außer den erlaubten Stellen', () => {
    const funde: string[] = []
    // Jede Quelldatei der App unter `src`, ohne Tests.
    for (const datei of quelldateien({ orte: ['src'], endungen: ['.ts', '.tsx'], ohneTests: true })) {
      if (ERLAUBT.has(datei)) continue
      readFileSync(join(WURZEL, datei), 'utf8')
        .split('\n')
        .forEach((zeile, i) => {
          if (!kommentar(zeile) && LESEN.some((m) => m.test(zeile))) funde.push(`${datei}:${i + 1}: ${zeile.trim()}`)
        })
    }
    expect(funde).toEqual([])
  })

  it('die Probe findet ein Lesen, wo es steht', () => {
    // Gegenprobe: Sie liest die erlaubten Dateien, die das Recht wirklich lesen.
    const gelesen = [...ERLAUBT].filter((datei) =>
      readFileSync(join(WURZEL, datei), 'utf8')
        .split('\n')
        .some((zeile) => !kommentar(zeile) && LESEN.some((m) => m.test(zeile))),
    )
    expect(gelesen).toEqual([...ERLAUBT])
  })
})
