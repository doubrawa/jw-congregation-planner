import { describe, expect, it } from 'vitest'
import { welcomeDecision } from './welcome'

describe('welcomeDecision', () => {
  it('begrüßt mit dem Vornamen der angemeldeten Person', () => {
    expect(welcomeDecision(true, 'ready', 'Jürgen')).toEqual({ name: 'Jürgen' })
  })

  it('wartet, solange die Daten noch laden', () => {
    // Genau hier lag der Prototyp-Fehler: begrüßt wurde sofort beim Anmelden,
    // als der Name noch gar nicht feststand — deshalb ein fest verdrahteter.
    expect(welcomeDecision(true, 'loading', undefined)).toBe('warten')
    expect(welcomeDecision(true, 'loading', 'Jürgen')).toBe('warten')
  })

  it('ohne Vormerkung passiert nichts', () => {
    // Wichtig für die wiederhergestellte Sitzung beim App-Start: sie meldet
    // ebenfalls „login", soll aber nicht jedes Mal begrüßen.
    expect(welcomeDecision(false, 'ready', 'Jürgen')).toBe('warten')
  })

  it('ohne zugehörige Person wird nicht begrüßt, die Vormerkung aber abgeräumt', () => {
    // Sonst poppt die Begrüßung irgendwann später unvermittelt auf.
    for (const status of ['ready', 'no-membership', 'error'] as const) {
      expect(welcomeDecision(true, status, undefined)).toBe('verwerfen')
    }
  })

  it('im Demo-Modus wird ganz normal begrüßt', () => {
    expect(welcomeDecision(true, 'demo', 'Simon')).toEqual({ name: 'Simon' })
  })

  it('ein leerer Vorname zählt nicht als Name', () => {
    expect(welcomeDecision(true, 'ready', '')).toBe('verwerfen')
  })
})
