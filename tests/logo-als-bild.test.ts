/** @vitest-environment jsdom */
// jsdom, nicht happy-dom wie die übrigen Proben: Nur jsdom liest XML so streng
// wie der Browser. happy-dom nimmt den fehlerhaften Kommentar hin, und die
// Probe prüfte nichts.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * **Die SVG-Dateien in `public/` lassen sich als Bild laden.**
 *
 * `logo-klein.svg` ist das Favicon, `logo.svg` die Quelle der App-Icons. Als
 * Bild liest der Browser eine SVG-Datei als XML, und das ist strenger als das
 * HTML der App: Ein einziger Verstoß, und er zeichnet die Datei nicht — ohne
 * Fehlermeldung. Zwei Bindestriche hintereinander in einem Kommentar genügen
 * dafür, etwa der Name eines CSS-Tokens.
 *
 * Auffallen muss das nicht: `index.html` nennt neben dem SVG einen PNG-Ersatz,
 * und `make-icons.mjs` bettet das SVG in eine HTML-Seite ein, wo die Regel
 * nicht gilt.
 */

// Über das Arbeitsverzeichnis, nicht über `import.meta.url`: Unter jsdom ist
// das keine Datei-URL.
const PUBLIC = join(process.cwd(), 'public')

/** Jede SVG-Datei, die unverändert ausgeliefert wird — nicht nur die, die es heute gibt. */
const DATEIEN = readdirSync(PUBLIC).filter((datei) => datei.endsWith('.svg'))

/** Was der XML-Leser beanstandet — `null`, wenn die Datei wohlgeformt ist. */
function xmlFehler(svg: string): string | null {
  const dokument = new DOMParser().parseFromString(svg, 'image/svg+xml')
  return dokument.querySelector('parsererror')?.textContent ?? null
}

describe('Die SVG-Dateien als Bild', () => {
  it('die beiden Logo-Dateien sind unter den geprüften', () => {
    // Sonst liefen die Fälle darunter über eine leere Liste und wären grün.
    expect(DATEIEN).toEqual(expect.arrayContaining(['logo.svg', 'logo-klein.svg']))
  })

  it.each(DATEIEN)('%s ist wohlgeformtes XML mit <svg> als Wurzel', (datei) => {
    const svg = readFileSync(join(PUBLIC, datei), 'utf8')
    expect(xmlFehler(svg)).toBeNull()
    expect(new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement.nodeName).toBe('svg')
  })

  it('ein Token-Name im Kommentar machte die Datei unlesbar', () => {
    // Die Gegenprobe: Ohne sie wäre die Probe oben auch mit einem Leser grün,
    // der nichts beanstandet.
    const svg = readFileSync(join(PUBLIC, 'logo-klein.svg'), 'utf8')
    expect(xmlFehler(svg.replace('<svg', '<!-- Pult in --akzent -->\n<svg'))).not.toBeNull()
  })
})
