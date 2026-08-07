import { describe, expect, it } from 'vitest'
import { endeAusStartzeit, MEETING_MINUTES } from './meeting-edit'

describe('endeAusStartzeit — Endzeit aus den Zusammenkunftszeiten', () => {
  // Der Import trug feste Werte ein (20:45 / 11:45), unabhängig von den
  // gepflegten Zeiten. Bei einem Beginn um 18:30 stand damit auf jedem
  // Programmblatt eine falsche Endzeit.
  it('rechnet Startzeit + Regeldauer', () => {
    expect(endeAusStartzeit('19:00', 'X')).toBe('Ende ca. 20:45')
    expect(endeAusStartzeit('10:00', 'X')).toBe('Ende ca. 11:45')
    expect(endeAusStartzeit('18:30', 'X')).toBe('Ende ca. 20:15')
  })

  it('bestätigt die bisherigen Festwerte — 1:45 je Zusammenkunft', () => {
    expect(MEETING_MINUTES).toBe(105)
  })

  it('ohne hinterlegte Startzeit bleibt der mitgebrachte Wert', () => {
    expect(endeAusStartzeit('', 'Ende ca. 20:45')).toBe('Ende ca. 20:45')
    expect(endeAusStartzeit('abends', 'Ende ca. 20:45')).toBe('Ende ca. 20:45')
  })
})
