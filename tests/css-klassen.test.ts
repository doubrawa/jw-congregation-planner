import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
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

/*
 * **Alle Bausteine gegen alle Stylesheets** — die Verallgemeinerung der drei
 * Wächter oben.
 *
 * Am 24. September 2026 stand die Meldung „Diesen Namen trägt bereits …" im
 * Personen-Detail als schlichter Absatz hinter dem E-Mail-Feld:
 * `className="pers-field-fehler"` war vergeben, eine Regel dazu hatte nie
 * jemand geschrieben. Kein Test sah das; der DOM stimmte, nur das Blatt nicht.
 * In der Gegenrichtung lagen sieben Regeln für Klassen herum, die kein
 * Bildschirm mehr setzte (`mem-inv-form`, `prog-lang-hint`, …): Reste
 * ausgebauter Oberflächen, die beim Lesen so aussehen, als gäbe es die Fläche
 * noch.
 *
 * Gezählt werden wörtliche Klassen in `className`, auch in Bedingungen
 * (`x ? 'a b' : 'a'`) und in Template-Literalen, dort nur die ganzen Wörter.
 * Zusammengebaute Namen (`chip--${art}`) sieht die Probe nicht — und soll sie
 * nicht: Genau so gingen `.week-page--vor/--nach` oben verloren. Deshalb steht
 * jeder Name ausgeschrieben im Quelltext, und Varianten tragen
 * `data`-Attribute (`data-farbe`, `data-kind`). Für die Gegenrichtung genügt
 * das Vorkommen als ganzes Wort irgendwo im Code oder in `index.html`; so
 * zählt auch `classList.add('is-open')`.
 */

/** Alle Dateien mit einer der Endungen unter `ordner`, mit Pfad relativ zur Wurzel. */
function dateien(ordner: string, endungen: string[]): Array<[string, string]> {
  const wurzel = fileURLToPath(new URL('..', import.meta.url))
  const liste: Array<[string, string]> = []
  const gehe = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const pfad = join(dir, name)
      if (statSync(pfad).isDirectory()) gehe(pfad)
      else if (endungen.some((e) => name.endsWith(e))) {
        liste.push([relative(wurzel, pfad).replace(/\\/g, '/'), readFileSync(pfad, 'utf8')])
      }
    }
  }
  gehe(join(wurzel, ordner))
  return liste
}

/**
 * Klassen ohne Regel, die als **Marke** dienen: Tests greifen über sie auf ein
 * Element zu, gestaltet wird über den Elternteil. Die Liste prüft sich selbst
 * (letzter Fall unten): Ein Eintrag, der aus dem Code verschwindet oder eine
 * Regel bekommt, fällt auf und ist hier zu streichen.
 */
const MARKEN = ['co-begriff', 'confirm-subs', 'dash', 'fs-add', 'plan-conflict-text']

const WORT = /[A-Za-z][\w-]*/g

/**
 * Die Klassen aus den Selektoren eines Stylesheets.
 *
 * Vorher fallen weg: Kommentare (dort stehen alte Namen), Zeichenketten (eine
 * Daten-URI mit `www.w3.org` sähe sonst aus wie `.w3`, ein `@import` wie
 * `.css`) und die Deklarationsblöcke (Zahlen wie `.5em`). Selektoren in
 * Medienabfragen bleiben, denn nur der innerste Block wird entfernt.
 */
function klassenAusCss(text: string): Set<string> {
  const selektoren = text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/"[^"\n]*"|'[^'\n]*'/g, '""')
    .replace(/\{[^{}]*\}/g, '{}')
  const klassen = new Set<string>()
  for (const m of selektoren.matchAll(/\.([A-Za-z][\w-]*)/g)) klassen.add(m[1]!)
  return klassen
}

/** Der Ausdruck in `className={…}` bis zur passenden Klammer. */
function geklammert(text: string, ab: number): string {
  let tiefe = 0
  for (let i = ab; i < text.length; i++) {
    if (text[i] === '{') tiefe++
    else if (text[i] === '}' && --tiefe === 0) return text.slice(ab + 1, i)
  }
  return text.slice(ab + 1)
}

/**
 * Die ganzen Wörter eines Template-Literals: Was an ein `${…}` grenzt, ist nur
 * ein Stück eines Namens und zählt nicht.
 */
function ganzeWoerter(vorlage: string): string[] {
  const stuecke = vorlage.split(/\$\{[^}]*\}/)
  const woerter: string[] = []
  stuecke.forEach((stueck, i) => {
    const teile = stueck.split(/\s+/)
    const linksGebunden = i > 0 && !/^\s/.test(stueck)
    const rechtsGebunden = i < stuecke.length - 1 && !/\s$/.test(stueck)
    teile.forEach((teil, j) => {
      if (!teil) return
      if (linksGebunden && j === 0) return
      if (rechtsGebunden && j === teile.length - 1) return
      woerter.push(teil)
    })
  })
  return woerter
}

