import { describe, expect, it } from 'vitest'

/**
 * Vollständigkeitsprobe: **Klassennamen stehen wörtlich im Quelltext.**
 *
 * Der Anlass ist ein echter Schaden (T70). In `WeekStrip.tsx` hieß es einmal
 * `week-page--${…}`. Der Name „week-page--vor" stand damit nirgends: Eine
 * Textsuche fand ihn nicht, die zugehörigen CSS-Regeln galten als tot und
 * wurden entfernt. Danach lagen beide Nachbarwochen ohne Versatz über der
 * aktuellen — Programm und Planen zeigten zwei Wochen übereinander.
 *
 * Die Regel, die daraus folgt und die diese Probe durchsetzt:
 *
 *   Ein Klassenname wird **nie** zusammengesetzt. Eingesetzt werden darf nur
 *   ein **ganzer** Name oder ein ganzer Zusatz — `${basis} is-armed` ist recht,
 *   `week-page--${richtung}` und `'plan-' + art` sind es nicht.
 *
 * Erkennbar ist das am Rand der Einsetzung: Klebt sie an einem Namensteil
 * (`--${x}`, `x${'-btn'}`), ist der Name zerschnitten. Steht Leerraum oder das
 * Ende der Zeichenkette daneben, ist es ein ganzer Name.
 *
 * Die Probe ist bewusst grob und liest den Quelltext als Text — wie die beiden
 * anderen Vollständigkeitsproben (`alle-plaetze`, `aufgaben-label-quelle`).
 *
 * **Was sie sieht:** die Stelle, an der ein Klassenname gesetzt wird
 * (`className=`, die DOM-Wege) und die Sammelvariablen, die dafür gebaut werden
 * (`cls`, `klasse`, `klassen` — beide gibt es hier). **Was sie nicht sieht:**
 * einen Namen, der drei Ecken weiter in einer beliebig benannten Variablen
 * entsteht. Sie fängt die Form, in der der Schaden entstanden ist, nicht jede
 * denkbare.
 */

/**
 * Quelltext aller Dateien unter `src/` — über Vite, ohne Node-Abhängigkeit
 * (wie `i18n/aufgaben-label-quelle.test.ts`). Node-Importe gingen hier nicht:
 * `tsconfig.app.json` kennt keine Node-Typen, und die Sperrklinke prüft `src`
 * mit derselben Konfiguration.
 */
