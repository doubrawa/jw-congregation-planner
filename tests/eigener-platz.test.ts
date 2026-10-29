import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { deklarationen } from './css-quellen'
import { quelldateien, WURZEL } from './quelldateien'

/**
 * **Der eigene Platz im Saal zeigt den Stand der eigenen Zusage** (29.10.2026).
 *
 * Der Ring sagt „du", der Punkt darin, ob man zugesagt hat: blass, solange es
 * aussteht, rot nach einer Absage — und mit dem Bestätigen wächst die Füllung in
 * Minze aus der Mitte. Bis dahin war der Punkt immer in Minze, ob zugesagt oder
 * nicht.
 *
 * Zwei Dinge sieht jsdom nicht, deshalb stehen sie hier:
 *
 *  - **Jede Stelle mit dem Saal einer eigenen Aufgabe reicht den Stand weiter.**
 *    Es sind zwei — die große Karte und das Blatt einer Aufgabe. Fehlt er an
 *    einer, steht der Platz dort immer gefüllt da (derselbe Fehler wie beim
 *    Titel, der nur an einer Stelle trennte, 26.10.2026).
 *  - **Die Füllung ist ein Übergang, keine Animation.** Ein Übergang läuft nur
 *    beim Wechsel der Klasse; eine Animation liefe bei jedem Öffnen einer längst
 *    bestätigten Aufgabe noch einmal.
 */

const AUFRUFER = quelldateien({ orte: ['src'], endungen: ['.tsx'], ohneTests: true }).filter((pfad) =>
  readFileSync(join(WURZEL, pfad), 'utf8').includes('useSaal('),
)

describe('Der eigene Platz im Saal', () => {
  it('die große Karte und das Blatt zeichnen den Saal einer eigenen Aufgabe', () => {
    expect(AUFRUFER).toEqual(['src/aufgaben/AufgabeBlatt.tsx', 'src/aufgaben/AufgabeKarte.tsx'])
  })

  it.each(AUFRUFER)('%s reicht den Stand der Zusage an den Saal weiter', (pfad) => {
    const quelle = readFileSync(join(WURZEL, pfad), 'utf8')
    const saal = quelle.match(/<Saal\b[^>]*\/>/g) ?? []
    expect(saal).not.toHaveLength(0)
    for (const aufruf of saal) expect(aufruf).toMatch(/\bdu=\{/)
  })

  it('die Füllung wächst aus der Mitte, per Übergang — nicht per Animation', () => {
    const fuellung = deklarationen('bausteine/bausteine.css', '.saal-du-fuellung')
    expect(fuellung).toMatch(/transform:\s*scale\(0\)/)
    expect(fuellung).toMatch(/transform-box:\s*fill-box/)
    expect(fuellung).toMatch(/transform-origin:\s*center/)
    expect(fuellung).not.toMatch(/animation/)
    const voll = deklarationen('bausteine/bausteine.css', '.saal-du.is-voll .saal-du-fuellung')
    expect(voll).toMatch(/transform:\s*scale\(1\)/)
    expect(voll).toMatch(/transition:\s*transform\b/)
  })

  it('nur auf dem Weg zur Zusage — zurück springt der Punkt, statt unter null zu schwingen', () => {
    // Ein Übergang nimmt die Angabe des Ziels. Stünde er am Grundzustand, liefe
    // er auch rückwärts, und die Kurve mit Schwung (y 1,56) brächte den Maßstab
    // kurz unter null: ein gespiegelter Punkt blitzte auf (Review 29.10.2026).
    expect(deklarationen('bausteine/bausteine.css', '.saal-du-fuellung')).not.toMatch(/transition/)
  })

  it.each(AUFRUFER)('%s zeichnet je Aufgabe einen eigenen Saal — ein Wechsel der Aufgabe ist keine Zusage', (pfad) => {
    const quelle = readFileSync(join(WURZEL, pfad), 'utf8')
    for (const aufruf of quelle.match(/<Saal\b[^>]*\/>/g) ?? []) expect(aufruf).toMatch(/\bkey=\{task\.id\}/)
  })

  it('der Grund ist blass, solange die Zusage aussteht, und rot nach einer Absage', () => {
    expect(deklarationen('bausteine/bausteine.css', '.saal-du-grund')).toMatch(/fill:\s*var\(--wartet\)/)
    expect(deklarationen('bausteine/bausteine.css', '.saal-du.is-problem .saal-du-grund')).toMatch(/fill:\s*var\(--problem\)/)
  })
})
