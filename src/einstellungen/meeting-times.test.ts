import { describe, expect, it } from 'vitest'
import { timeOptions } from './meeting-times'

/*
 * Hier stand daneben `parseMeetingTimes` mit drei Fällen: „liest Wochentag und
 * Uhrzeit beider Zusammenkünfte", „verkraftet Freitext dazwischen" und „fällt
 * bei unlesbarem Text zurück". Sie beschreiben, was eine Versammlungszeit
 * einmal war — **ein Anzeigetext** („Di 19:00 · So 10:00"), aus dem drei
 * verschiedene reguläre Ausdrücke Tag und Uhrzeit zurücklasen.
 *
 * Seit dem 18. September 2026 stehen beide Termine als Werte in der
 * Versammlung (`Congregation.times`, vier Spalten). Damit gibt es nichts mehr
 * zu lesen: kein Freitext dazwischen, kein stiller Rückfall — und keinen Fall,
 * in dem die Wochenmitte die Uhrzeit des Wochenendes bekommt, weil in einem
 * der beiden Texte eine fehlte.
 */

describe('timeOptions (15-Minuten-Raster)', () => {
  it('liefert 96 Rasterzeiten, sortiert, inklusive der aktuellen', () => {
    const opts = timeOptions('19:00')
    expect(opts).toHaveLength(96)
    expect(opts).toContain('00:00')
    expect(opts).toContain('23:45')
    expect([...opts].sort()).toEqual(opts)
  })

  it('eine krumme Bestandszeit bleibt als zusätzlicher Eintrag wählbar', () => {
    const opts = timeOptions('19:10')
    expect(opts).toHaveLength(97)
    expect(opts).toContain('19:10')
    expect([...opts].sort()).toEqual(opts)
  })
})
