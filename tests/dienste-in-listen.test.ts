import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { kommentarZeile, quelldateien, WURZEL } from './quelldateien'

/**
 * **Jede Liste der Hilfsdienste ist alphabetisch** — über `useDienste()` im
 * Baustein, `diensteDerSprache` in einer Ableitung. `state.services` steht in
 * der Folge des Anlegens; wer daraus eine Liste baut, zeigt sie in dieser
 * Folge, und keine Probe merkt es: Drei solche Stellen fand erst das Review
 * (Plan senden, „An diesem Tag schon", die Zeitleiste).
 *
 * Deshalb steht hier jede Stelle, die die Dienste aus dem Zustand liest, mit
 * ihrer Zahl und dem Grund, warum dort keine Liste entsteht. Eine neue Stelle
 * färbt die Probe rot. Zeigt sie Dienste als Liste — untereinander, mit Komma,
 * als Spalten —, nimmt sie die sortierte Fassung; sonst gehört sie hierher,
 * mit Grund. Fällt eine weg, die Zahl herunter.
 */

const ERLAUBT: Readonly<Record<string, { n: number; warum: string }>> = {
  'src/app/useDienste.ts': { n: 1, warum: 'die Stelle, die sortiert' },
  'src/app/reducer.ts': { n: 2, warum: 'gibt die Ableitungen diensteDerSprache; dazu die Rechengrundlage in ableitungsQuellen' },
  'src/app/persist.ts': { n: 5, warum: 'schreibt die Position — die Folge des Anlegens' },
  'src/app/aktionen/versammlung.ts': { n: 6, warum: 'ändert den Bestand: Plätze, Umbenennen (nachschlagen und ersetzen), Löschen, Anlegen, umbenannte Gruppe' },
  'src/app/aktionen/zuteilen.ts': { n: 4, warum: '„Automatisch" und geänderte Plätze — die Füllfolge bleibt die des Anlegens' },
  'src/app/aktionen/zusagen.ts': { n: 3, warum: 'Tausch, Doppelbelegung, Platz nachschlagen' },
  'src/app/useKuenftigePlaetze.ts': { n: 1, warum: 'Bestand für die künftigen Plätze einer Person (`nichtMehrPassend`, T181/T182) — die Plätze stehen nach Termin' },
  'src/aufgaben/useSaal.ts': { n: 2, warum: 'zählt die Besetzung' },
  'src/auswertung/AuswertungScreen.tsx': { n: 1, warum: 'rechnet die Auswertung und schlägt Namen nach; die Tabelle bekommt useDienste' },
  'src/dashboard/PlanungsKarte.tsx': { n: 5, warum: 'zählt für die Planungs-Karte' },
  'src/einstellungen/EinstellungenScreen.tsx': { n: 2, warum: 'die Anzahl der Dienste' },
  'src/einstellungen/HilfsdienstBlatt.tsx': { n: 2, warum: 'schlägt einen Dienst nach; prüft einen neuen Namen gegen die übrigen (`doppelterName`)' },
  'src/personen/BereicheBlatt.tsx': { n: 1, warum: 'bereichsGruppen sortiert selbst' },
  'src/personen/PersonDetail.tsx': { n: 1, warum: 'bereichsGruppen sortiert selbst' },
  'src/personen/PersonenFilterBlatt.tsx': { n: 1, warum: 'das Auswahlfeld sortiert selbst' },
  'src/personen/person-timeline.ts': { n: 1, warum: '`state` sind hier die TimelineDaten — PersonTimeline gibt useDienste mit' },
  'src/planen/AssignSheet.tsx': { n: 3, warum: 'Platz und Gruppen-Dienst nachschlagen, Bestand für kandidaten' },
  'src/planen/kandidaten.ts': { n: 5, warum: '`state` sind die KandidatenDaten: Rangfolge, Auslastung, nachschlagen; „An diesem Tag schon" über diensteDerSprache' },
  'src/planen/AutomatischBlatt.tsx': { n: 2, warum: 'zählt besetzte und alle Plätze' },
  'src/planen/WochenStand.tsx': { n: 1, warum: 'die Spur zählt' },
  'src/planen/ZusagenAnsicht.tsx': { n: 2, warum: 'Konflikte und Zahlen, Platz nachschlagen; die Plätze kommen über useDienste' },
  'src/planen/useAktuellerPlatz.ts': { n: 1, warum: 'schlägt den Platz nach' },
  'src/planen/useKonflikte.ts': { n: 1, warum: 'Konflikte nennen Personen, keine Dienste' },
  'src/planen/useWochenKarten.ts': { n: 2, warum: 'zählt für die Wochenkarten' },
  'src/tauschen/usePlatzZeile.tsx': { n: 1, warum: 'schlägt einen Platz nach' },
  'src/tauschen/useTauschen.ts': { n: 1, warum: 'Bestand für den Tausch — nachschlagen' },
}

