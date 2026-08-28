import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * **Das Layout spiegelt sich — geprüft an den Eigenschaften, die es tun müssen.**
 *
 * Vier der 34 App-Sprachen laufen von rechts nach links (`isRTL`): Arabisch,
 * Hebräisch, Persisch, Urdu. Die App setzt dafür `dir="rtl"` am `<html>`, und
 * der Browser spiegelt daraufhin **alles, was logisch angegeben ist** —
 * `margin-inline-start`, `inset-inline-end`, `text-align: start`. Was physisch
 * dasteht (`margin-left`, `right: 12px`, `text-align: left`), bleibt stehen,
 * wo es steht.
 *
 * Das fällt in keinem Test auf: jsdom rechnet kein Layout, und ein Screenshot
 * in einer RTL-Sprache gehört nicht zum Lauf. Gefunden wurde es am 28.8.2026
 * beim Durchsehen — die Navigationspunkte in der Seitenleiste klebten in der
 * arabischen Fassung am linken Rand, obwohl die Leiste selbst rechts saß, und
 * der Wochenstreifen legte die **vorige** Woche auf die Seite, von der der
 * Leser die nächste erwartet.
 *
 * Diese Prüfung liest deshalb das CSS selbst. Sie erlaubt physische Angaben nur
 * dort, wo sie **keine Richtung** meinen — und verlangt für jede einen Grund.
 */

const CSS_WURZEL = fileURLToPath(new URL('../src', import.meta.url))

/** Alle `.css` unter `src/`, mit Pfad relativ zur Wurzel. */
function cssDateien(dir = CSS_WURZEL): Array<[string, string]> {
  const out: Array<[string, string]> = []
  for (const eintrag of readdirSync(dir, { withFileTypes: true })) {
    const pfad = join(dir, eintrag.name)
    if (eintrag.isDirectory()) out.push(...cssDateien(pfad))
    else if (eintrag.name.endsWith('.css')) {
      out.push([relative(CSS_WURZEL, pfad).replaceAll('\\', '/'), readFileSync(pfad, 'utf8')])
    }
  }
  return out
}

const DATEIEN = cssDateien()

/** Eigenschaften, die eine Seite benennen und deshalb gespiegelt werden müssen. */
const RICHTUNGS_EIGENSCHAFTEN =
  /(^|[\s;{])((margin|padding|border|scroll-margin|scroll-padding)-(left|right)|left|right|text-align|float|clear)\s*:\s*([^;}]+)/g

type Grund =
  /**
   * **Keine Richtung, sondern Mitte.** `left: 50%` zusammen mit
   * `translateX(-50%)` zentriert; `margin-left/right: auto` ebenso. Beides sieht
   * gespiegelt genauso aus.
   */
  | 'zentriert'

/** Ausnahmen: Datei → Wert, der dort stehen darf, mit Grund. */
const ERLAUBT: Record<string, Record<string, Grund>> = {
  'app/shell.css': { 'left: 50%': 'zentriert' },
  'components/components.css': { 'left: 50%': 'zentriert' },
  'components/overlays.css': { 'left: 50%': 'zentriert' },
  'planen/planen.css': { 'left: 50%': 'zentriert' },
  'login/login.css': { 'margin-left: auto': 'zentriert', 'margin-right: auto': 'zentriert' },
}

/** Jede physische Richtungsangabe einer Datei, normiert als „prop: wert". */
function physische(inhalt: string): string[] {
  const out: string[] = []
  for (const treffer of inhalt.matchAll(RICHTUNGS_EIGENSCHAFTEN)) {
    const prop = treffer[2] ?? ''
    const wert = (treffer[5] ?? '').trim()
    // `text-align: start/end/center` ist bereits logisch; nur left/right zählen.
    if (prop === 'text-align' && !/^(left|right)$/.test(wert)) continue
    out.push(`${prop}: ${wert}`)
  }
  return out
}

