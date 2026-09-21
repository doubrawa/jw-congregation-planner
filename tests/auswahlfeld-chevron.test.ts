import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * **Jedes Auswahlfeld behält sein Chevron — in hellen wie in dunklen Schemata.**
 *
 * Das Chevron kommt app-weit aus einer Regel in `components/components.css`:
 * `select` bekommt ein Hintergrundbild, `no-repeat`, rechts mittig, dazu
 * `padding-inline-end: 40px` als Platz dafür; `:root[data-dark] select`
 * tauscht im dunklen Schema nur das Bild gegen ein helleres.
 *
 * Gefunden am 21.9.2026, im Dunkeln: Die Auswahlfelder der Treffpunkte
 * (`.fs-select`) und des Wochen-Reiters im Planen (`.sonder-select`) waren von
 * einem Zickzack-Muster überzogen, das Anlass-Feld kaum noch lesbar. Beide
 * Klassen setzten `background:` als **Kurzschreibweise**. Die setzt Bild,
 * Wiederholung und Lage mit zurück: Hell verschwand das Chevron still (und
 * fiel so niemandem auf), dunkel setzte die spezifischere Regel das Bild
 * wieder ein — mit `repeat` von der Kurzschreibweise, also gekachelt. Bei
 * `.mem-select` war genau das schon einmal passiert und dort behoben; die
 * nächste Klasse kannte die Falle nicht.
 *
 * Diese Prüfung liest deshalb, welche Klassen an einem `<select>` hängen, und
 * verlangt für jede Regel mit einer davon:
 *
 *  1. keine Kurzschreibweise `background:` — `background-color` genügt;
 *  2. wer den Innenabstand mit `padding:` neu setzt, gibt dem Chevron seinen
 *     Platz zurück (`padding-inline-end`), sonst läuft der Text darunter.
 *
 * Kein Layout wird bewiesen (jsdom rechnet keins); gesichert ist nur, dass die
 * app-weite Regel nicht von einer Klasse ausgehebelt wird.
 */

const SRC = fileURLToPath(new URL('../src', import.meta.url))

function dateien(dir: string, endung: string): Array<[string, string]> {
  const out: Array<[string, string]> = []
  for (const eintrag of readdirSync(dir, { withFileTypes: true })) {
    const pfad = join(dir, eintrag.name)
    if (eintrag.isDirectory()) out.push(...dateien(pfad, endung))
    else if (eintrag.name.endsWith(endung) && !eintrag.name.includes('.test.')) {
      out.push([relative(SRC, pfad).replaceAll('\\', '/'), readFileSync(pfad, 'utf8')])
    }
  }
  return out
}

/** Klassen, die ein `<select>` im Quelltext trägt (feste Teile des className). */
function auswahlKlassen(tsx: ReadonlyArray<[string, string]>): Set<string> {
  const klassen = new Set<string>()
  for (const [, text] of tsx) {
    for (const [, attrs] of text.matchAll(/<select\b([^>]*)>/g)) {
      const cn = attrs!.match(/className=(?:"([^"]+)"|\{`([^`]+)`\})/)
      if (!cn) continue
      const fest = (cn[1] ?? cn[2] ?? '').replace(/\$\{[^}]*\}/g, ' ')
      for (const k of fest.split(/\s+/)) if (k) klassen.add(k)
    }
  }
  return klassen
}

type Regel = { datei: string; selektor: string; rumpf: string }

function regeln(css: ReadonlyArray<[string, string]>): Regel[] {
  const out: Regel[] = []
  for (const [datei, text] of css) {
    const ohneKommentare = text.replace(/\/\*[\s\S]*?\*\//g, '')
    for (const [, selektor, rumpf] of ohneKommentare.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      out.push({ datei, selektor: selektor!.trim().replace(/\s+/g, ' '), rumpf: rumpf! })
    }
  }
  return out
}

const trifft = (selektor: string, klasse: string) =>
  new RegExp(`\\.${klasse.replace(/[-]/g, '\\-')}(?![\\w-])`).test(selektor)

/** Verstöße gegen die beiden Regeln oben, je Klasse und Regel. */
function verstoesse(klassen: Iterable<string>, alle: readonly Regel[]): string[] {
  const out: string[] = []
  for (const klasse of klassen) {
    const eigene = alle.filter((r) => trifft(r.selektor, klasse))
    const endAbstand = eigene.some((r) => /(^|[;\s])padding-inline-end\s*:/.test(r.rumpf))
    for (const r of eigene) {
      if (/(^|[;\s])background\s*:/.test(r.rumpf)) {
        out.push(`${r.datei}: ${r.selektor} setzt „background:" — das löscht das Chevron (hell) bzw. kachelt es (dunkel)`)
      }
      if (/(^|[;\s])padding\s*:/.test(r.rumpf) && !endAbstand) {
        out.push(`${r.datei}: ${r.selektor} setzt „padding:" ohne padding-inline-end — der Text läuft unter das Chevron`)
      }
    }
  }
  return out
}

describe('Auswahlfelder behalten ihr Chevron', () => {
  const tsx = dateien(SRC, '.tsx')
  const css = regeln(dateien(SRC, '.css'))
  const klassen = auswahlKlassen(tsx)

  it('keine Klasse an einem Auswahlfeld hebelt das app-weite Chevron aus', () => {
    expect(verstoesse(klassen, css)).toEqual([])
  })

  it('die app-weite Regel selbst steht noch — sonst gäbe es nichts zu schützen', () => {
    const basis = css.find((r) => r.selektor === 'select' && /background-image/.test(r.rumpf))
    expect(basis?.rumpf).toMatch(/background-repeat:\s*no-repeat/)
    expect(basis?.rumpf).toMatch(/padding-inline-end:\s*40px/)
    expect(css.some((r) => r.selektor === ':root[data-dark] select' && /background-image/.test(r.rumpf))).toBe(true)
  })

  it('die Prüfung sieht die Auswahlfelder, an denen sie entstanden ist', () => {
    // Ohne diese Zeile wäre ein zu enger Suchausdruck nicht von „alles sauber"
    // zu unterscheiden.
    for (const k of ['fs-select', 'sonder-select', 'mem-select', 'pers-grp-select']) {
      expect(klassen, k).toContain(k)
    }
  })

  it('Gegenprobe: die Kurzschreibweise wird erkannt', () => {
    const falle: Regel[] = [{ datei: 'x.css', selektor: '.fs-select', rumpf: 'background: var(--card); padding: 7px 10px;' }]
    expect(verstoesse(['fs-select'], falle)).toEqual([
      'x.css: .fs-select setzt „background:" — das löscht das Chevron (hell) bzw. kachelt es (dunkel)',
      'x.css: .fs-select setzt „padding:" ohne padding-inline-end — der Text läuft unter das Chevron',
    ])
  })

  it('Gegenprobe: background-color und ein zurückgegebener Endabstand sind in Ordnung', () => {
    const gut: Regel[] = [
      { datei: 'x.css', selektor: '.a, .b', rumpf: 'background-color: transparent; padding: 8px 10px;' },
      { datei: 'x.css', selektor: '.a', rumpf: 'padding-inline-end: 40px;' },
    ]
    expect(verstoesse(['a'], gut)).toEqual([])
  })
})