/** Ein Lesen der Dienste aus dem Zustand: `state.services`, ein Selektor, `{ services } = state`. */
const LESEN = [
  /\b(?:state|prev|next|s|zustand)\.services\b/,
  /useAppSelector\(\s*\(\s*\w+\s*\)\s*=>\s*\w+\.services\b/,
  /\{[^}]*\bservices\b[^}]*\}\s*=\s*(?:state|zustand)\b/,
]

/** Kommentarzeilen zählen nicht — dort darf von den Diensten die Rede sein. */
const liest = (zeile: string): boolean => !kommentarZeile(zeile) && LESEN.some((m) => m.test(zeile))

/**
 * Dieselbe Zerlegung über mehrere Zeilen (`const {\n  services,\n} = state`) —
 * zeilenweise sähe sie niemand. Gesucht im Text ohne Kommentarzeilen; `[^{}]`
 * hält die Suche in einem Klammerpaar.
 */
const MEHRZEILIG = /\{[^{}]*\n[^{}]*\bservices\b[^{}]*\}\s*=\s*(?:state|zustand)\b|\{[^{}]*\bservices\b[^{}]*\n[^{}]*\}\s*=\s*(?:state|zustand)\b/g

/** Alle Stellen eines Quelltexts, die die Dienste aus dem Zustand lesen. */
function stellen(text: string, datei = ''): string[] {
  const zeilen = text.split('\n')
  const einzeln = zeilen.flatMap((zeile, i) => (liest(zeile) ? [`${datei}:${i + 1}: ${zeile.trim()}`] : []))
  const ohneKommentar = zeilen.filter((zeile) => !kommentarZeile(zeile)).join('\n')
  const mehrzeilig = [...ohneKommentar.matchAll(MEHRZEILIG)].map((m) => `${datei}: ${m[0].replace(/\s+/g, ' ')}`)
  return [...einzeln, ...mehrzeilig]
}

describe('Listen der Hilfsdienste nehmen die sortierte Fassung', () => {
  it('nur die eingetragenen Stellen lesen state.services — jede so oft wie vermerkt', () => {
    const abweichungen: string[] = []
    const gesehen = new Set<string>()
    for (const datei of quelldateien({ orte: ['src'], endungen: ['.ts', '.tsx'], ohneTests: true })) {
      const zeilen = stellen(readFileSync(join(WURZEL, datei), 'utf8'), datei)
      if (zeilen.length === 0) continue
      gesehen.add(datei)
      const soll = ERLAUBT[datei]?.n ?? 0
      if (zeilen.length !== soll) abweichungen.push(`${zeilen.length} statt ${soll}:`, ...zeilen)
    }
    for (const datei of Object.keys(ERLAUBT)) {
      if (!gesehen.has(datei)) abweichungen.push(`${datei}: liest nicht mehr — Eintrag streichen`)
    }
    expect(abweichungen).toEqual([])
  })

  it('sie erkennt ein Lesen, wo es steht — und nicht, wo eine Ableitung ihre Dienste bekommt', () => {
    const lesen = [
      '{state.services.map((service) => (',
      'const dienste = state.services',
      'const services = useAppSelector((s) => s.services)',
      'const services = useAppSelector((x) => x.services)',
      'const { weeks, services, persons } = state',
      'geaenderteSchreiben(prev.services, next.services, (s) => s.key)',
    ]
    const keinLesen = [
      '// state.services steht in der Folge des Anlegens',
      ' * `state.services` gehört in keine Liste',
      'for (const svc of services) {',
      'const { week, services, confirmations } = args',
      'services: dienste,',
      'speicherFuer.services === services &&',
    ]
    expect(lesen.filter((z) => !liest(z))).toEqual([])
    expect(keinLesen.filter(liest)).toEqual([])
  })

  it('auch eine Zerlegung über mehrere Zeilen — einmal gezählt, im Kommentar gar nicht', () => {
    expect(stellen('const {\n  weeks,\n  services,\n} = state')).toHaveLength(1)
    expect(stellen('const {\n  services } = state')).toHaveLength(1)
    expect(stellen('const { weeks, services } = state')).toHaveLength(1)
    expect(stellen('/*\n * const {\n *   services,\n * } = state\n */')).toEqual([])
    expect(stellen('const {\n  week,\n  services,\n} = args')).toEqual([])
  })
})
