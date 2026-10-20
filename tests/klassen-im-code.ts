/**
 * **Die Klassen, die der Code vergibt** — für die Quelltext-Proben, die
 * Bausteine und Stylesheets gegeneinander halten (`css-klassen.test.ts`,
 * `flex-richtung.test.ts`).
 *
 * Gezählt werden wörtliche Klassen in `className`, auch in Bedingungen
 * (`x ? 'a b' : 'a'`) und in Template-Literalen, dort nur die ganzen Wörter.
 * Zusammengebaute Namen (`chip--${art}`) sieht der Leser nicht — und soll sie
 * nicht: Jeder Name steht ausgeschrieben im Quelltext (`css-klassen.test.ts`).
 */

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

/**
 * Je `className` die wörtlichen Klassen darin — bei einer Bedingung die beider
 * Seiten zusammen (`x ? 'karte a' : 'karte'` → karte, a): Was zusammen auf
 * einem Element stehen kann, steht in einer Liste.
 */
export function klassenlisten(text: string): string[][] {
  const listen: string[][] = []
  for (const m of text.matchAll(/className=(["'{])/g)) {
    const start = m.index + m[0].length
    const liste = new Set<string>()
    const nimm = (s: string) => {
      for (const k of s.split(/\s+/)) if (k) liste.add(k)
    }
    if (m[1] === '{') {
      // Operanden eines Vergleichs (`tab === 'mid'`) sind keine Klassen.
      const ausdruck = geklammert(text, start - 1)
        .replace(/[!=]==?\s*(["'])[^"'\n]*\1/g, '')
        .replace(/(["'])[^"'\n]*\1\s*[!=]==?/g, '')
      for (const s of ausdruck.matchAll(/"([^"\n]*)"|'([^'\n]*)'/g)) nimm(s[1] ?? s[2] ?? '')
      for (const t of ausdruck.matchAll(/`([^`]*)`/g)) for (const w of ganzeWoerter(t[1] ?? '')) liste.add(w)
    } else {
      const ende = text.indexOf(m[1]!, start)
      nimm(text.slice(start, ende < 0 ? undefined : ende))
    }
    listen.push([...liste])
  }
  return listen
}

/** Alle wörtlichen Klassen einer Datei, aus `className="…"`, `className='…'` und `className={…}`. */
export function klassenAusCode(text: string): Set<string> {
  return new Set(klassenlisten(text).flat())
}
