import { describe, expect, it } from 'vitest'
import { cssDateien, cssRegeln } from './css-quellen'

/**
 * **Eine Regel in einer Abfrage wird nicht von einer späteren überschrieben**
 * (T128, Review vom 20.10.2026).
 *
 * `@container`, `@media` und `@supports` geben keiner Regel Gewicht. Setzt
 * dieselbe Regel — gleicher Selektor, gleiche Eigenschaft — außerhalb **später**
 * in der Datei noch einmal an, gewinnt sie immer, und die Abfrage ist tot. So
 * stand beim Planen der Treffpunkte bei 320 px der Text schon unter der Uhrzeit,
 * der Leiter aber behielt seinen Einzug: Die Grundregel `.treff-leiter-zeile`
 * stand 60 Zeilen nach dem Block. Alle Proben waren grün — sie prüften, was im
 * Block steht, nicht, ob es greift.
 *
 * Verglichen wird je Datei und genau derselbe Selektor. Zwei Abfragen
 * gegeneinander bleiben außen vor: Welche gilt, hängt von der Lage ab.
 */

describe('Was in einer Container- oder Medienabfrage steht, greift auch', () => {
  const jeDatei = cssDateien().map(([datei, css]) => [datei, cssRegeln(css)] as const)
  const eigenschaften = (regel: { deklarationen: ReadonlyArray<readonly [string, string]> }) =>
    regel.deklarationen.map(([eigenschaft]) => eigenschaft)

  it('die Probe sieht Regeln in Abfragen — sonst prüfte sie nichts', () => {
    const bedingt = jeDatei.flatMap(([, liste]) => liste.filter((r) => r.abfragen))
    expect(bedingt.length).toBeGreaterThan(50)
    expect(bedingt.some((r) => r.selektoren.includes('.treff-leiter-zeile'))).toBe(true)
  })

  it('keine spätere Regel gleichen Selektors setzt dieselbe Eigenschaft wieder', () => {
    const tot = jeDatei.flatMap(([datei, liste]) =>
      liste.flatMap((regel, i) =>
        regel.abfragen
          ? liste.slice(i + 1).flatMap((spaeter) =>
              spaeter.abfragen
                ? []
                : regel.selektoren
                    .filter((s) => spaeter.selektoren.includes(s))
                    .flatMap((s) => {
                      const beide = eigenschaften(regel).filter((e) => eigenschaften(spaeter).includes(e))
                      return beide.length
                        ? [`${datei}:${regel.zeile} ${regel.abfragen} ${s} { ${beide.join(', ')} } — wieder gesetzt in Zeile ${spaeter.zeile}`]
                        : []
                    }),
            )
          : [],
      ),
    )
    expect(tot).toEqual([])
  })
})