const ROH = import.meta.glob('../**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const HIER = 'styles/'
const QUELLEN = Object.entries(ROH)
  .map(([pfad, text]) => [pfad.startsWith('./') ? HIER + pfad.slice(2) : pfad.replace(/^(\.\.\/)+/, ''), text] as const)
  .filter(([pfad]) => !/\.test\.tsx?$/.test(pfad))

/**
 * Stellen, an denen ein Klassenname entsteht: `className={…}` /
 * `className="…"` im JSX, dazu die beiden DOM-Wege (`el.className = …`,
 * `classList.add(…)`), die es außerhalb von React gibt.
 */
const STELLEN =
  /(className\s*=\s*|classList\.(?:add|remove|toggle)\s*\(|\.className\s*=\s*|const\s+(?:cls|klasse|klassen)\s*=\s*)/g

/**
 * Der Ausdruck hinter der Fundstelle — genau er, nicht der Rest der Zeile.
 *
 * Die Grenze zu ziehen ist nicht Feinschliff, sondern nötig: `<label
 * className="field-label" htmlFor={`pers-${key}`}>` hat beides in einer Zeile,
 * und die zusammengesetzte **Kennung** ist kein zusammengesetzter Klassenname.
 * Zählt der Rest der Zeile mit, meldet die Probe sie trotzdem — und wer sie
 * dreimal umsonst gelesen hat, glaubt ihr beim vierten Mal nicht mehr.
 */
function ausdruck(text: string, ab: number): string {
  let i = ab
  while (i < text.length && /\s/.test(text[i] ?? '')) i++
  const auf = text[i]
  if (auf === '"' || auf === "'") {
    const ende = text.indexOf(auf, i + 1)
    return ende === -1 ? text.slice(i) : text.slice(i, ende + 1)
  }
  const PAARE: Record<string, string> = { '{': '}', '(': ')', '[': ']' }
  const zu = auf ? PAARE[auf] : undefined
  if (!auf || !zu) return ''
  let tiefe = 0
  for (let j = i; j < text.length; j++) {
    const c = text[j]
    if (c === auf) tiefe++
    else if (c === zu) {
      tiefe--
      if (tiefe === 0) return text.slice(i, j + 1)
    }
  }
  return text.slice(i)
}

/**
 * Template-Literale im Ausdruck, in denen eine Einsetzung an einem Namensteil
 * klebt. Zurück kommt der Fundtext für die Fehlermeldung.
 */
function geklebt(code: string): string[] {
  const treffer: string[] = []
  for (const lit of code.match(/`[^`]*`/g) ?? []) {
    for (const stelle of lit.matchAll(/(.?)\$\{([^}]*)\}(.?)/g)) {
      const [, davor = '', inhalt = '', danach = ''] = stelle
      const klebt = /[\w-]/.test(davor) || /[\w-]/.test(danach)
      if (klebt && !nurZusatz(inhalt)) treffer.push(lit)
    }
  }
  // Zusammenketten mit + zählt genauso: 'plan-' + art
  for (const m of code.match(/'[^']*[\w-]'\s*\+|\+\s*'[\w-][^']*'/g) ?? []) treffer.push(m)
  return treffer
}

/**
 * Setzt diese Einsetzung nur einen **ganzen Zusatz** ein — also entweder nichts
 * oder etwas, das mit Leerraum beginnt?
 *
 * `${armed ? ' is-armed' : ''}` klebt am Namen davor und ist trotzdem recht:
 * Der Name ist zu diesem Zeitpunkt fertig, angehängt wird ein eigenes Wort.
 * Eine Einsetzung ohne jede Zeichenkette (`${key}`) fällt durch — was sie
 * liefert, weiß niemand.
 */
function nurZusatz(inhalt: string): boolean {
  const literale = inhalt.match(/'[^']*'|"[^"]*"/g) ?? []
  if (literale.length === 0) return false
  return literale.every((l) => {
    const wert = l.slice(1, -1)
    return wert === '' || /^\s/.test(wert)
  })
}

describe('Klassennamen stehen wörtlich im Quelltext (T70)', () => {
  it('kein Klassenname wird zusammengesetzt', () => {
    const funde: string[] = []
    for (const [datei, text] of QUELLEN) {
      for (const m of text.matchAll(STELLEN)) {
        const zeile = text.slice(0, m.index).split('\n').length
        // Hinter der Fundstelle beginnt der Ausdruck — nicht an ihr.
        for (const fund of geklebt(ausdruck(text, m.index + m[0].length))) {
          funde.push(`${datei}:${zeile} ${fund}`)
        }
      }
    }
    expect(funde).toEqual([])
  })

  it('erkennt die Form, an der es schon einmal schiefging', () => {
    // Gegenprobe: Ohne sie wäre der Test oben grün, auch wenn er nichts prüft.
    expect(geklebt('className={`week-page--${richtung}`}')).toHaveLength(1)
    expect(geklebt("className={'plan-auto-' + art}")).toHaveLength(1)
    expect(geklebt('className={`${basis}-btn`}')).toHaveLength(1)
    // Und lässt durch, was recht ist: ganze Namen und ganze Zusätze.
    expect(geklebt('className={`${basis} is-armed`}')).toEqual([])
    expect(geklebt('className={`week-chip ${c.cls}`}')).toEqual([])
    expect(geklebt("className={armed ? 'plan-auto-btn is-armed' : 'plan-auto-btn'}")).toEqual([])
  })
})

describe('Die beiden Nachbarwochen tragen ihre Namen ausgeschrieben', () => {
  it('week-page--vor und week-page--nach stehen im Quelltext', () => {
    /*
     * Der ursprüngliche Fall aus T70, hier festgenagelt: Wer die Namen wieder
     * zusammensetzt, bekommt es doppelt gesagt — von der Probe oben und von
     * dieser Zeile.
     *
     * **Nur die TSX-Seite, nicht die CSS-Seite.** `import.meta.glob(…,
     * '?raw')` liefert für `.css` im Testlauf eine **leere** Zeichenkette (die
     * CSS-Behandlung von Vite greift vor `?raw`) — gemessen, nicht vermutet.
     * Ein Test, der eine leere Datei nach einem Namen durchsucht, wäre grün und
     * hielte nichts. Die CSS-Seite trägt stattdessen einen Kommentar über den
     * beiden Regeln, der sagt, warum sie nicht tot sind.
     */
    const tsx = QUELLEN.find(([p]) => p.endsWith('components/WeekStrip.tsx'))?.[1] ?? ''
    expect(tsx, 'WeekStrip.tsx gefunden').not.toBe('')
    for (const name of ['week-page--vor', 'week-page--nach']) {
      expect(tsx, `${name} im TSX`).toContain(name)
    }
  })
})
