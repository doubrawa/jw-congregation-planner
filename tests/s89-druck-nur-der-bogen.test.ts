import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * **Im S-89-Druck kommt nur der Bogen aufs Papier.**
 *
 * `print-s89.css` blendet im Planen alles außer dem Bogen aus — innerhalb des
 * Bildschirms über `.screen > *`, und was außerhalb fest am Rand steht, eigens:
 * Kopfzeile, Leisten des Menüs, Blätter, die Meldung. Seit T121 (Phase 5c)
 * kommt die Aktionsleiste des Planens dazu: Sie steht am Handy außerhalb des
 * Wochenstreifens und damit außerhalb von `.screen` — ohne eigene Zeile stünde
 * die dunkle Pille unter den Zetteln.
 *
 * Liest das Stylesheet als Text (ohne Kommentare), deshalb unter `tests/`;
 * jsdom kennt weder Medien noch Stylesheets.
 */

const css = readFileSync(fileURLToPath(new URL('../src/planen/print-s89.css', import.meta.url)), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
)

/** Steht der Selektor für sich in der Liste — nicht nur als Anfang eines längeren (`.sheet` in `.sheet-backdrop`)? */
const blendetAus = (klasse: string): boolean =>
  [',', ' {', '{'].some((danach) => css.includes(`:root[data-print='s89'] ${klasse}${danach}`))

describe('Was der S-89-Druck neben dem Bildschirm ausblendet', () => {
  it.each(['.planen-leiste', '.kopfzeile', '.leiste', '.schmale-leiste', '.sheet', '.toast'])('%s', (klasse) => {
    expect(blendetAus(klasse)).toBe(true)
  })
})
