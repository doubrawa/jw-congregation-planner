import { describe, expect, it } from 'vitest'
import { asFontScale, DEFAULT_FONT_SCALE, FONT_SCALES, isDarkTheme } from './constants'

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

describe('isDarkTheme', () => {
  it('erkennt dunkle Paletten', () => {
    expect(isDarkTheme('graphit')).toBe(true)
    expect(isDarkTheme('weiss')).toBe(false)
  })
})
