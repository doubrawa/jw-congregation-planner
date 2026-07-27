import { describe, expect, it } from 'vitest'
import { parseGoTarget } from './deeplink'

describe('parseGoTarget (Push-Deep-Link)', () => {
  it('liest das Ziel aus einem Hash', () => {
    expect(parseGoTarget('#go=aufgaben')).toBe('aufgaben')
    expect(parseGoTarget('#go=planen')).toBe('planen')
  })

  it('liest das Ziel aus einer vollen URL', () => {
    expect(parseGoTarget('https://x.dev/app/#go=aufgaben')).toBe('aufgaben')
  })

  it('ignoriert unbekannte oder fehlende Ziele (inkl. login)', () => {
    expect(parseGoTarget('#go=login')).toBeNull()
    expect(parseGoTarget('#go=quatsch')).toBeNull()
    expect(parseGoTarget('#s=start')).toBeNull()
    expect(parseGoTarget('')).toBeNull()
  })
})
