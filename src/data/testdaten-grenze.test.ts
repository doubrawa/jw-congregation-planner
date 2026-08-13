import { describe, expect, it } from 'vitest'

/**
 * **Die Testdaten gehören nicht ins ausgelieferte Bündel.**
 *
 * `src/data/testdaten.ts` heißt seit dem 13. August 2026 so, weil das die
 * Wahrheit ist: erfundene Personen, erfundene Wochen mit erkennbaren
 * Platzhaltern („Demoaufgabe 1"). Vorher hieß die Datei `demo.ts` und wurde
 * von **neun** Produktivdateien benutzt — unter anderem für die
 * Erinnerungs-Vorgaben bei jedem Laden und als Rückfall auf die Demo-Person.
 *
 * Geblieben sind genau zwei Stellen, und beide liegen hinter
 * `import.meta.env.DEV`, damit der Bündler sie beim Bauen entfernen kann:
 *
 * | Datei | wofür |
 * | --- | --- |
 * | `app/init.ts` | die Entwickler-Ansicht (Debug-Hash, kein Login nötig) |
 * | `app/reducer.ts` | der simulierte Import derselben Ansicht |
 *
 * **Nachgemessen am 13.8.2026** an `dist/assets/` nach `npm run build`:
 * „Demoaufgabe", „Demo-Studienartikel", „Musterstadt" und „Manfred Albrecht"
 * kommen dort nicht mehr vor. Vorher standen sie drin — die Bedingung war ein
 * Laufzeitwert (`!isSupabaseConfigured`), an dem kein Bündler etwas
 * entscheiden kann.
 *
 * Dieser Test prüft die Voraussetzung dafür: Kommt eine dritte Produktivdatei
 * hinzu, ist die Grenze neu zu begründen — und die Messung am Bündel zu
 * wiederholen.
 */

/** Quelltext aller Dateien unter `src/` — über Vite, ohne Node-Abhängigkeit. */
const QUELLEN = import.meta.glob('../**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

describe('Grenze zwischen Testdaten und Produktivcode', () => {
  const nutzer = Object.entries(QUELLEN)
    .filter(([pfad]) => !/\.test\.tsx?$/.test(pfad))
    .filter(([, text]) => /from '.*\/testdaten'/.test(text))
    .map(([pfad]) => pfad.replace(/^\.\.\//, ''))
    .sort()

  it('nur die beiden Stellen der Entwickler-Ansicht greifen darauf zu', () => {
    expect(nutzer).toEqual(['app/init.ts', 'app/reducer.ts'])
  })

  it('und beide entscheiden über `import.meta.env.DEV`', () => {
    // Nur so kann der Bündler den Zweig samt Daten entfernen. Eine Bedingung
    // aus einem Laufzeitwert sieht im Quelltext genauso aus und wirkt nicht.
    for (const datei of nutzer) {
      expect(QUELLEN[`../${datei}`]).toContain('import.meta.env.DEV')
    }
  })
})
