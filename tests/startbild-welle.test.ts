import { describe, expect, it } from 'vitest'
import { deklarationen } from './css-quellen'

/**
 * **Die Welle im Startbild** (19.10.2026, Entwurf „B · Welle durch die Reihen").
 *
 * Solange die App lädt, läuft Minze vom Pult durch die drei Reihen des Logos,
 * wie das Wort vom Pult in den Saal (`Startbild.tsx`). Drei Regeln halten sie
 * ruhig genug:
 *
 *  - **Erst nach einer Pause.** Ist die App nach ein paar hundert Millisekunden
 *    da, bleibt es beim ruhigen Bild, wie Android es zeigte — eine Welle, die
 *    gerade anfängt und abbricht, wäre ein Zucken.
 *  - **Reihe für Reihe, von vorn nach hinten.** Sonst blinkte das Logo als
 *    Ganzes, statt dass etwas vom Pult ausgeht.
 *  - **Ohne Bewegung steht sie still**, und das Wort „Lädt …" erscheint
 *    darunter — nach einer Pause, damit es bei schneller App nicht aufblitzt.
 *
 * jsdom rechnet kein CSS, und unter vitest kommt es leer an. Gesichert ist
 * hier, dass die Regeln dastehen, die es im Browser richten.
 */

const DATEI = 'app/shell.css'

/** Zeitangaben einer Deklaration in Millisekunden, in ihrer Reihenfolge. */
function zeiten(wert: string): number[] {
  return [...wert.matchAll(/(\d+(?:\.\d+)?)(ms|s)\b/g)].map(([, zahl, einheit]) => Number(zahl) * (einheit === 's' ? 1000 : 1))
}

/** Der Wert einer Eigenschaft in einer Regel. */
function wert(regel: string, eigenschaft: string): string {
  return new RegExp(`^\\s*${eigenschaft}:\\s*([^;]+);`, 'm').exec(regel)?.[1]?.trim() ?? ''
}

// Nur im Startbild der App: Das aus index.html steht still (sonst begänne die
// Welle beim Wechsel zu React mit einem Ruck von vorn).
const REIHE = '.startbild-welle .logo-platz'

describe('Die Welle durch die Reihen', () => {
  const animation = wert(deklarationen(DATEI, REIHE, '/* Die Welle'), 'animation')

  it('läuft immer wieder — solange geladen wird, nicht nur einmal', () => {
    expect(animation).toMatch(/^startbild-welle\b/)
    expect(animation).toMatch(/\binfinite\b/)
  })

  it('beginnt erst nach mindestens 300 ms — vorher steht das ruhige Bild wie bei Android', () => {
    // In `animation` ist die erste Zeitangabe die Dauer, die zweite die Pause.
    const [, pause = 0] = zeiten(animation)
    expect(pause, animation).toBeGreaterThanOrEqual(300)
  })

  it('geht Reihe für Reihe nach hinten — jede später als die davor', () => {
    const [, erste = 0] = zeiten(animation)
    const zweite = zeiten(wert(deklarationen(DATEI, `${REIHE}:nth-of-type(2)`), 'animation-delay'))[0] ?? 0
    const dritte = zeiten(wert(deklarationen(DATEI, `${REIHE}:nth-of-type(3)`), 'animation-delay'))[0] ?? 0
    expect(zweite).toBeGreaterThan(erste)
    expect(dritte).toBeGreaterThan(zweite)
  })

  it('wechselt zwischen der Farbe der Plätze und der des Pults — und kehrt dazu zurück', () => {
    const keyframes = '@keyframes startbild-welle {'
    expect(wert(deklarationen(DATEI, '12%', keyframes), 'fill')).toBe('var(--start-pult)')
    expect(wert(deklarationen(DATEI, '100%', keyframes), 'fill')).toBe('var(--start-platz)')
  })
})

describe('Ohne Bewegung', () => {
  it('steht die Welle still: Die Regel für „Bewegung reduzieren" kürzt jede Animation auf einen Durchlauf', () => {
    const regel = deklarationen(DATEI, '*::after', '@media (prefers-reduced-motion: reduce) {\n  *,')
    expect(wert(regel, 'animation-duration')).toBe('0.01ms !important')
    expect(wert(regel, 'animation-iteration-count')).toBe('1 !important')
  })

  it('erscheint das Wort darunter — nach einer Pause, und bis dahin unsichtbar', () => {
    // Zwei Klassen: Die Regel hebt `.sr-only` auf, gleich in welcher
    // Reihenfolge die Dateien laden (das Wort trägt beide Klassen).
    const regel = deklarationen(DATEI, '.startbild .startbild-text', '@media (prefers-reduced-motion: reduce) {\n  .startbild .startbild-text')
    const zeigen = wert(regel, 'animation')
    const [, pause = 0] = zeiten(zeigen)
    expect(pause, zeigen).toBeGreaterThanOrEqual(500)
    expect(zeigen).toMatch(/\b(both|backwards)\b/)
    // Was `.sr-only` verbirgt, hebt die Regel auf.
    const verborgen = deklarationen('index.css', '.sr-only')
    for (const eigenschaft of ['position', 'width', 'height', 'margin', 'overflow', 'clip', 'white-space']) {
      expect(wert(verborgen, eigenschaft), `.sr-only setzt ${eigenschaft}`).not.toBe('')
      expect(wert(regel, eigenschaft), `${eigenschaft} wieder sichtbar`).not.toBe('')
    }
  })

  it('steht in der Zeile unter dem Logo — das Logo bleibt in der Mitte, auch bei ungleichen sicheren Rändern', () => {
    // Drei Zeilen, die äußeren gleich: Das Logo steht genau zwischen den
    // sicheren Rändern, das Wort oben in der Zeile darunter. Bis zum
    // 19.10.2026 stand es absolut bei 50 % + 70 px — der Hälfte des ganzen
    // Bilds, nicht der Mitte zwischen den Rändern.
    expect(wert(deklarationen(DATEI, '.startbild'), 'grid-template-rows')).toBe('minmax(0, 1fr) auto minmax(0, 1fr)')
    expect(wert(deklarationen(DATEI, '.startbild-logo'), 'grid-row')).toBe('2')
    const regel = deklarationen(DATEI, '.startbild .startbild-text', '@media (prefers-reduced-motion: reduce) {\n  .startbild .startbild-text')
    expect(wert(regel, 'grid-row')).toBe('3')
    expect(wert(regel, 'align-self')).toBe('start')
  })
})
