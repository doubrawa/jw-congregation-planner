import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * **Im Druck eines Bogens kommt nur der Bogen aufs Papier** (T121, Phase 9).
 *
 * Bis Phase 9 stand der S-89-Bogen unsichtbar mitten im Planen, und sein
 * Regelwerk musste alles um ihn herum einzeln ausblenden: den Bildschirm über
 * `.screen > *`, dazu Kopfzeile, Leisten des Menüs, Blätter, die Meldung und
 * die Aktionsleiste des Planens — jede vergessene Fläche stand mit auf dem
 * Papier. Seit die Bögen per Portal direkt unter `body` hängen
 * (`useDruckBogen`), genügt **eine** Regel: alles unter `body`, was nicht der
 * Bogen ist. Diese Probe hält sie fest — fehlte sie, druckte jeder Bogen die
 * ganze App mit.
 *
 * Liest das Stylesheet als Text (ohne Kommentare), deshalb unter `tests/`;
 * jsdom kennt weder Medien noch Stylesheets.
 */

const css = readFileSync(fileURLToPath(new URL('../src/druck/druck-bogen.css', import.meta.url)), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
)

/** Der Inhalt von `@media print { … }` bis zur passenden Klammer. */
function druckRegeln(text: string): string {
  const start = text.indexOf('@media print')
  const auf = text.indexOf('{', start)
  let tiefe = 0
  for (let i = auf; start >= 0 && i < text.length; i++) {
    if (text[i] === '{') tiefe++
    else if (text[i] === '}' && --tiefe === 0) return text.slice(auf + 1, i)
  }
  return ''
}

describe('Was der Druck eines Bogens ausblendet', () => {
  const druck = druckRegeln(css)

  it('alles unter body, was nicht der Bogen ist — mit einer Regel', () => {
    expect(druck).toMatch(/:root\[data-print='bogen'\] body > :not\(\.druck-bogen\)\s*\{\s*display:\s*none !important;/)
  })

  it('und der Bogen selbst erscheint — am Bildschirm ist er aus', () => {
    expect(css).toMatch(/\.druck-bogen\s*\{\s*display:\s*none;/)
    expect(druck).toMatch(/:root\[data-print='bogen'\] \.druck-bogen\s*\{\s*display:\s*block !important;/)
  })
})
