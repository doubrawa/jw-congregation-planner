import { describe, expect, it } from 'vitest'
import {
  ALTE_DUNKLE_SCHEMATA,
  asFontScale,
  asTheme,
  DEFAULT_FONT_SCALE,
  DEFAULT_THEME,
  farbModus,
  FONT_SCALES,
  THEME_LIST,
} from './constants'

describe('asFontScale', () => {
  it('akzeptiert jede bekannte Stufe (als Zahl und als String)', () => {
    for (const s of FONT_SCALES) {
      expect(asFontScale(s)).toBe(s)
      expect(asFontScale(String(s))).toBe(s)
    }
  })

  it('lehnt Unbekanntes ab (null → Aufrufer setzt Standard)', () => {
    expect(asFontScale('1.1')).toBeNull() // Zwischenwert, nicht auf der Skala
    expect(asFontScale('2')).toBeNull()
    expect(asFontScale('quatsch')).toBeNull()
    expect(asFontScale(null)).toBeNull()
    expect(asFontScale(undefined)).toBeNull()
  })

  it('Standard-Stufe ist 1 (unveränderter Auslieferungszustand)', () => {
    expect(DEFAULT_FONT_SCALE).toBe(1)
    expect(FONT_SCALES).toContain(DEFAULT_FONT_SCALE)
  })

  it('bietet eine kleinere und mehrere größere Stufen als den Standard', () => {
    const kleiner = FONT_SCALES.filter((s) => s < DEFAULT_FONT_SCALE)
    const groesser = FONT_SCALES.filter((s) => s > DEFAULT_FONT_SCALE)
    expect(kleiner.length).toBeGreaterThanOrEqual(1)
    expect(groesser.length).toBeGreaterThanOrEqual(2)
  })
})

describe('Darstellung (T121)', () => {
  it('Hell und Dunkel gelten fest, „Automatisch" folgt dem Gerät', () => {
    expect(farbModus('hell', true)).toBe('hell')
    expect(farbModus('dunkel', false)).toBe('dunkel')
    expect(farbModus('auto', true)).toBe('dunkel')
    expect(farbModus('auto', false)).toBe('hell')
  })

  it('asTheme kennt die drei — und von den alten Schemata nur, ob sie dunkel waren', () => {
    for (const { key } of THEME_LIST) expect(asTheme(key)).toBe(key)
    for (const alt of ALTE_DUNKLE_SCHEMATA) expect(asTheme(alt), alt).toBe('dunkel')
    // Die hellen fallen auf den Standard des Aufrufers.
    expect(asTheme('weiss')).toBeNull()
    expect(asTheme('kontrast')).toBeNull()
    expect(asTheme(null)).toBeNull()
    expect(DEFAULT_THEME).toBe('auto')
  })
})
