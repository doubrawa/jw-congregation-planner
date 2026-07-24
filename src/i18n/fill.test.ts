import { describe, expect, it } from 'vitest'
import { fill } from './useT'

describe('fill (Platzhalter-Ersetzung)', () => {
  it('ersetzt benannte Platzhalter', () => {
    expect(fill('{n} Zuteilungen · {range}', { n: 3, range: '20.–26. Juli' })).toBe('3 Zuteilungen · 20.–26. Juli')
  })

  it('fehlende Parameter werden zu leerem String', () => {
    expect(fill('Hallo {name}!', {})).toBe('Hallo !')
  })

  it('ohne Platzhalter unverändert; Zahl 0 wird ausgegeben (nicht verschluckt)', () => {
    expect(fill('nichts', { x: 1 })).toBe('nichts')
    expect(fill('{n} offen', { n: 0 })).toBe('0 offen')
  })
})
