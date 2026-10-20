import { describe, expect, it } from 'vitest'
import { cssDateien } from './css-quellen'

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

interface Regel {
  selektoren: string[]
  eigenschaften: string[]
  /** Die Abfragen, in denen die Regel steht — leer, wenn sie immer gilt. */
  abfragen: string
  zeile: number
}

/** Eine Selektorliste an den Kommas, die nicht in Klammern stehen (`:is(.a, .b)`). */
function selektoren(liste: string): string[] {
  const out: string[] = []
  let tiefe = 0
  let stueck = ''
  for (const zeichen of liste) {
    if (zeichen === '(') tiefe++
    if (zeichen === ')') tiefe--
    if (zeichen === ',' && tiefe === 0) {
      out.push(stueck.trim())
      stueck = ''
    } else stueck += zeichen
  }
  return stueck.trim() ? [...out, stueck.trim()] : out
}

/** Die Stilregeln einer Datei, jede mit den Abfragen, in denen sie steht. */
function regeln(css: string): Regel[] {
  // Kommentare durch Leerzeichen ersetzen — so stimmen die Zeilennummern weiter.
  const text = css.replace(/\/\*[\s\S]*?\*\//g, (kommentar) => kommentar.replace(/[^\n]/g, ' '))
  const out: Regel[] = []
  const offen: Array<{ kopf: string; ab: number }> = []
  let start = 0
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') {
      offen.push({ kopf: text.slice(start, i).trim(), ab: i + 1 })
      start = i + 1
    } else if (text[i] === '}') {
      const block = offen.pop()
      const rumpf = block ? text.slice(block.ab, i) : ''
      if (block && !block.kopf.startsWith('@') && !rumpf.includes('{')) {
        out.push({
          selektoren: selektoren(block.kopf),
          eigenschaften: [...rumpf.matchAll(/(?:^|;)\s*([-a-z]+)\s*:/g)].map((m) => m[1] ?? ''),
          abfragen: offen
            .map((b) => b.kopf)
            .filter((k) => /^@(container|media|supports)\b/.test(k))
            .join(' '),
          zeile: text.slice(0, block.ab).split('\n').length,
        })
      }
      start = i + 1
    } else if (text[i] === ';' && offen.length === 0) start = i + 1
  }
  return out
}

describe('Was in einer Container- oder Medienabfrage steht, greift auch', () => {
  const jeDatei = cssDateien().map(([datei, css]) => [datei, regeln(css)] as const)

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
                      const beide = regel.eigenschaften.filter((e) => spaeter.eigenschaften.includes(e))
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
