import { describe, expect, it } from 'vitest'
import { generateInviteCode } from './data'

describe('Einladungscodes', () => {
  it('erzeugt 8 Zeichen aus dem eindeutigen Alphabet (ohne 0/O/1/I)', () => {
    for (let i = 0; i < 200; i++) {
      expect(generateInviteCode()).toMatch(/^[A-HJ-NP-Z2-9]{8}$/)
    }
  })
})