describe('Kein physischer Richtungswert ohne Grund', () => {
  it.each(DATEIEN.map(([pfad]) => pfad))('%s', (pfad) => {
    const inhalt = DATEIEN.find(([p]) => p === pfad)?.[1] ?? ''
    const erlaubt = ERLAUBT[pfad] ?? {}
    const gefunden = physische(inhalt).filter((eintrag) => !(eintrag in erlaubt))
    expect(gefunden, `${pfad}: ${gefunden.join(' | ')}`).toEqual([])
  })

  it('die Prüfung findet physische Angaben auch wirklich', () => {
    // Ohne diese Zeile wäre ein zu enger Ausdruck von „alles logisch" nicht zu
    // unterscheiden — und genau so legt sich eine Quelltext-Prüfung still.
    expect(physische('.x { margin-left: 4px; }')).toEqual(['margin-left: 4px'])
    expect(physische('.x { text-align: left; }')).toEqual(['text-align: left'])
    expect(physische('.x { right: 12px; }')).toEqual(['right: 12px'])
    // Logische Schreibweisen dagegen nicht.
    expect(physische('.x { margin-inline-start: 4px; text-align: start; }')).toEqual([])
    expect(physische('.x { inset-inline-end: 12px; }')).toEqual([])
  })

  it('jede Ausnahme steht auch wirklich noch im CSS', () => {
    // Ein Eintrag, den es nicht mehr gibt, deckt still ab, was er nicht meint.
    const tot: string[] = []
    for (const [pfad, werte] of Object.entries(ERLAUBT)) {
      const inhalt = DATEIEN.find(([p]) => p === pfad)?.[1]
      if (inhalt === undefined) {
        tot.push(`${pfad} (Datei fehlt)`)
        continue
      }
      const da = physische(inhalt)
      for (const wert of Object.keys(werte)) {
        if (!da.includes(wert)) tot.push(`${pfad}: ${wert}`)
      }
    }
    expect(tot).toEqual([])
  })

  it('und jede Ausnahme trägt einen Grund, den es gibt', () => {
    const gruende = new Set<Grund>(['zentriert'])
    const ohne: string[] = []
    for (const [pfad, werte] of Object.entries(ERLAUBT)) {
      for (const [wert, grund] of Object.entries(werte)) {
        if (!gruende.has(grund)) ohne.push(`${pfad}: ${wert}`)
      }
    }
    expect(ohne).toEqual([])
  })

  it('es gibt überhaupt CSS zu prüfen', () => {
    expect(DATEIEN.length).toBeGreaterThan(8)
  })
})

/**
 * **Gezeichnete Pfeile drehen sich nicht von selbst — und nur einmal.**
 *
 * Die Glyphen ‹ › im Fließtext dreht der Browser in einem RTL-Absatz selbst um
 * (Unicode führt sie als spiegelbar). Ein SVG-Pfad ist dagegen Geometrie: Er
 * zeigt dorthin, wo er hinzeigt. Deshalb kippt `app/rtl.css` die Wochen-Pfeile
 * und den Zurück-Chevron, `datepicker.css` die Monatspfeile.
 *
 * **Genau einmal.** Beim Durchsehen am 28.8.2026 kam versuchsweise eine zweite
 * Regel auf die gemeinsame Klasse `.chev` dazu — und drehte damit alles ein
 * zweites Mal zurück. Der Vergleich zweier Aufnahmen mit und ohne sie zeigte es;
 * kein Test hätte es gesagt, denn jsdom rechnet kein Layout.
 *
 * Diese Prüfung hält deshalb beides fest: dass es die Regeln gibt — und dass es
 * sie **nur an einer Stelle** gibt.
 */
describe('Richtungsabhängige Pfeile werden gespiegelt', () => {
  const inhalt = (pfad: string) => DATEIEN.find(([p]) => p === pfad)?.[1] ?? ''

  it('die Wochen-Pfeile und der Zurück-Chevron kippen in RTL', () => {
    const rtl = inhalt('app/rtl.css')
    expect(rtl).toMatch(/\[dir=['"]rtl['"]\]\s*\.week-arrow\s*\{[^}]*transform:\s*scaleX\(-1\)/)
    expect(rtl).toMatch(/\[dir=['"]rtl['"]\]\s*\.pers-back-chev\s*\{[^}]*transform:\s*scaleX\(-1\)/)
  })

  it('die Monatspfeile der Datumsauswahl ebenso', () => {
    const dp = inhalt('components/datepicker.css')
    expect(dp).toMatch(/\[dir=['"]rtl['"]\]\s*\.dp-nav\s*\{[^}]*transform:\s*scaleX\(-1\)/)
  })

  it('und **niemand** kippt zusätzlich die gemeinsame Klasse `.chev`', () => {
    // Das wäre die zweite Drehung: `.week-arrow` und `.dp-nav` enthalten je ein
    // `.chev`. Wer beides kippt, hat wieder die Ausgangslage.
    for (const [pfad, text] of DATEIEN) {
      expect(text, `${pfad} kippt .chev ein zweites Mal`).not.toMatch(
        /\[dir=['"]rtl['"]\]\s*\.chev\s*\{/,
      )
    }
  })

  it('die Klassen, die gemeint sind, werden auch vergeben', () => {
    // Sonst hinge eine Regel in der Luft — dieselbe Falle wie bei den
    // Wochen-Nachbarn, deren Klassen einmal als „tot" entfernt wurden.
    const quelle = (rel: string) =>
      readFileSync(fileURLToPath(new URL(`../src/${rel}`, import.meta.url)), 'utf8')
    expect(quelle('components/WeekNav.tsx')).toContain('week-arrow')
    expect(quelle('personen/PersonDetail.tsx')).toContain('pers-back-chev')
    expect(quelle('components/DatePicker.tsx')).toContain('dp-nav')
    // Und der Pfeil ist wirklich seitenabhängig — sonst gäbe es nichts zu drehen.
    expect(quelle('components/Chevron.tsx')).toMatch(/dir === 'prev'/)
  })
})
