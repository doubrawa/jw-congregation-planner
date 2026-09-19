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

  it('beide Nachbarn bekommen einen waagerechten Versatz — in Leserichtung', () => {
    /*
      Der Kern der Sache: die Regeln dürfen nicht leer sein. Der Versatz ist
      **logisch** angegeben, nicht physisch: `inset-inline-end` schiebt die
      vorige Woche auf die Seite, von der der Leser kommt — links auf Deutsch,
      rechts auf Arabisch —, `inset-inline-start` die nächste auf die andere.

      Mit `right`/`left` lagen die Nachbarn in den vier
      Rechts-nach-links-Sprachen vertauscht: Der Leser wischte in die Richtung,
      in der für ihn die Vergangenheit liegt, und bekam die nächste Woche. Die
      Geste dreht sich mit (`useSwipeWeek`, `vorigeSeite`).
    */
    expect(css).toMatch(/\.week-page--vor\s*\{[^}]*inset-inline-end:\s*100%/)
    expect(css).toMatch(/\.week-page--nach\s*\{[^}]*inset-inline-start:\s*100%/)
    // Und keine physische Angabe daneben, die sie wieder festnagelt.
    expect(css).not.toMatch(/\.week-page--(vor|nach)\s*\{[^}]*\b(left|right):/)
  })

  it('der Klassenname steht ausgeschrieben im Quelltext, nicht zusammengesetzt', () => {
    // Sonst findet die nächste Suche nach toten Klassen die Regeln wieder
    // nicht — und entfernt sie ein zweites Mal.
    expect(tsx).not.toMatch(/week-page--\$\{/)
    expect(tsx).toContain('week-page--vor')
    expect(tsx).toContain('week-page--nach')
  })
})

/*
 * Der Ampel-Punkt im Planen ist ein leeres `<span>` — seine ganze Aussage steckt
 * in der Farbe, und die kommt aus CSS. jsdom rechnet kein CSS: Fehlte die Regel
 * einer Stufe oder zeigte sie auf das falsche Token, blieben alle Tests grün,
 * und der Planer sähe einen unsichtbaren oder falsch gefärbten Punkt.
 */
describe('Ampel-Punkt: jede Stufe hat ihre Farbe', () => {
  const tsx = ohneKommentare(lies('src/planen/useZusage.ts'))
  const css = lies('src/planen/planen.css')
  const tokens = lies('src/styles/tokens.css')

  /** Stufe → Klasse, wie `ZUSAGE_KLASSE` sie vergibt. */
  const klassen = Object.fromEntries(
    [...tsx.matchAll(/(bestätigt|offen|verhindert): '(is-[a-z]+)'/g)].map((m) => [m[1], m[2]]),
  )

  it('die Komponente vergibt je Stufe genau eine Klasse', () => {
    expect(klassen).toEqual({ bestätigt: 'is-bestaetigt', offen: 'is-offen', verhindert: 'is-verhindert' })
  })

  it('jede Klasse hat eine Regel mit dem Token ihrer Stufe', () => {
    // Über Kreuz vertauscht (grün auf „offen") wäre ebenso falsch wie gar nicht.
    for (const [stufe, token] of [
      ['is-bestaetigt', '--zusage-bestaetigt'],
      ['is-offen', '--zusage-offen'],
      ['is-verhindert', '--zusage-verhindert'],
    ] as const) {
      const regel = new RegExp(String.raw`\.zusage-punkt\.${stufe}\s*\{[^}]*background:\s*var\(${token}\)`)
      expect(css, stufe).toMatch(regel)
    }
  })

  it('jedes Token ist in der hellen Grundpalette definiert', () => {
    const basis = tokens.slice(tokens.indexOf(':root {'), tokens.indexOf('\n}', tokens.indexOf(':root {')))
    for (const token of ['--zusage-bestaetigt', '--zusage-offen', '--zusage-verhindert']) {
      expect(basis, token).toMatch(new RegExp(String.raw`${token}:\s*#[0-9a-f]{6};`))
    }
  })
})

/*
 * Die Treffpunkt-Zeile lief auf dem Handy über den Namen: „Versammlungstreff-
 * punkt" ist breiter als die halbe Karte, und eine Flex-Zeile mit
 * `justify-content: space-between` lässt einen Titel, der nicht schrumpfen
 * darf, einfach über den Nachbarn hinausragen. Titel und Name lagen sichtbar
 * übereinander.
 *
 * Genau dieser Fehler war in den Programmpunkt-Zeilen (`.prog-row`) schon
 * einmal behoben — mit `minmax(0, 1fr)` und `min-width: 0`. Die
 * Treffpunkt-Zeile hatte die Absicherung nie bekommen. Der Wächter prüft sie
 * an beiden Zeilen, damit die nächste Umstellung nicht wieder nur die eine
 * Hälfte mitnimmt.
 *
 * jsdom rechnet kein Layout, ein DOM-Test kann den Überlapp also nicht sehen.
 * Diese Prüfung beweist kein Layout — sie hält die drei Bestandteile fest, ohne
 * die es rechnerisch gar nicht aufgehen kann: eine schrumpffähige Spalte, ein
 * schrumpffähiges Element darin und ein Titel, der umbrechen darf.
 */
describe('Programm-Zeilen: der lange Titel darf schrumpfen und umbrechen', () => {
  const css = lies('src/programm/programm.css')
  const tsx = ohneKommentare(lies('src/programm/FsProgram.tsx'))

  /** Der Rumpf einer Regel, ohne die Kommentare davor. */
  function regel(name: string): string {
    const treffer = css.match(new RegExp(String.raw`^\.${name}\s*\{([^}]*)\}`, 'm'))
    expect(treffer, `Regel .${name} fehlt`).not.toBeNull()
    return treffer![1]!
  }

  it.each([
    ['fs-row', 'Treffpunkte'],
    ['prog-row', 'Programmpunkte'],
  ])('%s teilt die Karte in eine schrumpffähige und eine feste Spalte (%s)', (name) => {
    // `1fr` allein genügt nicht: eine Gitterspalte hat sonst min-width:auto und
    // bleibt so breit wie ihr längstes Wort. Genau das drückte den Namen weg.
    expect(regel(name)).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)/)
  })

  it.each([
    ['fs-row-text', 'fs-title'],
    ['prog-row-text', 'prog-title'],
  ])('%s darf unter seine Inhaltsbreite, %s darf umbrechen', (spalte, titel) => {
    expect(regel(spalte)).toMatch(/min-width:\s*0/)
    const t = regel(titel)
    expect(t, 'ohne Silbentrennung bricht das Wort hart oder gar nicht').toMatch(/hyphens:\s*auto/)
    expect(t, 'Notbremse für Wörter, die der Browser nicht trennen kann').toMatch(
      /overflow-wrap:\s*break-word/,
    )
  })

  it('auch die Namensspalte gibt nach, statt die Karte zu sprengen', () => {
    for (const name of ['fs-leader', 'prog-names']) {
      expect(regel(name), name).toMatch(/min-width:\s*0/)
      expect(regel(name), name).toMatch(/overflow-wrap:\s*break-word/)
    }
  })

  it('die Treffpunkt-Zeile vergibt die beiden Klassen, an denen das hängt', () => {
    // Die Regeln greifen nur, wenn die Komponente die Klassen auch setzt —
    // vor der Behebung war die Titelspalte ein <div> ganz ohne Klasse.
    expect(tsx).toContain('className="fs-row-text"')
    expect(tsx).toContain('fs-leader-person')
  })
})