/** Die wörtlichen Klassen aus `className="…"`, `className='…'` und `className={…}`. */
function klassenAusCode(text: string): Set<string> {
  const klassen = new Set<string>()
  const nimm = (s: string) => {
    for (const k of s.split(/\s+/)) if (k) klassen.add(k)
  }
  for (const m of text.matchAll(/className=(["'{])/g)) {
    const start = m.index + m[0].length
    if (m[1] === '{') {
      // Operanden eines Vergleichs (`tab === 'mid'`) sind keine Klassen.
      const ausdruck = geklammert(text, start - 1)
        .replace(/[!=]==?\s*(["'])[^"'\n]*\1/g, '')
        .replace(/(["'])[^"'\n]*\1\s*[!=]==?/g, '')
      for (const s of ausdruck.matchAll(/"([^"\n]*)"|'([^'\n]*)'/g)) nimm(s[1] ?? s[2] ?? '')
      for (const t of ausdruck.matchAll(/`([^`]*)`/g)) for (const w of ganzeWoerter(t[1] ?? '')) klassen.add(w)
    } else {
      const ende = text.indexOf(m[1]!, start)
      nimm(text.slice(start, ende < 0 ? undefined : ende))
    }
  }
  return klassen
}

describe('Alle Bausteine gegen alle Stylesheets', () => {
  /**
   * **Innerhalb der Mutationsprobe tritt die Probe zurück** — wie die
   * Ankerprüfung in `scripts/mutationsprobe.test.ts`: Eine Mutation, die ein
   * `className` mitnimmt, färbte sonst zuerst diesen Test rot, und die Probe
   * schriebe der Regel „bewacht" gut, ohne dass ihr eigener Wächter je lief.
   */
  const imProbelauf = Boolean(process.env.MUTATIONSPROBE)

  const regeln = new Set<string>()
  for (const [, text] of dateien('src', ['.css'])) for (const k of klassenAusCss(text)) regeln.add(k)

  const bausteine = dateien('src', ['.tsx', '.ts']).filter(([pfad]) => !/\.test\.tsx?$/.test(pfad))

  // Die Leser einer Regel: jedes Wort im Code (ohne Kommentare, die dürfen
  // alte Namen erwähnen) und in index.html.
  const woerter = new Set<string>()
  for (const w of lies('index.html').match(WORT) ?? []) woerter.add(w)
  for (const [, text] of bausteine) {
    const code = text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, '')
    for (const w of code.match(WORT) ?? []) woerter.add(w)
  }

  it('die Proben greifen überhaupt', () => {
    // Fänden die Muster nichts, gingen die Fälle unten leer und grün durch.
    expect(regeln.size).toBeGreaterThan(300)
    expect(bausteine.length).toBeGreaterThan(50)
    expect(regeln.has('pers-field-fehler')).toBe(true)
  })

  it.skipIf(imProbelauf)('jede Klasse eines Bausteins hat eine Regel — oder steht als Marke in der Liste', () => {
    const ohneRegel: string[] = []
    for (const [pfad, text] of bausteine) {
      for (const k of klassenAusCode(text)) {
        if (!regeln.has(k) && !MARKEN.includes(k)) ohneRegel.push(`${k} in ${pfad}`)
      }
    }
    expect(
      ohneRegel,
      'Klasse ohne Regel: gestalten — oder, wenn sie nur ein Griff für Tests ist, in MARKEN eintragen.',
    ).toEqual([])
  })

  it.skipIf(imProbelauf)('jede Regel hat einen Leser', () => {
    const ohneLeser = [...regeln].filter((k) => !woerter.has(k)).sort()
    expect(
      ohneLeser,
      'Regel ohne Verwendung: streichen — oder die Klasse steht im Code nur zusammengesetzt, dann ausschreiben (siehe Wochen-Streifen oben).',
    ).toEqual([])
  })

  it('die Marken sind, was sie zu sein behaupten', () => {
    for (const marke of MARKEN) {
      expect(woerter.has(marke), `${marke} steht in keinem Baustein mehr`).toBe(true)
      expect(regeln.has(marke), `${marke} hat inzwischen eine Regel`).toBe(false)
    }
  })
})

describe('die Lesehilfen der Rundum-Probe', () => {
  it('eine Daten-URI und ein @import sind keine Klassen', () => {
    const css =
      "@import './tokens.css';\n" +
      'select { background-image: url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\'/>"); }'
    expect([...klassenAusCss(css)]).toEqual([])
  })

  it('Kommentare und Zahlen zählen nicht, Selektoren in Medienabfragen schon', () => {
    const css = '/* .alt */ @media (min-width: 40.5em) { .neu, .neu.is-on { margin: .5em; } }'
    expect([...klassenAusCss(css)].sort()).toEqual(['is-on', 'neu'])
  })

  it('bedingte und zusammengesetzte className-Ausdrücke', () => {
    const tsx =
      "<a className={on ? 'chip is-active' : 'chip'} />" +
      "<b className={tab === 'mid' ? `row ${x}-lang tail ${y}` : 'row'} />" +
      '<c className="x y" />'
    expect([...klassenAusCode(tsx)].sort()).toEqual(['chip', 'is-active', 'row', 'tail', 'x', 'y'])
  })
})
