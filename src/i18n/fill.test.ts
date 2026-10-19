import { describe, expect, it } from 'vitest'
import { fill } from './useT'
import { NBSP } from './zahl-binden'

describe('fill (Platzhalter-Ersetzung)', () => {
  it('ersetzt benannte Platzhalter — die Zahl bleibt bei ihrem Wort (T128)', () => {
    expect(fill('{n} Zuteilungen · {range}', { n: 3, range: '20.–26. Juli' })).toBe(`3${NBSP}Zuteilungen · 20.–26.${NBSP}Juli`)
  })

  it('fehlende Parameter werden zu leerem String', () => {
    expect(fill('Hallo {name}!', {})).toBe('Hallo !')
  })

  it('ohne Platzhalter unverändert; Zahl 0 wird ausgegeben (nicht verschluckt)', () => {
    expect(fill('nichts', { x: 1 })).toBe('nichts')
    expect(fill('{n} offen', { n: 0 })).toBe(`0${NBSP}offen`)
  })
})
