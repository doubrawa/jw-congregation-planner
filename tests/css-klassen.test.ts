import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Wächter über Klassennamen, die im Quelltext und im CSS zusammenpassen müssen.
 *
 * Anlass: die beiden Regeln `.week-page--vor` und `.week-page--nach` wurden als
 * „tote CSS-Klassen" entfernt. Tot waren sie nicht — der Klassenname entstand
 * im TSX zur Laufzeit (`week-page--${…}`), eine Textsuche nach dem vollen Namen
 * fand ihn deshalb nicht. Ohne die Regeln lagen beide Nachbarwochen ohne
 * waagerechten Versatz über der aktuellen: Programm und Planen zeigten zwei
 * Wochen übereinander, mit doppelten Überschriften, Tagesreitern und
 * Programmpunkten.
 *
 * Kein Test bemerkte das. jsdom rechnet kein Layout, und CSS rührt der übrige
 * Testbestand gar nicht an — eine entfernte Regel ist dort schlicht unsichtbar.
 * Diese Prüfung beweist deshalb auch kein Layout. Sie hält nur zusammen, was
 * zusammengehört: jede Klasse, die eine Komponente vergibt, braucht ihre Regel,
 * und jede Regel braucht ihre Klasse.
 *
 * Steht außerhalb von `src/`, weil sie die Dateien als **Text** liest.
 * `tsconfig.app.json` übersetzt `src` ohne Node-Typen, und ein `?raw`-Import
 * hilft nicht: CSS-Importe sind unter vitest leere Stubs, der Wächter läse
 * dann eine leere Datei und meldete immer Erfolg.
 */

function lies(pfad: string): string {
  return readFileSync(fileURLToPath(new URL('../' + pfad, import.meta.url)), 'utf8')
}

/** Quelltext ohne Kommentare — die dürfen die alte Schreibweise erwähnen. */
function ohneKommentare(quelle: string): string {
  return quelle.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

describe('Wochen-Streifen: Klassen und Regeln passen zusammen', () => {
  const tsx = ohneKommentare(lies('src/components/WeekStrip.tsx'))
  const css = lies('src/components/week-strip.css')
  const imTsx = [...new Set([...tsx.matchAll(/week-page--([a-z]+)/g)].map((m) => m[1]))]
  const imCss = [...css.matchAll(/^\.week-page--([a-z]+)\s*\{/gm)].map((m) => m[1])

  it('die Komponente vergibt genau die beiden Nachbar-Klassen', () => {
    expect(imTsx.sort()).toEqual(['nach', 'vor'])
  })

  it('jede vergebene Klasse hat eine CSS-Regel', () => {
    const ohneRegel = imTsx.filter((k) => !imCss.includes(k))
    expect(ohneRegel, 'Klasse ohne Regel — die Nachbarwoche läge über der aktuellen').toEqual([])
  })

  it('jede CSS-Regel wird auch vergeben', () => {
    // Gegenrichtung: eine Regel ohne Klasse ist wirklich tot und darf weg.
    const ohneKlasse = imCss.filter((k) => !imTsx.includes(k))
    expect(ohneKlasse).toEqual([])
  })

  it('beide Nachbarn bekommen einen waagerechten Versatz', () => {
    // Der Kern der Sache: die Regeln dürfen nicht leer sein. `right: 100%`
    // schiebt die vorige Woche nach links hinaus, `left: 100%` die nächste
    // nach rechts.
    expect(css).toMatch(/\.week-page--vor\s*\{[^}]*right:\s*100%/)
    expect(css).toMatch(/\.week-page--nach\s*\{[^}]*left:\s*100%/)
  })

  it('der Klassenname steht ausgeschrieben im Quelltext, nicht zusammengesetzt', () => {
    // Sonst findet die nächste Suche nach toten Klassen die Regeln wieder
    // nicht — und entfernt sie ein zweites Mal.
    expect(tsx).not.toMatch(/week-page--\$\{/)
    expect(tsx).toContain('week-page--vor')
    expect(tsx).toContain('week-page--nach')
  })
})
