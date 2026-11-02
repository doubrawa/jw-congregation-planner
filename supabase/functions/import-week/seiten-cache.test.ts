import { describe, expect, it } from 'vitest'
import { seitenCache } from './seiten-cache.ts'

/*
 * Der Speicher geholter Seiten in `import-week`: begrenzt in Zeit und Menge.
 * Eine Edge-Instanz lebt Stunden; ohne Grenze wüchse er mit jeder Sprache,
 * jeder Woche, jedem Heft.
 */
describe('seitenCache', () => {
  const mitUhr = (max: number) => {
    let jetzt = 0
    const cache = seitenCache({ max, ttlMs: 1000, jetzt: () => jetzt })
    return { cache, vergehen: (ms: number) => (jetzt += ms) }
  }

  it('hält höchstens `max` Seiten — hinaus fällt, was am längsten keiner brauchte', () => {
    const { cache } = mitUhr(2)
    cache.merken('a', 'A')
    cache.merken('b', 'B')
    cache.merken('c', 'C')
    expect(cache.groesse).toBe(2)
    expect(cache.holen('a')).toBeNull()
    expect([cache.holen('b'), cache.holen('c')]).toEqual(['B', 'C'])
  })

  it('ein Treffer zählt als Gebrauch: Die eben geholte bleibt, die andere geht', () => {
    const { cache } = mitUhr(2)
    cache.merken('a', 'A')
    cache.merken('b', 'B')
    expect(cache.holen('a')).toBe('A')
    cache.merken('c', 'C')
    expect(cache.holen('b')).toBeNull()
    expect(cache.holen('a')).toBe('A')
  })

  it('Abgelaufenes kommt nicht zurück — und belegt danach keinen Platz mehr', () => {
    const { cache, vergehen } = mitUhr(5)
    cache.merken('a', 'A')
    vergehen(999)
    expect(cache.holen('a')).toBe('A')
    vergehen(1)
    expect(cache.holen('a')).toBeNull()
    expect(cache.groesse).toBe(0)
  })

  it('neu geholt gilt die neue Fassung, ab jetzt', () => {
    const { cache, vergehen } = mitUhr(5)
    cache.merken('a', 'alt')
    vergehen(900)
    cache.merken('a', 'neu')
    vergehen(900)
    expect(cache.holen('a')).toBe('neu')
    expect(cache.groesse).toBe(1)
  })
})
