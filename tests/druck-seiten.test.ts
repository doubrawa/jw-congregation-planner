import { describe, expect, it } from 'vitest'
import { cssDateien, cssRegeln } from './css-quellen'

/**
 * **Jeder Druck auf sein Papier** (25.10.2026).
 *
 * Eine `@page` ohne Namen gilt für jeden Druck der App, gleich, aus welcher
 * Datei sie kommt. Standen zwei davon mit `size` im Bündel, entschied die
 * Reihenfolge: Zuletzt stand die des Bildschirmdrucks (`programm/print.css`,
 * `size: portrait`), und Chrome nahm das Papier aus ihr statt aus der A4-Seite
 * der Bögen (`@page bogen`). Der Wochenbogen (1122 px hoch) kam als Letter auf
 * zwei Seiten heraus, der Monat auf sechs statt drei, sechs Anmeldezettel auf
 * zwei — gemessen per `Page.printToPDF`; keine Probe sah es.
 *
 * Deshalb gibt nur eine **benannte** Seite Papier vor, und jedes Blatt nennt
 * seine. Dazu die Leserichtung: Lief der Behälter der Blätter rechts-nach-links,
 * hängte Chrome eine leere Seite an — Arabisch und Persisch druckten die Woche
 * auf zwei Seiten, auch mit leerem Blatt.
 *
 * Liest das CSS als Text (ohne Kommentare); jsdom kennt weder Seiten noch Druck.
 */

interface SeitenRegel {
  datei: string
  /** Leer bei einer Seite ohne Namen — die gilt für jeden Druck. */
  name: string
  rumpf: string
}

/** Alle `@page`-Regeln der App, auch die in `@media print`. */
function seitenRegeln(): SeitenRegel[] {
  return cssDateien().flatMap(([datei, css]) =>
    [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/@page\s*([\w-]*)[^{]*\{([^}]*)\}/g)].map((m) => ({
      datei,
      name: m[1] ?? '',
      rumpf: m[2] ?? '',
    })),
  )
}

const hatPapier = (rumpf: string) => /(^|;)\s*size\s*:/.test(rumpf)

/** Der Wert einer Eigenschaft in den Regeln mit genau diesem Selektor, über alle Dateien. */
function wert(selektor: string, eigenschaft: string): string[] {
  return cssDateien().flatMap(([, css]) =>
    cssRegeln(css)
      .filter((r) => r.selektoren.includes(selektor))
      .flatMap((r) => r.deklarationen.filter(([e]) => e === eigenschaft).map(([, w]) => w)),
  )
}

describe('Papier kommt nur aus benannten Seiten', () => {
  const regeln = seitenRegeln()

  it('die Probe findet die Seiten der Bögen, der Zettel und des Bildschirmdrucks — sonst prüfte sie nichts', () => {
    expect(new Set(regeln.map((r) => r.name))).toEqual(new Set(['bogen', 'zettel', '']))
  })

  it('eine Seite ohne Namen gibt kein Papier vor — sie gälte für jeden Druck', () => {
    expect(regeln.filter((r) => !r.name && hatPapier(r.rumpf)).map((r) => r.datei)).toEqual([])
  })

  it('jede benannte Seite legt ihr Papier fest', () => {
    for (const r of regeln.filter((r) => r.name)) expect(hatPapier(r.rumpf), `@page ${r.name} in ${r.datei}`).toBe(true)
  })

  it('jedes Blatt nennt seine Seite: Bogen, S-89, Anmeldezettel', () => {
    expect(wert('.druck-blatt', 'page')).toEqual(['bogen'])
    expect(wert('.s89-blatt', 'page')).toEqual(['bogen'])
    expect(wert('.anmelde-seite', 'page')).toEqual(['zettel'])
  })
})

describe('Rechts-nach-links: der Behälter der Blätter nicht, die Blätter schon', () => {
  it('der Behälter läuft links-nach-rechts, jedes Blatt in seiner Sprache', () => {
    expect(wert('.druck-bogen', 'direction')).toEqual(['ltr'])
    // Als Text: `cssRegeln` blendet Zeichenketten aus, auch das `'rtl'` im Selektor.
    const bogenCss = (cssDateien().find(([datei]) => datei === 'druck/druck-bogen.css')?.[1] ?? '').replace(/\/\*[\s\S]*?\*\//g, '')
    expect(bogenCss).toMatch(/\.druck-bogen\[dir='rtl'\]\s*>\s*\*\s*\{[^}]*\bdirection:\s*rtl\s*;/)
  })
})
