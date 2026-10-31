import { describe, expect, it } from 'vitest'
import { bibelbuecherGeladen, bibelbuecherLaden, makeTr } from './translate'
import { dict, loadOverlay } from './ui'

/**
 * **Wörterbuch und Übersetzer entstehen je Sprache einmal — und was danach
 * nachgeladen wird, gilt trotzdem sofort** (31.10.2026).
 *
 * `dict` und `makeTr` bauten bei jedem Aufruf neu, und jeder Baustein mit
 * `useT` ruft sie beim Einhängen: ein Wörterbuch aus über tausend Schlüsseln,
 * ein Übersetzer samt Ausdruck aus allen Bibelbüchern. Jetzt bleiben beide je
 * Sprache liegen. Die Gefahr dabei: Ein Overlay oder die Bibelbücher kommen
 * erst später (Code-Splitting) — bliebe das schon Gebaute stehen, sähe man bis
 * zum Neuladen die englische Rückfallschicht oder deutsche Buchnamen.
 *
 * Eine eigene Datei, weil nur hier noch nichts geladen ist: Die übrigen Proben
 * laden Overlays und Bücher gleich zu Beginn.
 */
describe('Was nachgeladen wird, gilt sofort', () => {
  it('ein Sprach-Overlay — auch für eine Sprache, deren Wörterbuch schon gebaut war', async () => {
    const vorher = dict('uk')
    expect(vorher.laedt, 'vor dem Laden: die englische Rückfallschicht').toBe(dict('en').laedt)
    // Die Voraussetzung der Probe: Es wird wirklich nur einmal gebaut.
    expect(dict('uk')).toBe(vorher)
    await loadOverlay('uk')
    expect(dict('uk').laedt).not.toBe(dict('en').laedt)
  })

  it('die Bibelbücher — auch für einen Übersetzer, der schon gebaut war', async () => {
    expect(bibelbuecherGeladen()).toBe(false)
    const vorher = makeTr('en')
    expect(vorher('Jeremia 32–33'), 'vor dem Laden bleibt das Buch deutsch').toBe('Jeremia 32–33')
    expect(makeTr('en')).toBe(vorher)
    await bibelbuecherLaden()
    expect(makeTr('en')('Jeremia 32–33')).toBe('Jeremiah 32–33')
  })
})
