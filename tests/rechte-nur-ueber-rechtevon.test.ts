import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { kommentarZeile, quelldateien, WURZEL } from './quelldateien'

/**
 * **Kein Rechte-Entscheid an `rechteVon` vorbei** (T124).
 *
 * Die befristete Ansicht — der Admin sieht die App mit den Rechten einer
 * anderen Stufe — legt sich in `rechteVon` über die echten Rechte. Sie wirkt
 * deshalb nur, wo die App über `rechteVon` fragt. Wer `admin` oder
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
 * `lib/daten/laden.ts` und `lib/daten/konto.ts` (Mitglieder lesen und
 * schreiben), `aktiveAnsicht` in `ansicht.ts` (für `rechteVon`, `rechteStufe`
 * und die Leiste) und der Schalter — sie fragen am echten Recht, sonst gäbe es
 * aus „Verkündiger" kein Zurück.
 */

const ERLAUBT = new Set([
  'src/data/rechte.ts',
  'src/data/ansicht.ts',
  'src/app/aktionen/ansicht.ts',
  'src/app/aktionen/sitzung.ts',
  'src/lib/daten/konto.ts',
  'src/lib/daten/laden.ts',
  'src/profil/AnsichtKarte.tsx',
])

/**
 * Ein Lesen des Rechts als Eigenschaft — `state.admin`, `m.zuteiler`,
 * `{ admin } = state`.
 *
 * `admin` heißt seit E4 (8.11.2026) auch, was `rechteVon` liefert — und dort zu
 * lesen ist gerade der erlaubte Weg: `rechteVon(state).admin`, `rechte.admin`,
 * `{ admin } = rechteDerPerson(…)`. Davor stand `planner`, ein Name, den nur
 * das echte Recht trug.
 */
const LESEN = [/\.zuteiler\b/, /(?<!\brechte|\brechteVon\([^()]*\))\.admin\b/, /\{[^}]*\b(admin|zuteiler)\b[^}]*\}\s*=\s*(?!rechte)\w/]

/** Kommentarzeilen zählen nicht — dort darf vom Recht die Rede sein. */
const liest = (zeile: string): boolean => !kommentarZeile(zeile) && LESEN.some((m) => m.test(zeile))

describe('Rechte-Entscheide fragen rechteVon', () => {
  it('niemand liest admin oder zuteiler selbst — außer den erlaubten Stellen', () => {
    const funde: string[] = []
    // Jede Quelldatei der App unter `src`, ohne Tests.
    for (const datei of quelldateien({ orte: ['src'], endungen: ['.ts', '.tsx'], ohneTests: true })) {
      if (ERLAUBT.has(datei)) continue
      readFileSync(join(WURZEL, datei), 'utf8')
        .split('\n')
        .forEach((zeile, i) => {
          if (liest(zeile)) funde.push(`${datei}:${i + 1}: ${zeile.trim()}`)
        })
    }
    expect(funde).toEqual([])
  })

  it('sie trennt das echte Recht vom abgeleiteten, das ebenfalls admin heißt', () => {
    const echt = [
      'if (!state.admin) return state',
      'const { admin } = state',
      'konten.some((m) => m.admin)',
      's.zuteiler || x',
      // Über ein Aufrufergebnis ist es ebenso das echte Recht — nur `rechteVon` leitet ab.
      'if (useApp().state.admin) x',
      'if (zustand().admin) x',
    ]
    const abgeleitet = [
      '{rechteVon(state).admin && (',
      'const marke = lage.rechte.admin ? a : b',
      'return rechte.admin || rechte.planer',
      'const { admin, planer } = rechteDerPerson(state.members, person)',
    ]
    expect(echt.filter((z) => !liest(z))).toEqual([])
    expect(abgeleitet.filter(liest)).toEqual([])
  })

  it('die Probe findet ein Lesen, wo es steht', () => {
    // Gegenprobe: Sie liest die erlaubten Dateien, die das Recht wirklich lesen.
    const gelesen = [...ERLAUBT].filter((datei) =>
      readFileSync(join(WURZEL, datei), 'utf8')
        .split('\n')
        .some(liest),
    )
    expect(gelesen).toEqual([...ERLAUBT])
  })
})
