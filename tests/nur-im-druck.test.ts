import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * **Was nur dem Ausdruck gehört, erscheint dort auch.**
 *
 * Der Kopf des Blatts (Versammlung, Thema), die Fußzeile („Stand: …") und der
 * eigene Name statt „Du" stehen im DOM, sind am Bildschirm aber ausgeblendet.
 * Eine Regel ohne Medienabfrage gilt auch auf dem Papier — im Druck muss
 * `print.css` sie deshalb ausdrücklich wieder einblenden.
 *
 * Genau das fehlte nach dem Umbau der Ansicht (T121, Phase 4a): Die Fußzeile
 * verschwand vom Bildschirm, wie gewollt, und still auch vom Ausdruck. Kein
 * Test merkte es — jsdom kennt weder Medien noch Stylesheets, und im DOM stand
 * die Fußzeile wie zuvor.
 *
 * Liest die Stylesheets als Text, deshalb unter `tests/` (siehe
 * `css-klassen.test.ts`).
 */

const NUR_IM_DRUCK = ['prog-print-head', 'prog-footer', 'nur-druck']

function lies(pfad: string): string {
  return readFileSync(fileURLToPath(new URL('../' + pfad, import.meta.url)), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
}

/** Der Inhalt von `@media print { … }` bis zur passenden Klammer — und der Rest der Datei. */
function teilen(css: string): { druck: string; sonst: string } {
  const start = css.indexOf('@media print')
  const auf = css.indexOf('{', start)
  let tiefe = 0
  for (let i = auf; start >= 0 && i < css.length; i++) {
    if (css[i] === '{') tiefe++
    else if (css[i] === '}' && --tiefe === 0) {
      return { druck: css.slice(auf + 1, i), sonst: css.slice(0, start) + css.slice(i + 1) }
    }
  }
  return { druck: '', sonst: css }
}

/**
 * Der `display`-Wert, den eine Regel genau für diese Klasse setzt (Selektor
 * `.klasse`, auch in einer Liste) — bei mehreren die letzte, wie im Browser.
 */
function display(css: string, klasse: string): string | undefined {
  let wert: string | undefined
  for (const [, selektoren = '', rumpf = ''] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!selektoren.split(',').some((s) => s.trim() === `.${klasse}`)) continue
    const gesetzt = /display:\s*([^;!]+)/.exec(rumpf)?.[1]?.trim()
    if (gesetzt) wert = gesetzt
  }
  return wert
}

const programm = lies('src/programm/programm.css')
const druckCss = teilen(lies('src/programm/print.css'))
const bildschirm = programm + druckCss.sonst

describe('Nur im Ausdruck: am Bildschirm aus, auf dem Papier da', () => {
  it.each(NUR_IM_DRUCK)('.%s ist am Bildschirm ausgeblendet', (klasse) => {
    // Sonst gehörte die Klasse nicht in diese Liste.
    expect(display(bildschirm, klasse)).toBe('none')
  })

  it.each(NUR_IM_DRUCK)('.%s blendet der Druck wieder ein', (klasse) => {
    const imDruck = display(druckCss.druck, klasse)
    expect(imDruck, `@media print setzt für .${klasse} kein display — es bliebe beim „none" des Bildschirms`).toBeDefined()
    expect(imDruck).not.toBe('none')
  })
})
