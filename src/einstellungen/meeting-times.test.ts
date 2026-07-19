import { describe, expect, it } from 'vitest'
import { parseMeetingTimes, timeOptions } from './meeting-times'

describe('parseMeetingTimes (kanonischer String "Di 19:00 · So 10:00")', () => {
  it('liest Wochentag und Uhrzeit beider Zusammenkünfte', () => {
    expect(parseMeetingTimes('Di 19:00 · So 10:00')).toEqual([
      { day: 'Di', time: '19:00' },
      { day: 'So', time: '10:00' },
    ])
  })

  it('verkraftet Freitext dazwischen und stellt einstellige Stunden auf HH:MM', () => {
    expect(parseMeetingTimes('immer Fr 9:30 und dann So 10:00 Uhr')).toEqual([
      { day: 'Fr', time: '09:30' },
      { day: 'So', time: '10:00' },
    ])
  })

  it('fällt bei unlesbarem Text auf Di 19:00 / So 10:00 zurück', () => {
    expect(parseMeetingTimes('dienstags abends')).toEqual([
      { day: 'Di', time: '19:00' },
      { day: 'So', time: '10:00' },
    ])
    // nur eine Zeit erkennbar → zweite bleibt Standard
    expect(parseMeetingTimes('Mi 18:45')[1]).toEqual({ day: 'So', time: '10:00' })
  })
})

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
